import math
import re
import threading
import logging
from typing import Dict, List, Tuple
from urllib.parse import urljoin
import requests
from bs4 import BeautifulSoup
from config import Config

logger = logging.getLogger("LinkWorker.Scraper")
BASE_URL = "https://maharera.maharashtra.gov.in"
SEARCH_ENDPOINT = "/projects-search-result"

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
]

thread_local = threading.local()

def get_thread_session(worker_id: int = 0) -> requests.Session:
    if not hasattr(thread_local, "session"):
        session = requests.Session()
        ua = USER_AGENTS[worker_id % len(USER_AGENTS)]
        session.headers.update({
            "User-Agent": ua,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Connection": "keep-alive"
        })
        adapter = requests.adapters.HTTPAdapter(pool_connections=2, pool_maxsize=2, max_retries=1)
        session.mount("http://", adapter)
        session.mount("https://", adapter)
        thread_local.session = session
    return thread_local.session

def build_district_url(state_id: int, district_id: int, page: int) -> str:
    params = {
        "project_name": "",
        "project_location": "",
        "project_completion_date": "",
        "project_state": state_id,
        "project_district": district_id,
        "carpetAreas": "",
        "completionPercentages": "",
        "project_division": "",
        "page": page,
        "op": "Search",
    }
    req = requests.Request("GET", f"{BASE_URL}{SEARCH_ENDPOINT}", params=params)
    return req.prepare().url

def clean_text(text: str) -> str:
    return " ".join(text.split()).strip() if text else "N/A"

def extract_record_from_element(element, page_num: int, default_district: str) -> dict:
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
    district = default_district
    
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

def parse_html_content(html_content: str, source_page: int, district_name: str) -> List[dict]:
    soup = BeautifulSoup(html_content, "lxml")
    records = []
    
    cards = soup.find_all("div", class_=lambda c: c and "shadow" in c and "bg-body" in c)
    if not cards:
        cards = soup.find_all("div", class_="project-card")
    for card in cards:
        rec = extract_record_from_element(card, source_page, district_name)
        if rec:
            records.append(rec)
            
    if len(records) >= 10:
        return records

    rera_pattern = re.compile(r"P\d{11}")
    for tag in soup.find_all(["div", "tr", "p"]):
        text = tag.get_text()
        m = rera_pattern.search(text)
        if m:
            rec = extract_record_from_element(tag, source_page, district_name)
            if rec and rec not in records:
                records.append(rec)

    return records

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
    return max(total_pages, 1), total_projects

def fetch_page_with_retries(state_id: int, district_id: int, district_name: str, page: int) -> Tuple[bool, List[dict], str]:
    url = build_district_url(state_id, district_id, page)
    session = get_thread_session(0)
    
    for attempt in range(1, Config.MAX_RETRIES + 1):
        try:
            resp = session.get(url, timeout=(Config.CONNECT_TIMEOUT, Config.READ_TIMEOUT))
            if resp.status_code == 200:
                projects = parse_html_content(resp.text, page, district_name)
                return True, projects, ""
            last_err = f"HTTP Status {resp.status_code}"
        except Exception as e:
            last_err = str(e)
    return False, [], last_err