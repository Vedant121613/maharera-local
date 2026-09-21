# Data Fields & Scraping Sources Documentation

This document explains **what data fields are being scraped** and **where they come from**.

---

## 📊 Overview: Two-Phase Scraping

Your scraper operates in **two phases**:

### Phase 1: Link Scraper (`link_scraper.py`)
Collects basic project information from search results

### Phase 2: Data Scraper (`data_scraper.py`)
Fetches detailed project information via API calls

---

## 🔗 Phase 1: Link Scraper

### Source Website
```
Base URL: https://maharera.maharashtra.gov.in
Search Endpoint: /projects-search-result
```

### Search Parameters
```python
{
    "project_state": 27,          # Maharashtra (fixed)
    "project_district": <ID>,     # Variable per district (497-992)
    "page": <page_number>         # Pagination
}
```

### Fields Extracted from Search Results

| Field | Source | Description |
|-------|--------|-------------|
| **RERA ID** | HTML parsing | Format: `P12345678901` (1 letter + 11 digits) |
| **Project Name** | HTML `<h4>`, `<h5>`, or `<strong>` tags | Official project name |
| **Pincode** | Text parsing | 6-digit pincode (pattern: `4XXXXX` for Maharashtra) |
| **District** | Set by scraper config | Current district being scraped |
| **View Details URL** | `<a>` tag href | Link pattern: `/public/project/view/<project_id>` |
| **Certificate URL** | Data attribute `data-qstr` | Certificate download endpoint (NEW) |
| **Page Number** | Scraper context | Which search result page it came from |

### Parsing Strategy (Multi-layered fallback)

```
1. Primary Parser (parse_primary)
   └─> Looks for cards with class: "shadow" + "bg-body"
   
2. Fallback Container Parser (parse_fallback_containers)
   └─> Finds all links matching /public/project/view/\d+
   
3. Tree Traversal Parser (parse_projects)
   └─> Walks DOM tree looking for RERA ID pattern
   
4. Regex Parser (parse_fallback_rera_ids)
   └─> Final fallback: RegEx extraction of RERA IDs
```

### Output Format
Excel file with these columns:
```
RERA ID | Project Name | Pincode | District | View Details URL | Certificate URL | Page Number
```

---

## 📑 Phase 2: Data Scraper

### Source API
```
Base URL: https://maharerait.maharashtra.gov.in/api/maha-rera-public-view-project-registration-service/public/projectregistartion/
```

### Authentication Method
1. Opens project URL in Selenium browser
2. Solves CAPTCHA (using ddddocr OCR)
3. Extracts Bearer token from network logs
4. Creates authenticated HTTP session
5. Makes direct API calls

### API Endpoints Called

| Endpoint | Purpose | Fields Retrieved |
|----------|---------|------------------|
| `getProjectGeneralDetails` | Basic project info | Registration number, dates, project name |
| `getProjectLandAddressDetails` | Location details | Full address, street, locality, district, taluka, village, pincode |
| `getProjectGeotaggingDetails` | GPS coordinates | Longitude, Latitude |

### Complete Field List

#### From `getProjectGeneralDetails`:
```json
{
  "Registration Number": "projectRegistartionNo / registrationNo / reraRegistrationNo",
  "Date of Registration": "reraRegistrationDate / registrationDate / approvedDate",
  "Project Name": "projectName / name",
  "Proposed Completion Date": "originalProjectProposeCompletionDate / proposedCompletionDate"
}
```

#### From `getProjectLandAddressDetails`:
```json
{
  "Address": "addressLine / address / projectAddress / siteAddress",
  "Street Name": "street / streetName",
  "Locality": "locality / location",
  "State/UT": "stateName / state / stateUt",
  "District": "districtName / district",
  "Taluka": "talukaName / taluka / subDistrict",
  "Village": "villageName / village",
  "Pin Code": "pinCode / pincode / postalCode"
}
```

#### From `getProjectGeotaggingDetails`:
```json
{
  "Longitude": "longitude / long / lng",
  "Latitude": "latitude / lat"
}
```

### Intelligent Field Extraction

The scraper uses **recursive JSON traversal** to find fields:

```python
def find_all_occurrences_and_paths(data, target_key):
    """
    Searches through nested JSON for target keys
    Returns: [(path, value), (path, value), ...]
    """
```

**Example:** To find "pinCode", it searches for:
- `pinCode`
- `pincode`
- `postalCode`

And returns the **first non-null value** found.

---

## 🗄️ Database Schema

### Table: `links`
Stores Phase 1 results
```sql
CREATE TABLE links (
  id BIGSERIAL PRIMARY KEY,
  district VARCHAR(100) NOT NULL,
  rera_id VARCHAR(100) NOT NULL,
  project_name TEXT,
  pincode VARCHAR(20),
  project_url TEXT NOT NULL,
  page_number INT,
  status VARCHAR(30) DEFAULT 'active',
  certificate_url TEXT,           -- NEW
  certificate_status VARCHAR(20), -- NEW
  scraped_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(district, rera_id)
);
```

### Table: `basic_data`
Stores Phase 2 results
```sql
CREATE TABLE basic_data (
  id BIGSERIAL PRIMARY KEY,
  project_id VARCHAR(50) UNIQUE,
  rera_id VARCHAR(100),
  district VARCHAR(100),
  taluka VARCHAR(150),
  village VARCHAR(150),
  project_name TEXT,
  registration_number TEXT,
  date_of_registration TEXT,
  proposed_completion_date TEXT,
  address TEXT,
  pincode VARCHAR(20),
  longitude TEXT,
  latitude TEXT,
  view_details_url TEXT,
  page_number INT,
  status VARCHAR(20),
  scraped_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Table: `scrape_jobs`
Tracks scraping progress
```sql
CREATE TABLE scrape_jobs (
  id SERIAL PRIMARY KEY,
  worker_type VARCHAR(10) CHECK (worker_type IN ('link','data')),
  district VARCHAR(100) NOT NULL,
  district_id INT NOT NULL,
  status VARCHAR(20) DEFAULT 'PENDING',
  processed INT DEFAULT 0,
  total INT DEFAULT 0,
  found INT DEFAULT 0,
  failed INT DEFAULT 0,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
```

---

## 📍 Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    PHASE 1: Link Scraper                    │
└─────────────────────────────────────────────────────────────┘

  MahaRERA Search Page
  (maharera.maharashtra.gov.in/projects-search-result)
           │
           │ HTTP GET with district filter
           ↓
  HTML Response (Search Results)
           │
           │ BeautifulSoup Parsing
           ├─> Extract RERA ID (P12345678901)
           ├─> Extract Project Name (<h4> tag)
           ├─> Extract Pincode (regex: 4\d{5})
           ├─> Extract View URL (/public/project/view/123)
           └─> Extract Certificate URL (data-qstr)
           │
           ↓
  Excel: links_<district>.xlsx
           │
           │ Worker uploads to backend
           ↓
  PostgreSQL: links table


┌─────────────────────────────────────────────────────────────┐
│                    PHASE 2: Data Scraper                    │
└─────────────────────────────────────────────────────────────┘

  Backend API: GET /api/worker/links?district=Pune
           │
           ↓
  Excel: links_<district>.xlsx (input)
           │
           │ For each project URL
           ↓
  Selenium Browser Opens:
  maharera.maharashtra.gov.in/public/project/view/123
           │
           │ Solve CAPTCHA (OCR)
           ├─> Extract Bearer Token (network logs)
           └─> Extract Cookies
           │
           ↓
  Authenticated HTTP Session
           │
           │ POST requests to API
           ├─> getProjectGeneralDetails
           ├─> getProjectLandAddressDetails
           └─> getProjectGeotaggingDetails
           │
           ↓
  JSON Responses
           │
           │ Recursive field extraction
           ├─> Registration Number
           ├─> Date of Registration
           ├─> Project Name
           ├─> Proposed Completion Date
           ├─> Address (full)
           ├─> Street, Locality, State
           ├─> District, Taluka, Village
           ├─> Pincode
           ├─> Longitude
           └─> Latitude
           │
           ↓
  SQLite: basicdata_<district>.db
           │
           │ Worker uploads to backend
           ↓
  PostgreSQL: basic_data table
```

---

## 🎯 Field Mapping: Where Each Field Comes From

| Final Field | Phase | Source | Extraction Method |
|-------------|-------|--------|-------------------|
| **RERA ID** | 1 | HTML search results | RegEx: `[A-Z]{1,2}\d{11}` |
| **Project ID** | 1 | View Details URL | RegEx: `/view/(\d+)` |
| **Project Name** | 1 + 2 | HTML + API | HTML `<h4>` tag, then API `projectName` |
| **Registration Number** | 2 | API | `projectRegistartionNo` |
| **Date of Registration** | 2 | API | `reraRegistrationDate` |
| **Proposed Completion Date** | 2 | API | `originalProjectProposeCompletionDate` |
| **Address** | 2 | API | `addressLine` / `address` |
| **Street Name** | 2 | API | `street` / `streetName` |
| **Locality** | 2 | API | `locality` / `location` |
| **State/UT** | 2 | API | `stateName` / `state` |
| **District** | 1 + 2 | Config + API | Set by scraper, validated by API |
| **Taluka** | 2 | API | `talukaName` / `taluka` |
| **Village** | 2 | API | `villageName` / `village` |
| **Pincode** | 1 + 2 | HTML + API | HTML regex, then API `pinCode` |
| **Longitude** | 2 | API | `longitude` / `long` |
| **Latitude** | 2 | API | `latitude` / `lat` |
| **View Details URL** | 1 | HTML search results | `<a href="/public/project/view/...">` |
| **Certificate URL** | 1 | HTML search results | `data-qstr` attribute (NEW) |
| **Page Number** | 1 | Scraper context | Which search page (1, 2, 3...) |
| **Status** | 2 | Scraper logic | SUCCESS / FAILED |

---

## 🔍 Example: Real Data Flow

### Input (from search page):
```
RERA ID: P52100000123
Project Name: "ABC Heights Phase 2"
View URL: https://maharera.maharashtra.gov.in/public/project/view/456789
```

### Process:
1. **Link Scraper** saves this to `links_Pune.xlsx`
2. **Worker** uploads to PostgreSQL `links` table
3. **Data Scraper** reads from backend: GET `/api/worker/links?district=Pune`
4. **Selenium** opens URL: `/public/project/view/456789`
5. **CAPTCHA** solved automatically (OCR)
6. **API calls made**:
   ```
   POST getProjectGeneralDetails {"projectId": "456789"}
   POST getProjectLandAddressDetails {"projectId": "456789"}
   POST getProjectGeotaggingDetails {"projectId": "456789"}
   ```

### Output (to database):
```json
{
  "project_id": "456789",
  "rera_id": "P52100000123",
  "project_name": "ABC Heights Phase 2",
  "registration_number": "P52100000123/2020",
  "date_of_registration": "2020-05-15",
  "proposed_completion_date": "2024-12-31",
  "address": "Plot No. 45, Survey No. 123/2",
  "street_name": "Karve Road",
  "locality": "Kothrud",
  "state_ut": "Maharashtra",
  "district": "Pune",
  "taluka": "Haveli",
  "village": "Kothrud",
  "pin_code": "411038",
  "longitude": "73.8234",
  "latitude": "18.5074",
  "view_details_url": "https://maharera.maharashtra.gov.in/public/project/view/456789",
  "status": "SUCCESS"
}
```

---

## 🛡️ Error Handling & Data Quality

### Field Value Defaults

If a field cannot be extracted:
- **Phase 1 (Link Scraper)**: Returns `"N/A"`
- **Phase 2 (Data Scraper)**: Returns `"NOT FOUND"`

### Validation Rules

```python
# Valid RERA ID format
Pattern: [A-Z]{1,2}\d{11}
Example: P52100000123 ✅
Example: MH12345678901 ✅

# Valid Project ID
Pattern: \d+ (numeric)
Extracted from URL: /view/123456

# Valid Pincode
Pattern: \d{6}
Maharashtra: 4\d{5}
```

### Status Tracking

Every scraped record has a status:

| Status | Meaning |
|--------|---------|
| `PENDING` | Queued for scraping |
| `SUCCESS` | All data extracted successfully |
| `FAILED` | Scraping failed (error recorded) |
| `active` | Link is valid (Phase 1) |

---

## 📈 Data Statistics

### Districts Covered
**36 districts** in Maharashtra:
```
Nandurbar, Dhule, Jalgaon, Buldana, Akola, Washim,
Amravati, Wardha, Nagpur, Bhandara, Gondiya, Gadchiroli,
Chandrapur, Yavatmal, Nanded, Hingoli, Parbhani, Jalna,
Aurangabad, Nashik, Thane, Mumbai Suburban, Mumbai City,
Raigarh, Pune, Ahmednagar, Beed, Latur, Osmanabad,
Solapur, Satara, Ratnagiri, Sindhudurg, Kolhapur,
Sangli, Palghar, DHARASHIV
```

### Expected Data Volume

Per district estimate:
- **Links**: 500-5,000 projects
- **Basic Data**: 18 fields per project
- **Database Size**: ~10-100 MB per district

Total for all 36 districts:
- **Links**: ~20,000-50,000 projects
- **Database Size**: ~500 MB - 2 GB

---

## 🔧 Customization Options

### Adding New Fields

To extract additional fields from the API:

1. **Identify the API endpoint** (check browser network tab)
2. **Add to `data_scraper.py`**:
   ```python
   # Add new API call
   status_code, data = make_api_post(session, "getNewEndpoint", project_id)
   
   # Add field extraction
   def parse_new_details(data):
       return {
           "New Field": clean_val(get_first_valid_value(data, ["apiFieldName"]))
       }
   ```

3. **Update database schema** in `server.js`:
   ```sql
   ALTER TABLE basic_data ADD COLUMN new_field TEXT;
   ```

### Filtering Data

Modify search parameters in `link_scraper.py`:
```python
params = {
    "project_name": "Search Term",        # Filter by name
    "project_location": "Pune",           # Filter by location
    "project_completion_date": "2024",    # Filter by date
    "project_district": DISTRICT_ID,
    # Add more filters...
}
```

---

## 🎓 Understanding the Code

### Key Files

1. **`link_scraper.py`** (550 lines)
   - Web scraping with BeautifulSoup
   - Multi-strategy HTML parsing
   - Excel output generation

2. **`data_scraper.py`** (900 lines)
   - Selenium automation
   - CAPTCHA solving (OCR)
   - API authentication
   - JSON field extraction
   - SQLite database management

3. **`worker.py`** (250 lines)
   - Job orchestration
   - Backend API communication
   - Process management

4. **`server.js`** (737 lines)
   - REST API endpoints
   - PostgreSQL integration
   - Data upload handling

---

## 📞 Summary

Your scraper extracts **18+ fields** across **2 phases**:

### Phase 1 Output (7 fields):
- RERA ID, Project Name, Pincode, District, View URL, Certificate URL, Page Number

### Phase 2 Output (18 fields):
- Registration Number, Registration Date, Project Name, Completion Date
- Address, Street, Locality, State, District, Taluka, Village, Pincode
- Longitude, Latitude, View URL, Page Number, Status, Scraping Metadata

### Data Sources:
- **Public Website**: maharera.maharashtra.gov.in (search results)
- **Private API**: maharerait.maharashtra.gov.in/api/... (authenticated)

All data is stored in **PostgreSQL** for production use and made accessible via your **React dashboard**.

---

**Need more details on a specific field or process? Let me know!**
