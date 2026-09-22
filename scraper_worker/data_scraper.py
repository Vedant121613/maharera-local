import os
import re
import time
import json
import base64
import sqlite3
import openpyxl
import requests
import pandas as pd
import concurrent.futures
from datetime import datetime

import ddddocr

from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager

# ============================================================
# PRODUCTION CONFIGURATION
# ============================================================
MAX_BROWSER_WORKERS = 5           # Default production worker pool count
RECOVERY_WORKERS = 1              # Worker pool count for recovery pass

# NOTE: values are overridable via env vars by scraper_worker/worker.py so
# this script's scraping/CAPTCHA/extraction logic below never has to change
# per district. worker.py points INPUT_EXCEL at a district-only export it
# pulled from the backend (so only that district's projects are processed).
INPUT_EXCEL = os.getenv("SCRAPE_INPUT_FILE", "PuneRera3.xlsx")
OUTPUT_EXCEL = os.getenv("SCRAPE_OUTPUT_FILE", "PuneBasicProjectData.xlsx")
FAILURES_EXCEL = os.getenv("SCRAPE_FAILURES_FILE", "PuneBasicProjectData_Failures.xlsx")
DB_FILE = os.getenv("SCRAPE_DB_FILE", "PuneBasicProjectData.db")
DISTRICT_NAME = os.getenv("SCRAPE_DISTRICT_NAME", "Pune")

# Path to a flag file. If it exists, no new projects are dispatched to
# workers and the current pass winds down at its next safe checkpoint.
STOP_FLAG_PATH = os.getenv("STOP_FLAG_PATH", "")


def check_stop_flag() -> bool:
    return bool(STOP_FLAG_PATH and os.path.exists(STOP_FLAG_PATH))

API_BASE_PATH = "https://maharerait.maharashtra.gov.in/api/maha-rera-public-view-project-registration-service/public/projectregistartion/"

MAX_CAPTCHA_RETRIES = 10
PROJECT_TIMEOUT_SECONDS = 90
HTTP_TIMEOUT = (10, 30)

MAX_API_RETRIES = 2
MAX_PROJECT_RETRIES = 2

OUTPUT_COLUMNS = [
    "RERA ID",
    "Project ID",
    "Registration Number",
    "Date of Registration",
    "Project Name",
    "Proposed Completion Date (Original)",
    "Address",
    "Street Name",
    "Locality",
    "State/UT",
    "District",
    "Taluka",
    "Village",
    "Pin Code",
    "Longitude",
    "Latitude",
    "View Details URL",
    "Page Number"
]

# Complete schema mapping required by application queries/inserts
REQUIRED_SCHEMA = [
    ("source_row", "INTEGER"),
    ("rera_id", "TEXT"),
    ("project_id", "TEXT PRIMARY KEY"),
    ("registration_number", "TEXT"),
    ("date_of_registration", "TEXT"),
    ("project_name", "TEXT"),
    ("proposed_completion_date_original", "TEXT"),
    ("address", "TEXT"),
    ("street_name", "TEXT"),
    ("locality", "TEXT"),
    ("state_ut", "TEXT"),
    ("district", "TEXT"),
    ("taluka", "TEXT"),
    ("village", "TEXT"),
    ("pin_code", "TEXT"),
    ("longitude", "TEXT"),
    ("latitude", "TEXT"),
    ("view_details_url", "TEXT"),
    ("page_number", "TEXT"),
    ("status", "TEXT"),
    ("attempts", "INTEGER DEFAULT 0"),
    ("failed_stage", "TEXT"),
    ("failed_api", "TEXT"),
    ("http_status", "INTEGER"),
    ("error_message", "TEXT"),
    ("execution_time_sec", "REAL"),
    ("created_at", "TIMESTAMP"),
    ("updated_at", "TIMESTAMP")
]

# Initialize OCR Engine globally (ddddocr inference is thread-safe)
ocr = ddddocr.DdddOcr(show_ad=False)

# ============================================================
# AUTHORITATIVE SQLITE DATABASE ENGINE & SCHEMA MIGRATION
# ============================================================

def init_sqlite_db():
    """Initializes schema and dynamically migrates PuneBasicProjectData.db if missing columns exist."""
    print("[DB] Checking database schema...")
    conn = sqlite3.connect(DB_FILE, timeout=60.0)
    cursor = conn.cursor()

    # 1. Create table if missing entirely
    columns_sql = ", ".join([f"{col} {col_type}" for col, col_type in REQUIRED_SCHEMA])
    cursor.execute(f"CREATE TABLE IF NOT EXISTS projects ({columns_sql})")
    conn.commit()

    # 2. Inspect existing schema
    cursor.execute("PRAGMA table_info(projects)")
    pragma_rows = cursor.fetchall()
    existing_columns = {row[1] for row in pragma_rows}

    print(f"[DB] Existing columns: {len(existing_columns)}")

    # 3. Detect missing required columns
    missing_columns = [item for item in REQUIRED_SCHEMA if item[0] not in existing_columns]
    print(f"[DB] Missing columns detected: {len(missing_columns)}")

    # 4. Migrate missing columns using ALTER TABLE
    if missing_columns:
        for col_name, col_type in missing_columns:
            # Clean type definition for ALTER TABLE (strip constraints like PRIMARY KEY or DEFAULT if necessary)
            base_type = col_type.split()[0]
            if "DEFAULT" in col_type.upper():
                default_part = col_type[col_type.upper().find("DEFAULT"):]
                alter_type = f"{base_type} {default_part}"
            else:
                alter_type = base_type

            alter_stmt = f"ALTER TABLE projects ADD COLUMN {col_name} {alter_type}"
            cursor.execute(alter_stmt)
            print(f"[DB] Added column: {col_name} {alter_type}")
        conn.commit()
        print("[DB] Schema migration complete.")
    else:
        print("[DB] Schema already up to date.")

    # 5. Ensure indices exist
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_project_id ON projects(project_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_status ON projects(status)")
    conn.commit()
    conn.close()


def sync_input_to_db(df_input):
    """Syncs PuneRera3.xlsx rows to SQLite database preserving source order."""
    conn = sqlite3.connect(DB_FILE, timeout=60.0)
    cursor = conn.cursor()
    now = datetime.now().isoformat()

    inserted_count = 0
    for idx, row in df_input.iterrows():
        rera_id = str(row.get("RERA ID", "")).strip() if pd.notna(row.get("RERA ID")) else "NOT FOUND"
        view_url = str(row.get("View Details URL", "")).strip() if pd.notna(row.get("View Details URL")) else ""
        page_num = str(row.get("Page Number", "")).strip() if pd.notna(row.get("Page Number")) else ""

        match = re.search(r'/(\d+)(?:[?#].*)?$', view_url)
        project_id = match.group(1) if match else None

        if not project_id:
            continue

        cursor.execute("SELECT status FROM projects WHERE project_id = ?", (project_id,))
        existing = cursor.fetchone()

        if not existing:
            cursor.execute("""
                INSERT INTO projects (
                    source_row, rera_id, project_id, view_details_url, page_number,
                    status, attempts, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, 'PENDING', 0, ?, ?)
            """, (idx + 1, rera_id, project_id, view_url, page_num, now, now))
            inserted_count += 1

    conn.commit()
    conn.close()
    return inserted_count


def save_project_to_db(record_dict):
    """Thread-safe atomic upsert of a single project record in SQLite."""
    conn = sqlite3.connect(DB_FILE, timeout=60.0)
    cursor = conn.cursor()
    now = datetime.now().isoformat()

    cursor.execute("""
        INSERT INTO projects (
            source_row, rera_id, project_id, registration_number, date_of_registration,
            project_name, proposed_completion_date_original, address, street_name, locality,
            state_ut, district, taluka, village, pin_code, longitude, latitude,
            view_details_url, page_number, status, attempts, failed_stage, failed_api,
            http_status, error_message, execution_time_sec, created_at, updated_at
        ) VALUES (
            :source_row, :rera_id, :project_id, :registration_number, :date_of_registration,
            :project_name, :proposed_completion_date_original, :address, :street_name, :locality,
            :state_ut, :district, :taluka, :village, :pin_code, :longitude, :latitude,
            :view_details_url, :page_number, :status, :attempts, :failed_stage, :failed_api,
            :http_status, :error_message, :execution_time_sec, :created_at, :updated_at
        )
        ON CONFLICT(project_id) DO UPDATE SET
            registration_number = excluded.registration_number,
            date_of_registration = excluded.date_of_registration,
            project_name = excluded.project_name,
            proposed_completion_date_original = excluded.proposed_completion_date_original,
            address = excluded.address,
            street_name = excluded.street_name,
            locality = excluded.locality,
            state_ut = excluded.state_ut,
            district = excluded.district,
            taluka = excluded.taluka,
            village = excluded.village,
            pin_code = excluded.pin_code,
            longitude = excluded.longitude,
            latitude = excluded.latitude,
            status = excluded.status,
            attempts = excluded.attempts,
            failed_stage = excluded.failed_stage,
            failed_api = excluded.failed_api,
            http_status = excluded.http_status,
            error_message = excluded.error_message,
            execution_time_sec = excluded.execution_time_sec,
            updated_at = excluded.updated_at
    """, {**record_dict, "updated_at": now, "created_at": now})

    conn.commit()
    conn.close()

# ============================================================
# BROWSER & CAPTCHA ENGINE INITIALIZATION
# ============================================================

def create_driver():
    """Builds an isolated Selenium Chrome WebDriver instance per worker."""
    print("[DRIVER] Creating Chrome WebDriver with headless configuration...")
    chrome_options = Options()
    # Headless mode for server environment
    chrome_options.add_argument("--headless=new")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("--disable-software-rasterizer")
    chrome_options.add_argument("--window-size=1920,1080")
    print("[DRIVER] Headless mode enabled with window size 1920x1080")
    # Disable images for faster loading
    chrome_options.add_experimental_option(
        "prefs", {
            "profile.managed_default_content_settings.images": 2,
        }
    )
    chrome_options.set_capability("goog:loggingPrefs", {"performance": "ALL"})
    print("[DRIVER] Image loading disabled for performance")

    try:
        driver = webdriver.Chrome(
            service=Service(ChromeDriverManager().install()),
            options=chrome_options
        )
        print("[DRIVER] Chrome WebDriver created successfully")
        return driver
    except Exception as e:
        print(f"[DRIVER] ERROR: Failed to create Chrome WebDriver: {e}")
        raise


def get_captcha_text(driver):
    try:
        canvas = WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.ID, "captcahCanvas"))
        )
        time.sleep(0.5)

        img_base64 = driver.execute_script(
            "return arguments[0].toDataURL('image/png').substring(21);",
            canvas
        )

        img_bytes = base64.b64decode(img_base64)
        raw_result = ocr.classification(img_bytes)
        captcha_code = re.sub(r"[^A-Za-z0-9]", "", raw_result).upper()

        return captcha_code if len(captcha_code) == 6 else None
    except Exception:
        return None


def refresh_captcha_element(driver):
    try:
        errors = driver.find_elements(By.CSS_SELECTOR, "button.btn-primary-messagebox")
        if errors:
            errors[0].click()
            time.sleep(0.5)

        cpt_btn = driver.find_elements(By.CSS_SELECTOR, "a.cpt-btn")
        if cpt_btn:
            driver.execute_script("arguments[0].click();", cpt_btn[0])
            time.sleep(1)
    except Exception:
        pass


def solve_captcha_step_with_retries(driver):
    for attempt in range(1, MAX_CAPTCHA_RETRIES + 1):
        captcha_code = get_captcha_text(driver)

        if not captcha_code:
            refresh_captcha_element(driver)
            continue

        try:
            input_box = WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.NAME, "captcha"))
            )

            driver.execute_script(
                """
                var el = arguments[0];
                el.value = arguments[1];
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
                """,
                input_box,
                captcha_code
            )

            time.sleep(0.5)
            driver.execute_script("document.querySelector('button.next').click();")
            time.sleep(2)

            success_check = driver.find_elements(By.XPATH, "//*[contains(text(), 'Project Name')]")
            errors = driver.find_elements(By.CSS_SELECTOR, "button.btn-primary-messagebox")

            if success_check or len(driver.find_elements(By.XPATH, "//*[contains(text(), 'Project Name')]")) > 0:
                return True
            elif errors:
                refresh_captcha_element(driver)
            else:
                refresh_captcha_element(driver)
        except Exception:
            refresh_captcha_element(driver)

    return False

# ============================================================
# NETWORK LOG CAPTURE & HTTP SESSION
# ============================================================

def extract_network_bearer_token(driver_instance):
    try:
        logs = driver_instance.get_log("performance")
        for entry in reversed(logs):
            try:
                log_data = json.loads(entry["message"])
                message = log_data.get("message", {})
                if message.get("method") == "Network.requestWillBeSent":
                    request = message.get("params", {}).get("request", {})
                    headers = request.get("headers", {})
                    for key, val in headers.items():
                        if key.lower() == "authorization" and str(val).startswith("Bearer "):
                            return str(val)
            except Exception:
                continue
    except Exception:
        pass
    return None


def create_authenticated_http_session(driver_instance):
    session = requests.Session()
    user_agent = driver_instance.execute_script("return navigator.userAgent;")

    session.headers.update({
        "User-Agent": user_agent,
        "Accept": "application/json, text/plain, */*",
        "Content-Type": "application/json",
        "Origin": "https://maharerait.maharashtra.gov.in",
        "Referer": driver_instance.current_url,
        "X-Requested-With": "XMLHttpRequest"
    })

    for cookie in driver_instance.get_cookies():
        session.cookies.set(cookie['name'], cookie['value'], domain=cookie.get('domain'))

    bearer_token = extract_network_bearer_token(driver_instance)
    if bearer_token:
        session.headers.update({"Authorization": bearer_token})

    return session


def make_api_post(session, endpoint_name, project_id):
    url = f"{API_BASE_PATH}{endpoint_name}"
    payload = {"projectId": str(project_id)}

    for attempt in range(1, MAX_API_RETRIES + 1):
        try:
            response = session.post(url, json=payload, timeout=HTTP_TIMEOUT)
            status_code = response.status_code

            if status_code == 200:
                try:
                    data = response.json()
                    return status_code, data
                except Exception:
                    return status_code, None
            elif status_code in [401, 403]:
                return status_code, None

        except requests.exceptions.Timeout:
            if attempt == MAX_API_RETRIES:
                return 408, None
        except Exception:
            if attempt == MAX_API_RETRIES:
                return 500, None

        time.sleep(1)

    return 500, None

# ============================================================
# RECURSIVE FIELD PARSER
# ============================================================

def find_all_occurrences_and_paths(data, target_key, current_path="responseObject"):
    matches = []
    if isinstance(data, dict):
        for k, v in data.items():
            new_path = f"{current_path}.{k}"
            if k == target_key:
                matches.append((new_path, v))
            if isinstance(v, (dict, list)):
                matches.extend(find_all_occurrences_and_paths(v, target_key, new_path))
    elif isinstance(data, list):
        for idx, item in enumerate(data):
            new_path = f"{current_path}[{idx}]"
            if isinstance(item, (dict, list)):
                matches.extend(find_all_occurrences_and_paths(item, target_key, new_path))
    return matches


def get_first_valid_value(data, target_keys):
    if isinstance(target_keys, str):
        target_keys = [target_keys]

    for key in target_keys:
        occurrences = find_all_occurrences_and_paths(data, key)
        for path, val in occurrences:
            if val not in [None, "", "null", "N/A", "NA", "NONE", "NULL"]:
                return val
    return None


def clean_val(value):
    if value is None or pd.isna(value):
        return "NOT FOUND"
    text = str(value).strip()
    if text == "" or text.upper() in ["N/A", "NA", "NONE", "NULL", "NAN", "UNDEFINED"]:
        return "NOT FOUND"
    return text


def parse_general_details(data):
    if not data:
        return {k: "NOT FOUND" for k in ["Registration Number", "Date of Registration", "Project Name", "Proposed Completion Date (Original)"]}

    return {
        "Registration Number": clean_val(get_first_valid_value(data, ["projectRegistartionNo", "registrationNo", "reraRegistrationNo"])),
        "Date of Registration": clean_val(get_first_valid_value(data, ["reraRegistrationDate", "registrationDate", "approvedDate"])),
        "Project Name": clean_val(get_first_valid_value(data, ["projectName", "name"])),
        "Proposed Completion Date (Original)": clean_val(get_first_valid_value(data, ["originalProjectProposeCompletionDate", "proposedCompletionDate"]))
    }


def parse_land_address_details(data):
    if not data:
        return {k: "NOT FOUND" for k in ["Address", "Street Name", "Locality", "State/UT", "District", "Taluka", "Village", "Pin Code"]}

    return {
        "Address": clean_val(get_first_valid_value(data, ["addressLine", "address", "projectAddress", "siteAddress"])),
        "Street Name": clean_val(get_first_valid_value(data, ["street", "streetName"])),
        "Locality": clean_val(get_first_valid_value(data, ["locality", "location"])),
        "State/UT": clean_val(get_first_valid_value(data, ["stateName", "state", "stateUt"])),
        "District": clean_val(get_first_valid_value(data, ["districtName", "district"])),
        "Taluka": clean_val(get_first_valid_value(data, ["talukaName", "taluka", "subDistrict"])),
        "Village": clean_val(get_first_valid_value(data, ["villageName", "village"])),
        "Pin Code": clean_val(get_first_valid_value(data, ["pinCode", "pincode", "postalCode"]))
    }


def parse_geotagging_details(data):
    if not data:
        return {"Longitude": "NOT FOUND", "Latitude": "NOT FOUND"}

    return {
        "Longitude": clean_val(get_first_valid_value(data, ["longitude", "long", "lng"])),
        "Latitude": clean_val(get_first_valid_value(data, ["latitude", "lat"]))
    }

# ============================================================
# INDEPENDENT WORKER SCRAPING TASK
# ============================================================

def process_single_project_task(worker_id, project_row):
    """Encapsulates a single project execution cycle with browser cleanup."""
    start_time = time.time()
    project_id = project_row["project_id"]
    view_url = project_row["view_details_url"]
    current_attempts = project_row.get("attempts", 0) + 1

    record = {
        "source_row": project_row["source_row"],
        "rera_id": project_row["rera_id"],
        "project_id": project_id,
        "registration_number": "NOT FOUND",
        "date_of_registration": "NOT FOUND",
        "project_name": "NOT FOUND",
        "proposed_completion_date_original": "NOT FOUND",
        "address": "NOT FOUND",
        "street_name": "NOT FOUND",
        "locality": "NOT FOUND",
        "state_ut": "NOT FOUND",
        "district": "NOT FOUND",
        "taluka": "NOT FOUND",
        "village": "NOT FOUND",
        "pin_code": "NOT FOUND",
        "longitude": "NOT FOUND",
        "latitude": "NOT FOUND",
        "view_details_url": view_url,
        "page_number": project_row["page_number"],
        "status": "FAILED",
        "attempts": current_attempts,
        "failed_stage": None,
        "failed_api": None,
        "http_status": None,
        "error_message": None,
        "execution_time_sec": 0.0
    }

    driver = None
    http_session = None
    try:
        print(f"[WORKER-{worker_id}] Starting project {project_id} (RERA: {project_row['rera_id']}, attempt {current_attempts}/{MAX_PROJECT_RETRIES})")
        print(f"[WORKER-{worker_id}] URL: {view_url}")
        
        driver = create_driver()
        print(f"[WORKER-{worker_id}] Loading project page...")
        driver.get(view_url)
        print(f"[WORKER-{worker_id}] Page loaded, solving CAPTCHA...")

        captcha_success = solve_captcha_step_with_retries(driver)
        if not captcha_success:
            print(f"[WORKER-{worker_id}] CAPTCHA failed after retries")
            record.update({
                "status": "RETRY" if current_attempts < MAX_PROJECT_RETRIES else "FAILED",
                "failed_stage": "CAPTCHA",
                "error_message": "CAPTCHA_FAILED"
            })
            record["execution_time_sec"] = round(time.time() - start_time, 2)
            return record, worker_id
        
        print(f"[WORKER-{worker_id}] CAPTCHA solved! Creating authenticated session...")
        http_session = create_authenticated_http_session(driver)
        print(f"[WORKER-{worker_id}] Session created, fetching project data via APIs...")

        # 1. General Details API
        print(f"[WORKER-{worker_id}] Calling API: getProjectGeneralDetailsByProjectId...")
        gen_status, gen_raw = make_api_post(http_session, "getProjectGeneralDetailsByProjectId", project_id)
        if gen_status != 200 or not gen_raw:
            print(f"[WORKER-{worker_id}] General Details API failed (HTTP {gen_status})")
            record.update({
                "status": "RETRY" if current_attempts < MAX_PROJECT_RETRIES else "FAILED",
                "failed_stage": "API",
                "failed_api": "getProjectGeneralDetailsByProjectId",
                "http_status": gen_status,
                "error_message": f"API_{gen_status}" if gen_status != 200 else "PARSE_ERROR"
            })
            record["execution_time_sec"] = round(time.time() - start_time, 2)
            return record, worker_id
        print(f"[WORKER-{worker_id}] General Details API: OK")

        # 2. Land Address API
        print(f"[WORKER-{worker_id}] Calling API: getProjectLandAddressDetails...")
        land_status, land_raw = make_api_post(http_session, "getProjectLandAddressDetails", project_id)
        if land_status != 200 or not land_raw:
            print(f"[WORKER-{worker_id}] Land Address API failed (HTTP {land_status})")
            record.update({
                "status": "RETRY" if current_attempts < MAX_PROJECT_RETRIES else "FAILED",
                "failed_stage": "API",
                "failed_api": "getProjectLandAddressDetails",
                "http_status": land_status,
                "error_message": f"API_{land_status}" if land_status != 200 else "PARSE_ERROR"
            })
            record["execution_time_sec"] = round(time.time() - start_time, 2)
            return record, worker_id
        print(f"[WORKER-{worker_id}] Land Address API: OK")

        # 3. GeoTagging API
        print(f"[WORKER-{worker_id}] Calling API: getProjectLegalGeoTaggingDetailByProjectId...")
        geo_status, geo_raw = make_api_post(http_session, "getProjectLegalGeoTaggingDetailByProjectId", project_id)
        if geo_status != 200 or not geo_raw:
            print(f"[WORKER-{worker_id}] GeoTagging API failed (HTTP {geo_status})")
            record.update({
                "status": "RETRY" if current_attempts < MAX_PROJECT_RETRIES else "FAILED",
                "failed_stage": "API",
                "failed_api": "getProjectLegalGeoTaggingDetailByProjectId",
                "http_status": geo_status,
                "error_message": f"API_{geo_status}" if geo_status != 200 else "PARSE_ERROR"
            })
            record["execution_time_sec"] = round(time.time() - start_time, 2)
            return record, worker_id
        print(f"[WORKER-{worker_id}] GeoTagging API: OK")

        # Parse Data Fields
        print(f"[WORKER-{worker_id}] Parsing project data...")
        gen_parsed = parse_general_details(gen_raw)
        land_parsed = parse_land_address_details(land_raw)
        geo_parsed = parse_geotagging_details(geo_raw)

        record.update({
            "registration_number": gen_parsed["Registration Number"],
            "date_of_registration": gen_parsed["Date of Registration"],
            "project_name": gen_parsed["Project Name"],
            "proposed_completion_date_original": gen_parsed["Proposed Completion Date (Original)"],
            "address": land_parsed["Address"],
            "street_name": land_parsed["Street Name"],
            "locality": land_parsed["Locality"],
            "state_ut": land_parsed["State/UT"],
            "district": land_parsed["District"],
            "taluka": land_parsed["Taluka"],
            "village": land_parsed["Village"],
            "pin_code": land_parsed["Pin Code"],
            "longitude": geo_parsed["Longitude"],
            "latitude": geo_parsed["Latitude"],
            "status": "SUCCESS",
            "failed_stage": None,
            "failed_api": None,
            "http_status": 200,
            "error_message": None
        })
        elapsed = round(time.time() - start_time, 2)
        print(f"[WORKER-{worker_id}] ✅ SUCCESS! Project {project_id} scraped in {elapsed}s - {gen_parsed['Project Name']}")

    except Exception as exc:
        elapsed = round(time.time() - start_time, 2)
        print(f"[WORKER-{worker_id}] ❌ EXCEPTION! Project {project_id} failed after {elapsed}s: {str(exc)[:200]}")
        record.update({
            "status": "RETRY" if current_attempts < MAX_PROJECT_RETRIES else "FAILED",
            "failed_stage": "UNKNOWN",
            "error_message": str(exc)[:100]
        })

    finally:
        if http_session:
            try:
                http_session.close()
            except Exception:
                pass
        if driver:
            try:
                driver.quit()
            except Exception:
                pass

    record["execution_time_sec"] = round(time.time() - start_time, 2)
    return record, worker_id


def execute_project_with_timeout(worker_id, project_row):
    """Guards worker execution with PROJECT_TIMEOUT_SECONDS limit."""
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(process_single_project_task, worker_id, project_row)
        try:
            return future.result(timeout=PROJECT_TIMEOUT_SECONDS)
        except concurrent.futures.TimeoutError:
            print(f"[TIMEOUT] Project ID: {project_row['project_id']}")
            return ({
                "source_row": project_row["source_row"],
                "rera_id": project_row["rera_id"],
                "project_id": project_row["project_id"],
                "registration_number": "NOT FOUND",
                "date_of_registration": "NOT FOUND",
                "project_name": "NOT FOUND",
                "proposed_completion_date_original": "NOT FOUND",
                "address": "NOT FOUND",
                "street_name": "NOT FOUND",
                "locality": "NOT FOUND",
                "state_ut": "NOT FOUND",
                "district": "NOT FOUND",
                "taluka": "NOT FOUND",
                "village": "NOT FOUND",
                "pin_code": "NOT FOUND",
                "longitude": "NOT FOUND",
                "latitude": "NOT FOUND",
                "view_details_url": project_row["view_details_url"],
                "page_number": project_row["page_number"],
                "status": "RETRY" if project_row.get("attempts", 0) + 1 < MAX_PROJECT_RETRIES else "FAILED",
                "attempts": project_row.get("attempts", 0) + 1,
                "failed_stage": "TIMEOUT",
                "failed_api": None,
                "http_status": None,
                "error_message": "PROJECT_TIMEOUT",
                "execution_time_sec": float(PROJECT_TIMEOUT_SECONDS)
            }, worker_id)

# ============================================================
# ORDER-PRESERVING EXCEL EXPORT HELPERS
# ============================================================

def export_final_excels():
    """Exports SQLite records to production Excels strictly ordered by source_row."""
    conn = sqlite3.connect(DB_FILE, timeout=60.0)
    df_all = pd.read_sql_query("SELECT * FROM projects ORDER BY source_row ASC", conn)
    conn.close()

    if df_all.empty:
        print("[PRODUCTION EXPORT] No data found in database.")
        return

    # 1. Main Output Excel (SUCCESS Records)
    df_success = df_all[df_all["status"] == "SUCCESS"].copy()
    rename_mapping = {
        "rera_id": "RERA ID",
        "project_id": "Project ID",
        "registration_number": "Registration Number",
        "date_of_registration": "Date of Registration",
        "project_name": "Project Name",
        "proposed_completion_date_original": "Proposed Completion Date (Original)",
        "address": "Address",
        "street_name": "Street Name",
        "locality": "Locality",
        "state_ut": "State/UT",
        "district": "District",
        "taluka": "Taluka",
        "village": "Village",
        "pin_code": "Pin Code",
        "longitude": "Longitude",
        "latitude": "Latitude",
        "view_details_url": "View Details URL",
        "page_number": "Page Number"
    }

    df_out = df_success.rename(columns=rename_mapping)
    for col in OUTPUT_COLUMNS:
        if col not in df_out.columns:
            df_out[col] = "NOT FOUND"

    df_out = df_out[OUTPUT_COLUMNS]

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Projects"
    ws.append(OUTPUT_COLUMNS)

    for row in df_out.itertuples(index=False):
        ws.append([str(val) if pd.notna(val) else "NOT FOUND" for val in row])

    ws.freeze_panes = "A2"
    ws.auto_filter.ref = ws.dimensions

    for col in ws.columns:
        max_len = max(len(str(cell.value or '')) for cell in col)
        col_letter = openpyxl.utils.get_column_letter(col[0].column)
        ws.column_dimensions[col_letter].width = min(max(max_len + 3, 12), 40)

    wb.save(OUTPUT_EXCEL)
    print(f"[PRODUCTION] Exported {len(df_out)} successful project(s) to {OUTPUT_EXCEL}")

    # 2. Failure Report Excel (Only Attempted RETRY/FAILED)
    df_failures = df_all[df_all["status"].isin(["RETRY", "FAILED"])].copy()
    if not df_failures.empty:
        fail_mapping = {
            "rera_id": "RERA ID",
            "project_id": "Project ID",
            "view_details_url": "View Details URL",
            "page_number": "Page Number",
            "status": "Status",
            "failed_stage": "Failed Stage",
            "failed_api": "Failed API",
            "http_status": "HTTP Status",
            "error_message": "Reason",
            "attempts": "Attempts"
        }
        df_fail_out = df_failures.rename(columns=fail_mapping)[list(fail_mapping.values())]

        wb_f = openpyxl.Workbook()
        ws_f = wb_f.active
        ws_f.title = "Failures"
        ws_f.append(list(fail_mapping.values()))

        for row in df_fail_out.itertuples(index=False):
            ws_f.append([str(val) if pd.notna(val) else "" for val in row])

        ws_f.freeze_panes = "A2"
        ws_f.auto_filter.ref = ws_f.dimensions

        for col in ws_f.columns:
            max_len = max(len(str(cell.value or '')) for cell in col)
            col_letter = openpyxl.utils.get_column_letter(col[0].column)
            ws_f.column_dimensions[col_letter].width = min(max(max_len + 3, 12), 40)

        wb_f.save(FAILURES_EXCEL)
        print(f"[PRODUCTION] Exported {len(df_fail_out)} attempted failure(s) to {FAILURES_EXCEL}")

# ============================================================
# CONTINUOUS WORKER QUEUE SCRAPING ENGINE
# ============================================================

def run_worker_pool_pass(target_statuses, worker_count, pass_name="MAIN PASS"):
    """Executes a continuous parallel worker queue pass over targeted project statuses."""
    conn = sqlite3.connect(DB_FILE, timeout=60.0)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    placeholders = ",".join("?" for _ in target_statuses)
    query = f"SELECT * FROM projects WHERE status IN ({placeholders}) ORDER BY source_row ASC"
    cursor.execute(query, target_statuses)
    projects_to_process = [dict(row) for row in cursor.fetchall()]
    conn.close()

    total_pass_projects = len(projects_to_process)
    if total_pass_projects == 0:
        print(f"\n>>> [{pass_name}] No eligible projects found. Skipping.")
        return

    print(f"\n>>> Starting {pass_name} ({total_pass_projects} projects with {worker_count} workers)...")

    available_worker_ids = set(range(1, worker_count + 1))
    project_iter = iter(projects_to_process)
    active_futures = {}
    completed_in_pass = 0

    with concurrent.futures.ThreadPoolExecutor(max_workers=worker_count) as executor:
        # Initial fill of the worker pool
        while available_worker_ids:
            if check_stop_flag():
                print(">>> STOP_REQUESTED: not dispatching further projects.")
                break
            try:
                p_row = next(project_iter)
                w_id = available_worker_ids.pop()
                p_num = p_row["source_row"]
                fut = executor.submit(execute_project_with_timeout, w_id, p_row)
                active_futures[fut] = (w_id, p_row)
            except StopIteration:
                break

        # Continuous Task Consumer Loop
        while active_futures:
            done, _ = concurrent.futures.wait(
                active_futures.keys(), 
                return_when=concurrent.futures.FIRST_COMPLETED
            )

            for fut in done:
                w_id, p_row = active_futures.pop(fut)
                record, worker_id = fut.result()

                save_project_to_db(record)
                completed_in_pass += 1

                status_str = record["status"]
                elapsed_sec = record["execution_time_sec"]

                if status_str == "SUCCESS":
                    print(f"[Worker-{worker_id}] Project {p_row['source_row']} → SUCCESS → {elapsed_sec} sec")
                else:
                    reason_str = record["error_message"] or "ERROR"
                    print(f"[Worker-{worker_id}] Project {p_row['source_row']} → {status_str} ({reason_str}) → {elapsed_sec} sec")

                # Print periodic progress every 25 completed projects
                if completed_in_pass % 25 == 0 or completed_in_pass == total_pass_projects:
                    conn_st = sqlite3.connect(DB_FILE, timeout=60.0)
                    c_st = conn_st.cursor()
                    c_st.execute("SELECT COUNT(*) FROM projects WHERE status = 'SUCCESS'")
                    cur_succ = c_st.fetchone()[0]
                    c_st.execute("SELECT COUNT(*) FROM projects WHERE status = 'RETRY'")
                    cur_ret = c_st.fetchone()[0]
                    c_st.execute("SELECT COUNT(*) FROM projects WHERE status = 'FAILED'")
                    cur_fail = c_st.fetchone()[0]
                    conn_st.close()

                    print(f"--- Progress: {completed_in_pass}/{total_pass_projects} in {pass_name} | Success: {cur_succ} | Retry: {cur_ret} | Failed: {cur_fail} ---")

                # Immediately assign next pending project to newly freed worker
                if check_stop_flag():
                    print(">>> STOP_REQUESTED: not dispatching further projects.")
                    continue
                try:
                    next_p_row = next(project_iter)
                    next_p_num = next_p_row["source_row"]
                    print(f"[Worker-{worker_id}] Project {next_p_num} → STARTED")
                    new_fut = executor.submit(execute_project_with_timeout, worker_id, next_p_row)
                    active_futures[new_fut] = (worker_id, next_p_row)
                except StopIteration:
                    available_worker_ids.add(worker_id)

# ============================================================
# MAIN PRODUCTION SCRAPER ORCHESTRATOR
# ============================================================

def main():
    if not os.path.exists(INPUT_EXCEL):
        print(f"[FATAL ERROR] Source file '{INPUT_EXCEL}' not found.")
        return

    init_sqlite_db()

    df_input = pd.read_excel(INPUT_EXCEL)
    sync_input_to_db(df_input)

    # Calculate live progress and resume totals
    conn = sqlite3.connect(DB_FILE, timeout=60.0)
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM projects")
    total_projects = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM projects WHERE status = 'SUCCESS'")
    already_done = cursor.fetchone()[0]
    conn.close()

    remaining = total_projects - already_done

    print("============================================================")
    print("MAHARERA PUNE BASIC DATA SCRAPER (PRODUCTION)")
    print("============================================================")
    print(f"Total projects : {total_projects}")
    print(f"Already done   : {already_done}")
    print(f"Remaining      : {remaining}")
    print(f"Workers        : {MAX_BROWSER_WORKERS}")
    print("============================================================\n")

    if remaining > 0:
        # Pass 1: Main Pass over PENDING projects
        run_worker_pool_pass(["PENDING"], MAX_BROWSER_WORKERS, pass_name="MAIN PASS")

    # Pass 2: Recovery Pass over RETRY projects
    conn = sqlite3.connect(DB_FILE, timeout=60.0)
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM projects WHERE status = 'RETRY'")
    retry_count = cursor.fetchone()[0]
    conn.close()

    if retry_count > 0:
        run_worker_pool_pass(["RETRY"], RECOVERY_WORKERS, pass_name="RECOVERY PASS")

    # Export final SQLite data to Excel files maintaining source order
    export_final_excels()

    # Final Summary Output
    conn = sqlite3.connect(DB_FILE, timeout=60.0)
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM projects WHERE status = 'SUCCESS'")
    final_success = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM projects WHERE status = 'FAILED'")
    final_failed = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM projects WHERE status = 'RETRY'")
    final_retry = cursor.fetchone()[0]
    conn.close()

    print("\n============================================================")
    print("FINAL SCRAPING SUMMARY")
    print("============================================================")
    print(f"Total Projects : {total_projects}")
    print(f"Success        : {final_success}")
    print(f"Failed         : {final_failed}")
    print(f"Remaining Retry: {final_retry}")
    print("============================================================\n")

if __name__ == "__main__":
    main()