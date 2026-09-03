import glob
import math
import os
import re
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, List, Set, Tuple
from urllib.parse import urljoin

import pandas as pd
import requests
from bs4 import BeautifulSoup
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

# ==========================================
# CONFIGURATION
# ==========================================
BASE_URL = "https://maharera.maharashtra.gov.in"
SEARCH_ENDPOINT = "/projects-search-result"

# Location Identifiers
# NOTE: values are overridable via env vars by scraper_worker/worker.py so this
# script's district-scraping logic below never has to change per district.
STATE_ID = int(os.getenv("SCRAPE_STATE_ID", 27))  # Maharashtra
DISTRICT_ID = int(os.getenv("SCRAPE_DISTRICT_ID", 521))  # Pune
DISTRICT_NAME = os.getenv("SCRAPE_DISTRICT_NAME", "Pune")

# Path to a flag file. If it exists, the running scrape stops at the next
# safe checkpoint (raises KeyboardInterrupt, which main() already handles
# gracefully via its existing try/except/finally save logic below).
STOP_FLAG_PATH = os.getenv("STOP_FLAG_PATH", "")


def check_stop_flag():
    if STOP_FLAG_PATH and os.path.exists(STOP_FLAG_PATH):
        raise KeyboardInterrupt("STOP_REQUESTED via worker")

# Concurrency Parameters
PRIMARY_MAX_WORKERS = 5     # Parallel workers during primary sweep
RECOVERY_MAX_WORKERS = 3    # Parallel workers during network recovery sweep

# Network Timings & Retries
CONNECT_TIMEOUT = 6.0       # Connection timeout in seconds
READ_TIMEOUT = 12.0         # Read timeout in seconds
MAX_RETRIES = 3             # Max retries in recovery phase
RETRY_BACKOFF_FACTOR = 1.2  # Backoff multiplier

# Persistence Parameters
AUTO_SAVE_INTERVAL = 50     # Save to Excel every N processed pages
OUTPUT_FILENAME = os.getenv("SCRAPE_OUTPUT_FILE", "PuneRera3.xlsx")
SHEET_NAME = "Pune Projects"
DEBUG_DIR = "debug_pages"

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_3_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3.1 Safari/605.1.15"
]

thread_local = threading.local()
save_lock = threading.Lock()
seen_keys_lock = threading.Lock()

SEEN_PROJECT_KEYS: Set[str] = set()


# ==========================================
# SAFE SESSION MANAGEMENT
# ==========================================
def get_thread_session(worker_id: int = 0) -> requests.Session:
    if not hasattr(thread_local, "session"):
        session = requests.Session()
        ua = USER_AGENTS[worker_id % len(USER_AGENTS)]
        session.headers.update({
            "User-Agent": ua,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Connection": "keep-alive",
            "Upgrade-Insecure-Requests": "1"
        })
        adapter = requests.adapters.HTTPAdapter(
            pool_connections=2,
            pool_maxsize=2,
            max_retries=1
        )
        session.mount("http://", adapter)
        session.mount("https://", adapter)
        thread_local.session = session
    return thread_local.session


def build_pune_url(page: int) -> str:
    params = {
        "project_name": "",
        "project_location": "",
        "project_completion_date": "",
        "project_state": STATE_ID,
        "project_district": DISTRICT_ID,
        "carpetAreas": "",
        "completionPercentages": "",
        "project_division": "",
        "page": page,
        "op": "Search",
    }
    req = requests.Request("GET", f"{BASE_URL}{SEARCH_ENDPOINT}", params=params)
    prepared = req.prepare()
    return prepared.url


# ==========================================
# PARSER STRATEGIES
# ==========================================
def clean_text(text: str) -> str:
    return " ".join(text.split()).strip() if text else "N/A"


def extract_record_from_element(element, page_num: int) -> dict:
    text = element.get_text()
    
    rera_match = re.search(r'#?\s*([A-Z]{1,2}\d{11})', text)
    rera_id = rera_match.group(1) if rera_match else "N/A"
    
    title_el = element.find(["h4", "h5", "div"], class_=lambda c: c and "title" in str(c).lower())
    project_name = clean_text(title_el.text) if title_el else "N/A"
    if project_name == "N/A":
        strong = element.find("strong")
        if strong:
            project_name = clean_text(strong.text)

    view_link = element.find("a", href=re.compile(r'/public/project/view/\d+'))
    view_url = view_link["href"] if view_link else "N/A"
    if view_url != "N/A" and not view_url.startswith("http"):
        view_url = urljoin(BASE_URL, view_url)
    
    pincode = "N/A"
    district = DISTRICT_NAME
    
    labels = element.find_all(["div", "span", "p"])
    for i, lbl in enumerate(labels):
        lbl_text = clean_text(lbl.text).lower()
        if "pincode" in lbl_text:
            nxt = lbl.find_next_sibling() or (labels[i+1] if i+1 < len(labels) else None)
            if nxt:
                pin_match = re.search(r'\b\d{6}\b', nxt.text)
                if pin_match:
                    pincode = pin_match.group(0)
        elif "district" in lbl_text:
            nxt = lbl.find_next_sibling() or (labels[i+1] if i+1 < len(labels) else None)
            if nxt:
                district = clean_text(nxt.text)

    if pincode == "N/A":
        pin_match = re.search(r'\b(4\d{5})\b', text)
        if pin_match:
            pincode = pin_match.group(0)

    if rera_id != "N/A" or view_url != "N/A":
        return {
            "RERA ID": rera_id,
            "Project Name": project_name,
            "Pincode": pincode,
            "District": district,
            "View Details URL": view_url,
            "Page Number": page_num
        }
    return None


def parse_primary(soup: BeautifulSoup, page_num: int) -> List[dict]:
    records = []
    cards = soup.find_all("div", class_=lambda c: c and "shadow" in c and "bg-body" in c)
    if not cards:
        cards = soup.find_all("div", class_="project-card")
        
    for card in cards:
        record = extract_record_from_element(card, page_num)
        if record:
            records.append(record)
    return records


def parse_fallback_containers(soup: BeautifulSoup, page_num: int) -> List[dict]:
    records = []
    links = soup.find_all("a", href=re.compile(r'/public/project/view/\d+'))
    seen_urls = set()

    for link in links:
        url = link["href"]
        if url in seen_urls:
            continue
        seen_urls.add(url)
        full_url = urljoin(BASE_URL, url) if not url.startswith("http") else url
        
        curr = link
        container = None
        for _ in range(5):
            curr = curr.parent
            if not curr:
                break
            if curr.name == "div" and ("row" in curr.get("class", []) or "card" in curr.get("class", [])):
                container = curr
                break
        
        if container:
            rec = extract_record_from_element(container, page_num)
            if rec and rec["RERA ID"] != "N/A":
                records.append(rec)
                continue
                
        parent_box = link.find_parent(["div", "tr", "li"])
        text = parent_box.get_text() if parent_box else ""
        rera_match = re.search(r'#?\s*([A-Z]{1,2}\d{11})', text)
        
        records.append({
            "RERA ID": rera_match.group(1) if rera_match else "N/A",
            "Project Name": "N/A",
            "Pincode": "N/A",
            "District": DISTRICT_NAME,
            "View Details URL": full_url,
            "Page Number": page_num
        })

    return records


def parse_fallback_rera_ids(html_content: str, page_num: int) -> List[dict]:
    records = []
    matches = re.finditer(r'#?\s*([A-Z]{1,2}\d{11})', html_content)
    seen_ids = set()
    
    for m in matches:
        rid = m.group(1)
        if rid in seen_ids:
            continue
        seen_ids.add(rid)
        
        start = max(0, m.start() - 200)
        end = min(len(html_content), m.end() + 1000)
        snippet = html_content[start:end]
        
        url_match = re.search(r'https?://[^\s"\']*public/project/view/\d+', snippet)
        pin_match = re.search(r'\b(4\d{5})\b', snippet)
        
        records.append({
            "RERA ID": rid,
            "Project Name": "N/A",
            "Pincode": pin_match.group(1) if pin_match else "N/A",
            "District": DISTRICT_NAME,
            "View Details URL": url_match.group(0) if url_match else "N/A",
            "Page Number": page_num
        })
    return records


def parse_projects(html: str, source_page: int) -> List[dict]:
    soup = BeautifulSoup(html, "lxml")
    projects = []
    rera_pattern = re.compile(r"P\d{11}")

    candidate_tags = []
    for tag in soup.find_all(True):
        if tag.name in ["p", "span", "div", "td", "a", "h4", "h5", "b", "strong"]:
            direct_text = "".join(tag.find_all(string=True, recursive=False)).strip()
            if not direct_text:
                direct_text = tag.get_text(strip=True)
            if rera_pattern.search(direct_text):
                if len(rera_pattern.findall(tag.get_text())) == 1:
                    candidate_tags.append(tag)

    unique_card_containers = []
    seen_container_ids = set()

    for tag in candidate_tags:
        curr = tag
        best_container = tag
        while curr and curr.name != "body":
            rera_matches = rera_pattern.findall(curr.get_text())
            if len(rera_matches) == 1:
                best_container = curr
                curr = curr.parent
            else:
                break

        if id(best_container) not in seen_container_ids:
            seen_container_ids.add(id(best_container))
            unique_card_containers.append(best_container)

    for card in unique_card_containers:
        card_text = card.get_text(separator=" ", strip=True)

        rera_match = rera_pattern.search(card_text)
        rera_id = rera_match.group(0) if rera_match else "N/A"

        project_name = "N/A"
        title_elem = card.find(["h4", "h3", "h5", "h2"], class_=re.compile(r"title", re.I))
        if title_elem:
            project_name = title_elem.get_text(strip=True)
        else:
            strong_elem = card.find("strong")
            if strong_elem:
                project_name = strong_elem.get_text(strip=True)
            else:
                h_elem = card.find(["h1", "h2", "h3", "h4", "h5", "h6"])
                if h_elem:
                    project_name = h_elem.get_text(strip=True)

        if project_name != "N/A":
            if rera_id != "N/A" and rera_id in project_name:
                project_name = project_name.replace(f"# {rera_id}", "").replace(rera_id, "").strip(" -:#")
            project_name = re.sub(r"^\#\s*", "", project_name).strip()

        pincode = "N/A"
        for div in card.find_all("div", class_=re.compile(r"greyColor", re.I)):
            if "pincode" in div.get_text(strip=True).lower():
                p_elem = div.find_next_sibling("p")
                if not p_elem and div.parent:
                    p_elem = div.parent.find("p")
                if p_elem:
                    pincode = p_elem.get_text(strip=True)
                    break

        if pincode == "N/A":
            pin_match = re.search(r"\b(4\d{5})\b", card_text)
            if pin_match:
                pincode = pin_match.group(1)

        district = "N/A"
        for div in card.find_all("div", class_=re.compile(r"greyColor", re.I)):
            if "district" in div.get_text(strip=True).lower():
                p_elem = div.find_next_sibling("p")
                if not p_elem and div.parent:
                    p_elem = div.parent.find("p")
                if p_elem:
                    district = p_elem.get_text(strip=True)
                    break

        if district == "N/A":
            district = DISTRICT_NAME

        view_details_url = ""
        link_elem = card.find("a", class_=re.compile(r"viewLink|click-projectmodal", re.I))
        if not link_elem:
            link_elem = card.find("a", href=re.compile(r"public/project/view", re.I))
        if not link_elem:
            link_elem = card.find("a", href=True)

        if link_elem and link_elem.get("href"):
            href = link_elem["href"].strip()
            if href and not href.startswith("#") and "javascript" not in href.lower() and "google.com" not in href:
                view_details_url = urljoin(BASE_URL, href)

        if rera_id != "N/A" or project_name != "N/A" or view_details_url:
            projects.append({
                "RERA ID": rera_id,
                "Project Name": project_name,
                "Pincode": pincode,
                "District": district,
                "View Details URL": view_details_url,
                "Page Number": source_page
            })

    return projects


def parse_html_content(html_content: str, source_page: int) -> List[dict]:
    soup = BeautifulSoup(html_content, "lxml")
    
    # Standard container parser
    records = parse_primary(soup, source_page)
    if len(records) >= 10:
        return records

    # Tree-traversal parser
    records_tree = parse_projects(html_content, source_page)
    if len(records_tree) >= len(records):
        records = records_tree
    if len(records) >= 10:
        return records

    # Link-parent fallback parser
    records_fallback = parse_fallback_containers(soup, source_page)
    if len(records_fallback) > len(records):
        records = records_fallback
    if len(records) >= 10:
        return records

    # Regex RERA ID parser
    records_regex = parse_fallback_rera_ids(html_content, source_page)
    if len(records_regex) > len(records):
        records = records_regex

    return records


# ==========================================
# PARSER & RESPONSE VALIDATION
# ==========================================
def get_pagination_info(html: str) -> Tuple[int, int]:
    soup = BeautifulSoup(html, "lxml")
    total_pages = 1
    total_projects = 0

    pagination_elem = soup.find("span", class_="pagesCount")
    if pagination_elem:
        total_projects = int(pagination_elem.get("data-total", 0))
        pages_text = pagination_elem.parent.get_text(strip=True) if pagination_elem.parent else ""
        match = re.search(r"of\s+(\d+)", pages_text, re.IGNORECASE)
        if match:
            total_pages = int(match.group(1))
        elif total_projects > 0:
            current_per_page = int(pagination_elem.get("data-current-data", 10))
            if current_per_page > 0:
                total_pages = math.ceil(total_projects / current_per_page)

    return total_pages, total_projects


def validate_response(html: str, page: int, total_pages: int) -> Tuple[bool, str, str]:
    if not html or len(html.strip()) < 500:
        return False, "EMPTY_PAYLOAD", "Empty or truncated HTML payload"

    if "projects-search-result" not in html and "maharera" not in html.lower():
        return False, "INVALID_LAYOUT", "HTML lacks MahaRERA search layout signature"

    soup = BeautifulSoup(html, "lxml")
    rera_pattern = re.compile(r"P\d{11}")
    rera_matches = rera_pattern.findall(html)

    if not rera_matches:
        no_data_msg = soup.find(string=re.compile(r"no (data|records|projects) found", re.I))
        if no_data_msg or page == total_pages:
            return True, "GENUINE_EMPTY", "Genuinely empty page verified"
        return False, "ZERO_RECORDS_PARSED", "HTTP 200 received but zero project records found in body"

    return True, "VALID_HTML", f"Valid HTML ({len(rera_matches)} potential RERA references detected)"


# ==========================================
# FETCH ENGINE
# ==========================================
def get_debug_filepath(page_num: int) -> str:
    return os.path.join(DEBUG_DIR, f"page_{page_num:04d}.html")


def save_debug_page(page: int, html_content: str, reason: str):
    if not os.path.exists(DEBUG_DIR):
        os.makedirs(DEBUG_DIR, exist_ok=True)
    
    filepath = get_debug_filepath(page)
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(f"<!-- FAILURE REASON: {reason} -->\n")
        f.write(html_content if html_content else "NO HTML CONTENT RECEIVED")


def fetch_and_validate_page(
    page: int, 
    total_pages: int, 
    worker_id: int = 0, 
    max_retries: int = MAX_RETRIES,
    backoff_multiplier: float = RETRY_BACKOFF_FACTOR
) -> Tuple[bool, List[dict], str, str, str]:
    url = build_pune_url(page)
    session = get_thread_session(worker_id)
    last_category = "UNKNOWN_ERROR"
    last_reason = "Unknown Error"
    last_html = ""

    for attempt in range(1, max_retries + 1):
        try:
            response = session.get(url, timeout=(CONNECT_TIMEOUT, READ_TIMEOUT))
            if response.status_code != 200:
                last_category = "HTTP_ERROR"
                last_reason = f"HTTP status code {response.status_code}"
            else:
                last_html = response.text
                is_valid, category, validation_msg = validate_response(last_html, page, total_pages)
                if not is_valid:
                    last_category = category
                    last_reason = f"Validation failed: {validation_msg}"
                else:
                    projects = parse_html_content(last_html, page)
                    if len(projects) == 0 and page != total_pages:
                        last_category = "ZERO_RECORDS_PARSED"
                        last_reason = "Parsed 0 projects from valid HTML signature"
                    else:
                        return True, projects, "SUCCESS", "SUCCESS", last_html

        except requests.exceptions.Timeout:
            last_category = "TIMEOUT"
            last_reason = "Request timed out"
        except requests.RequestException as e:
            last_category = "CONNECTION_ERROR"
            last_reason = f"Network Exception: {str(e)}"
        except Exception as e:
            last_category = "UNEXPECTED_ERROR"
            last_reason = f"Unexpected Error: {str(e)}"

        if attempt < max_retries:
            sleep_time = (backoff_multiplier ** attempt) + (worker_id * 0.1)
            time.sleep(sleep_time)

    return False, [], last_category, last_reason, last_html


# ==========================================
# AUTOMATED DISK RECOVERY PHASE
# ==========================================
def process_saved_debug_pages() -> Dict[int, List[dict]]:
    """Scans and parses any saved HTML debug files automatically."""
    files = glob.glob(os.path.join(DEBUG_DIR, "page_*.html"))
    if not files:
        return {}

    print("\n" + "-" * 60)
    print(f"PHASE 3: Automatic Disk Recovery for {len(files)} local debug HTML files...")
    print("-" * 60)

    recovered_results = {}
    recovered_count = 0

    for filepath in files:
        filename = os.path.basename(filepath)
        match = re.search(r'page_(\d+)\.html', filename)
        if not match:
            continue
        
        page_num = int(match.group(1))
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                content = f.read()

            records = parse_html_content(content, page_num)
            if records:
                recovered_results[page_num] = records
                recovered_count += len(records)
                print(f"  [DISK RECOVERED] Page {page_num:4d}: Extracted {len(records)} records")
                os.remove(filepath)  # Clean up successfully parsed debug file
        except Exception as e:
            print(f"  [DISK ERROR] Page {page_num:4d}: Failed reading file ({e})")

    print(f"Disk Recovery Complete. Total projects parsed from local files: {recovered_count}\n")
    return recovered_results


# ==========================================
# INCREMENTAL DEDUPLICATING EXCEL PERSISTENCE
# ==========================================
def save_incremental_to_excel(
    all_page_results: Dict[int, List[dict]], 
    filename: str = OUTPUT_FILENAME, 
    sheet_name: str = SHEET_NAME
) -> int:
    with save_lock:
        sorted_pages = sorted(all_page_results.keys())
        new_records_to_add = []

        with seen_keys_lock:
            for page in sorted_pages:
                for proj in all_page_results[page]:
                    rera_id = proj.get("RERA ID", "N/A")
                    url = proj.get("View Details URL", "")
                    
                    key = rera_id if rera_id != "N/A" else url
                    if key and key not in SEEN_PROJECT_KEYS:
                        SEEN_PROJECT_KEYS.add(key)
                        new_records_to_add.append(proj)

        headers = ["RERA ID", "Project Name", "Pincode", "District", "View Details URL", "Page Number"]
        file_exists = os.path.exists(filename)
        
        if file_exists:
            wb = load_workbook(filename)
            ws = wb[sheet_name] if sheet_name in wb.sheetnames else wb.active
        else:
            wb = Workbook()
            ws = wb.active
            ws.title = sheet_name

            ws.append(headers)
            header_fill = PatternFill(start_color="1F4E78", end_color="1F4E78", fill_type="solid")
            header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
            center_align = Alignment(horizontal="center", vertical="center")

            for col_idx, header in enumerate(headers, 1):
                cell = ws.cell(row=1, column=col_idx)
                cell.fill = header_fill
                cell.font = header_font
                cell.alignment = center_align

        data_font = Font(name="Calibri", size=10)
        center_align = Alignment(horizontal="center", vertical="center")
        left_align = Alignment(horizontal="left", vertical="center")

        for record in new_records_to_add:
            row_data = [record.get(h, "N/A") for h in headers]
            ws.append(row_data)
            
            row_idx = ws.max_row
            for col_idx in range(1, len(headers) + 1):
                cell = ws.cell(row=row_idx, column=col_idx)
                cell.font = data_font
                cell.alignment = center_align if headers[col_idx - 1] in ["RERA ID", "Pincode", "District", "Page Number"] else left_align

        for col in ws.columns:
            max_len = max(len(str(cell.value or "")) for cell in col)
            col_letter = get_column_letter(col[0].column)
            ws.column_dimensions[col_letter].width = max(max_len + 3, 12)

        ws.freeze_panes = "A2"
        ws.auto_filter.ref = ws.dimensions
        wb.save(filename)

        return len(new_records_to_add)


def load_existing_keys_from_excel(filename: str = OUTPUT_FILENAME, sheet_name: str = SHEET_NAME):
    if os.path.exists(filename):
        try:
            df = pd.read_excel(filename, sheet_name=sheet_name)
            with seen_keys_lock:
                for _, row in df.iterrows():
                    rera_id = str(row.get("RERA ID", "")).strip()
                    url = str(row.get("View Details URL", "")).strip()
                    key = rera_id if rera_id and rera_id != "N/A" else url
                    if key:
                        SEEN_PROJECT_KEYS.add(key)
            print(f"Loaded {len(SEEN_PROJECT_KEYS)} existing unique keys from {filename}")
        except Exception as e:
            print(f"Notice: Could not pre-load existing keys: {e}")


# ==========================================
# MAIN EXECUTION
# ==========================================
def main():
    print("=" * 60)
    print(f"Starting MahaRERA Scraper for District: {DISTRICT_NAME}")
    print("=" * 60)

    load_existing_keys_from_excel()

    print("Establishing session & discovering total pages...")
    first_page_url = build_pune_url(page=1)

    try:
        session = get_thread_session(0)
        resp = session.get(first_page_url, timeout=(CONNECT_TIMEOUT, READ_TIMEOUT))
        resp.raise_for_status()
        first_page_html = resp.text
    except Exception as e:
        print(f"CRITICAL ERROR: Failed to connect to MahaRERA search endpoint: {e}")
        return

    total_pages, total_projects_reported = get_pagination_info(first_page_html)
    total_pages = max(total_pages, 1)

    print(f"Reported Total Projects : {total_projects_reported if total_projects_reported else 'Unknown'}")
    print(f"Reported Total Pages    : {total_pages}")
    print("-" * 60)

    page_results: Dict[int, List[dict]] = {}
    page_status: Dict[int, str] = {}
    completed_count = 0
    total_parsed_so_far = 0
    recovered_count = 0
    pages_to_fetch = list(range(1, total_pages + 1))

    try:
        # ---------------------------------------------------------
        # PHASE 1: CONCURRENT HTTP SWEEP WITH AUTO-SAVE
        # ---------------------------------------------------------
        print(f"PHASE 1: Concurrent sweep using PRIMARY_MAX_WORKERS={PRIMARY_MAX_WORKERS}...")
        
        with ThreadPoolExecutor(max_workers=PRIMARY_MAX_WORKERS) as executor:
            futures = {
                executor.submit(fetch_and_validate_page, page, total_pages, idx % PRIMARY_MAX_WORKERS): page 
                for idx, page in enumerate(pages_to_fetch)
            }

            for future in as_completed(futures):
                check_stop_flag()
                page = futures[future]
                success, projects, category, reason, raw_html = future.result()
                completed_count += 1

                if success and (len(projects) > 0 or page == total_pages):
                    page_results[page] = projects
                    page_status[page] = "SUCCESS"
                    total_parsed_so_far += len(projects)
                else:
                    page_results[page] = []
                    page_status[page] = f"SUSPICIOUS ({reason})"

                if completed_count % AUTO_SAVE_INTERVAL == 0 or completed_count == total_pages:
                    new_added = save_incremental_to_excel(page_results)
                    pct = (completed_count / total_pages) * 100
                    print(f"Progress: [{completed_count}/{total_pages}] ({pct:.1f}%) | Extracted: {total_parsed_so_far} | Saved to Excel: +{new_added}")

        # ---------------------------------------------------------
        # PHASE 2: NETWORK RECOVERY FOR SUSPICIOUS/FAILED PAGES
        # ---------------------------------------------------------
        suspicious_pages = [
            p for p in range(1, total_pages + 1) 
            if page_status.get(p) != "SUCCESS" or (len(page_results.get(p, [])) < 10 and p != total_pages)
        ]

        if suspicious_pages:
            print("\n" + "-" * 60)
            print(f"PHASE 2: Accelerated Recovery Phase for {len(suspicious_pages)} failed/suspicious pages...")
            print(f"Running in parallel with RECOVERY_MAX_WORKERS={RECOVERY_MAX_WORKERS}...")

            if hasattr(thread_local, "session"):
                delattr(thread_local, "session")

            rec_completed = 0
            with ThreadPoolExecutor(max_workers=RECOVERY_MAX_WORKERS) as rec_executor:
                rec_futures = {
                    rec_executor.submit(
                        fetch_and_validate_page, 
                        page, 
                        total_pages, 
                        idx % RECOVERY_MAX_WORKERS,
                        max_retries=3,
                        backoff_multiplier=1.5
                    ): page 
                    for idx, page in enumerate(suspicious_pages)
                }

                for rec_future in as_completed(rec_futures):
                    page = rec_futures[rec_future]
                    success, projects, category, reason, raw_html = rec_future.result()
                    rec_completed += 1

                    if success and (len(projects) > 0 or page == total_pages):
                        page_results[page] = projects
                        page_status[page] = "RECOVERED"
                        recovered_count += 1
                        print(f"  [RECOVERED] Page {page:4d}: Retrieved {len(projects)} projects")
                    else:
                        page_status[page] = f"PERMANENT_FAILURE ({reason})"
                        print(f"  [FAILED]    Page {page:4d}: Category [{category}] - {reason}")
                        save_debug_page(page, raw_html, reason)

                    if rec_completed % 20 == 0 or rec_completed == len(suspicious_pages):
                        save_incremental_to_excel(page_results)

        # ---------------------------------------------------------
        # PHASE 3: AUTOMATED DISK RECOVERY FROM DEBUG_PAGES
        # ---------------------------------------------------------
        disk_recovered_results = process_saved_debug_pages()
        if disk_recovered_results:
            for p, records in disk_recovered_results.items():
                page_results[p] = records
                page_status[p] = "DISK_RECOVERED"

    except KeyboardInterrupt:
        print("\n\n>>> Process interrupted by user (Ctrl+C)! Preserving and saving data collected so far...")

    finally:
        print("\n" + "-" * 60)
        print("Finalizing dataset & saving to Excel...")

        newly_saved = save_incremental_to_excel(page_results)

        pages_with_10 = 0
        pages_with_fewer = 0
        pages_with_0 = 0
        permanently_failed_pages = []

        for page in range(1, total_pages + 1):
            if page not in page_results:
                continue
            projects = page_results.get(page, [])
            p_count = len(projects)

            if p_count == 10:
                pages_with_10 += 1
            elif p_count > 0:
                pages_with_fewer += 1
            else:
                pages_with_0 += 1
                permanently_failed_pages.append(page)

        print("\n" + "=" * 60)
        print("PAGE-LEVEL DIAGNOSTIC SUMMARY")
        print("=" * 60)
        print(f"Pages with 10 projects       : {pages_with_10}")
        print(f"Pages with fewer projects    : {pages_with_fewer}")
        print(f"Pages with 0 projects        : {pages_with_0}")
        print(f"Pages recovered during retry : {recovered_count}")
        print(f"Pages permanently failed     : {len(permanently_failed_pages)}")
        if permanently_failed_pages:
            print(f"Unrecovered Page Numbers     : {permanently_failed_pages}")

        print("\n" + "=" * 60)
        print("FINAL SCRAPING SUMMARY")
        print("=" * 60)
        print(f"Total Pages Processed           : {len(page_results)} / {total_pages}")
        print(f"Total Unique Projects Saved     : {len(SEEN_PROJECT_KEYS)}")
        print(f"Newly Added Records in Run      : {newly_saved}")
        print(f"Output Excel Filename           : {OUTPUT_FILENAME}")
        print("=" * 60)


if __name__ == "__main__":
    main()