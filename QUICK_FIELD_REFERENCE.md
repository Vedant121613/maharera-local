# Quick Reference: What Data is Being Scraped

## 🎯 TL;DR - Data Fields Summary

Your scraper collects **18 main fields** from MahaRERA website across **2 phases**:

---

## 📊 Phase 1: Link Scraper (Basic Info)

**Source:** `https://maharera.maharashtra.gov.in/projects-search-result`

| # | Field Name | Example | How It's Extracted |
|---|------------|---------|-------------------|
| 1 | **RERA ID** | `P52100000123` | RegEx pattern: `[A-Z]{1,2}\d{11}` |
| 2 | **Project Name** | `"ABC Heights Phase 2"` | HTML `<h4>` or `<strong>` tag |
| 3 | **Pincode** | `411038` | RegEx: `4\d{5}` (Maharashtra) |
| 4 | **District** | `Pune` | From scraper config |
| 5 | **View URL** | `/public/project/view/456789` | Link href attribute |
| 6 | **Certificate URL** | `/project-document?id=...` | `data-qstr` attribute |
| 7 | **Page Number** | `1`, `2`, `3`... | Pagination counter |

**Output:** Excel file → Uploaded to PostgreSQL `links` table

---

## 📑 Phase 2: Data Scraper (Detailed Info)

**Source:** `https://maharerait.maharashtra.gov.in/api/.../public/projectregistartion/`

### API Endpoints Called (3 total):

#### 1️⃣ `getProjectGeneralDetailsByProjectId`
| # | Field Name | API Response Key | Example |
|---|------------|------------------|---------|
| 8 | **Registration Number** | `projectRegistartionNo` | `P52100000123/2020` |
| 9 | **Date of Registration** | `reraRegistrationDate` | `2020-05-15` |
| 10 | **Project Name** | `projectName` | `ABC Heights Phase 2` |
| 11 | **Proposed Completion Date** | `originalProjectProposeCompletionDate` | `2024-12-31` |

#### 2️⃣ `getProjectLandAddressDetails`
| # | Field Name | API Response Key | Example |
|---|------------|------------------|---------|
| 12 | **Address** | `addressLine` / `address` | `Plot No. 45, Survey No. 123/2` |
| 13 | **Street Name** | `street` / `streetName` | `Karve Road` |
| 14 | **Locality** | `locality` | `Kothrud` |
| 15 | **State/UT** | `stateName` | `Maharashtra` |
| 16 | **District** | `districtName` | `Pune` |
| 17 | **Taluka** | `talukaName` | `Haveli` |
| 18 | **Village** | `villageName` | `Kothrud` |
| 19 | **Pin Code** | `pinCode` | `411038` |

#### 3️⃣ `getProjectLegalGeoTaggingDetailByProjectId`
| # | Field Name | API Response Key | Example |
|---|------------|------------------|---------|
| 20 | **Longitude** | `longitude` | `73.8234` |
| 21 | **Latitude** | `latitude` | `18.5074` |

**Output:** SQLite database → Uploaded to PostgreSQL `basic_data` table

---

## 🔄 Complete Data Flow

```
┌──────────────────────────────────────────────────┐
│         STEP 1: Link Scraper                     │
├──────────────────────────────────────────────────┤
│ Input:  District ID (e.g., 521 = Pune)          │
│ Action: HTTP GET to search page                  │
│ Parse:  HTML → BeautifulSoup                     │
│ Extract: 7 fields (RERA ID, Name, URL, etc.)   │
│ Output: links_Pune.xlsx                          │
└──────────────────────────────────────────────────┘
                       ↓
        Upload to PostgreSQL (links table)
                       ↓
┌──────────────────────────────────────────────────┐
│         STEP 2: Data Scraper                     │
├──────────────────────────────────────────────────┤
│ Input:  Download links from backend              │
│ Action: For each project URL:                    │
│         1. Open in Selenium browser              │
│         2. Solve CAPTCHA (OCR)                   │
│         3. Extract Bearer token                  │
│         4. Make 3 API POST requests              │
│ Parse:  JSON responses → Field extraction        │
│ Extract: 14 additional fields                    │
│ Output: basicdata_Pune.db (SQLite)              │
└──────────────────────────────────────────────────┘
                       ↓
        Upload to PostgreSQL (basic_data table)
                       ↓
┌──────────────────────────────────────────────────┐
│         STEP 3: Dashboard Display                │
├──────────────────────────────────────────────────┤
│ Frontend: React app queries backend              │
│ Backend:  Express API → PostgreSQL               │
│ Display:  Tables, stats, export options          │
└──────────────────────────────────────────────────┘
```

---

## 🗺️ Districts Covered (36 total)

```
Maharashtra State Districts:
├─ Nandurbar (497)       ├─ Dhule (498)          ├─ Jalgaon (499)
├─ Buldana (500)         ├─ Akola (501)          ├─ Washim (502)
├─ Amravati (503)        ├─ Wardha (504)         ├─ Nagpur (505)
├─ Bhandara (506)        ├─ Gondiya (507)        ├─ Gadchiroli (508)
├─ Chandrapur (509)      ├─ Yavatmal (510)       ├─ Nanded (511)
├─ Hingoli (512)         ├─ Parbhani (513)       ├─ Jalna (514)
├─ Aurangabad (515)      ├─ Nashik (516)         ├─ Thane (517)
├─ Mumbai Suburban (518) ├─ Mumbai City (519)    ├─ Raigarh (520)
├─ Pune (521) ⭐         ├─ Ahmednagar (522)     ├─ Beed (523)
├─ Latur (524)           ├─ Osmanabad (525)      ├─ Solapur (526)
├─ Satara (527)          ├─ Ratnagiri (528)      ├─ Sindhudurg (529)
├─ Kolhapur (530)        ├─ Sangli (531)         ├─ Palghar (990)
└─ DHARASHIV (992)
```

---

## 📝 Example Record (Full Data)

### Input (from search page):
```
RERA ID: P52100000123
View URL: /public/project/view/456789
```

### Output (final database record):
```json
{
  "id": 1,
  "project_id": "456789",
  "rera_id": "P52100000123",
  "district": "Pune",
  "taluka": "Haveli",
  "village": "Kothrud",
  "project_name": "ABC Heights Phase 2",
  "registration_number": "P52100000123/2020",
  "date_of_registration": "2020-05-15",
  "proposed_completion_date": "2024-12-31",
  "address": "Plot No. 45, Survey No. 123/2, Karve Road",
  "street_name": "Karve Road",
  "locality": "Kothrud",
  "state_ut": "Maharashtra",
  "pincode": "411038",
  "longitude": "73.8234",
  "latitude": "18.5074",
  "view_details_url": "https://maharera.maharashtra.gov.in/public/project/view/456789",
  "page_number": 1,
  "status": "SUCCESS",
  "scraped_at": "2024-01-15T10:30:00Z"
}
```

---

## 🎯 Key Technologies

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Link Scraper** | Python + BeautifulSoup + Requests | Parse HTML search results |
| **Data Scraper** | Python + Selenium + Chrome | Automate browser, solve CAPTCHA |
| **CAPTCHA Solver** | ddddocr (OCR library) | Recognize 6-digit codes |
| **API Auth** | Bearer Token extraction | Authenticate API requests |
| **Data Storage** | PostgreSQL | Production database |
| **File Export** | Excel (openpyxl) | Data export capability |
| **Backend** | Node.js + Express | REST API server |
| **Frontend** | React + Vite + Mantine | Dashboard UI |

---

## ⚡ Performance Stats

### Link Scraper:
- **Speed**: ~50-100 projects/minute
- **Workers**: 5 concurrent threads
- **Output**: Excel file

### Data Scraper:
- **Speed**: ~2-5 projects/minute (CAPTCHA solving)
- **Workers**: 2-3 concurrent browsers
- **Timeout**: 90 seconds per project
- **Retries**: Up to 2 attempts
- **Output**: SQLite database

### Expected Time:
```
District with 1000 projects:
├─ Phase 1 (Links):  10-20 minutes
└─ Phase 2 (Data):   3-8 hours
```

---

## 🛡️ Error Handling

If a field cannot be extracted, default values are used:

| Phase | Default Value | Example |
|-------|--------------|---------|
| Phase 1 | `"N/A"` | `Project Name: "N/A"` |
| Phase 2 | `"NOT FOUND"` | `Address: "NOT FOUND"` |

Status codes:
- `SUCCESS` = All data extracted
- `FAILED` = Could not extract data
- `RETRY` = Will retry (up to 2 times)
- `PENDING` = Not yet processed

---

## 📊 Database Tables

### `links` table (Phase 1 output):
```sql
district | rera_id | project_name | pincode | project_url | page_number | scraped_at
---------|---------|--------------|---------|-------------|-------------|------------
Pune     | P52100  | ABC Heights  | 411038  | /view/123   | 1           | 2024-01-15
```

### `basic_data` table (Phase 2 output):
```sql
project_id | rera_id | project_name | registration_number | date_of_registration | ...
-----------|---------|--------------|---------------------|---------------------|----
456789     | P52100  | ABC Heights  | P52100/2020        | 2020-05-15         | ...
```

### `scrape_jobs` table (Progress tracking):
```sql
id | worker_type | district | status  | processed | total | found
---|-------------|----------|---------|-----------|-------|-------
1  | link        | Pune     | RUNNING | 500       | 1000  | 450
2  | data        | Pune     | PENDING | 0         | 450   | 0
```

---

## 🔍 Field Validation Rules

### RERA ID:
```
Pattern: [A-Z]{1,2}\d{11}
Valid:   P52100000123 ✅
Valid:   MH12345678901 ✅
Invalid: 12345 ❌
```

### Pincode:
```
Pattern: \d{6}
Maharashtra: 4\d{5}
Valid:   411038 ✅
Invalid: 12345 ❌
```

### Project ID:
```
Pattern: \d+
Extracted from URL: /public/project/view/456789
Result: "456789"
```

### Coordinates:
```
Longitude: Valid range ~72-78 (Western India)
Latitude:  Valid range ~15-22 (Maharashtra)
Example:   73.8234, 18.5074
```

---

## 📚 For More Details

- **Complete Documentation**: See `DATA_FIELDS_DOCUMENTATION.md`
- **Deployment Guide**: See `FREE_TIER_DEPLOYMENT.md`
- **AWS Setup**: See `AWS_DEPLOYMENT_GUIDE.md`

---

## ❓ Common Questions

**Q: Can I scrape specific districts only?**  
A: Yes! Use the dashboard to start/stop scraping for each district individually.

**Q: What happens if scraping fails?**  
A: The scraper retries up to 2 times, then marks the project as FAILED with error details.

**Q: Can I export the data?**  
A: Yes! Use the "Export" button in the dashboard to download CSV files.

**Q: How long does it take to scrape all districts?**  
A: Approximately 100-300 hours for all 36 districts (Phase 2 is time-intensive due to CAPTCHA).

**Q: Can I add more fields?**  
A: Yes! Modify `data_scraper.py` to call additional API endpoints and extract more fields.

---

**🎉 You now know exactly what data is being scraped and from where!**
