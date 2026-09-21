# 🏠 Local Development Setup (No Online Dependencies)

## ✨ Features

This local setup:
- ✅ Uses **SQLite** (no PostgreSQL installation needed)
- ✅ Imports your **existing CSV data** automatically
- ✅ Runs **completely offline** on localhost
- ✅ No scraping workers needed (uses existing data)
- ✅ Same dashboard UI as production

---

## 🚀 Quick Start (3 Steps)

### Step 1: Install Dependencies

```powershell
# Install backend dependencies
npm install --save better-sqlite3 cors dotenv express
npm install --save-dev nodemon

# Install frontend dependencies
cd frontend
npm install
cd ..
```

### Step 2: Build Frontend

```powershell
cd frontend
npm run build
cd ..
```

### Step 3: Run Local Server

```powershell
node server-local.js
```

**That's it!** Open your browser: `http://localhost:5000`

---

## 📁 Project Structure

```
rera-new-data-shravni/
├── data/                          ← Your CSV files
│   ├── links.csv                 ← Imported automatically
│   ├── basic_data.csv            ← Imported automatically
│   ├── scrape_data.csv           ← Imported automatically
│   └── local_database.db         ← Created automatically
├── .env.local                     ← Local environment config
├── server-local.js                ← Local server (SQLite)
├── package-local.json             ← Local package.json
└── frontend/
    ├── .env.local                 ← Frontend config
    └── dist/                      ← Built frontend
```

---

## 🗄️ Your Data

Based on your CSVs, you have:

### 📊 scrape_data.csv (7 jobs)
- Nandurbar (link + data)
- Dhule (link)
- Jalgaon (link)
- Buldana (link)
- Pune (2 link jobs)

### 🔗 links.csv (11+ links)
Sample:
```
Nandurbar: P49700009502 - Chhoriya Residency
Nandurbar: P49700008973 - SHREE GANESH IMPERIAL
...
```

### 📑 basic_data.csv (11+ projects)
Sample:
```
P49700009502 - Chhoriya Residency (SUCCESS)
P49700008973 - SHREE GANESH IMPERIAL (SUCCESS)
P49700013238 - K R SUNCITY (PENDING)
...
```

---

## 🔧 Configuration Files

### .env.local
```bash
DATABASE_URL=sqlite:./data/local_database.db
DATABASE_TYPE=sqlite
PORT=5000
NODE_ENV=development
```

### frontend/.env.local
```bash
VITE_API_BASE_URL=http://localhost:5000
```

---

## 🎮 Usage

### Start Server
```powershell
# Production mode
node server-local.js

# Development mode (auto-restart on changes)
npm run local:dev
```

### Access Dashboard
```
http://localhost:5000
```

### API Endpoints

All your existing frontend APIs work:

| Endpoint | Description |
|----------|-------------|
| `GET /api/health` | Health check |
| `GET /api/dashboard/stats` | Dashboard statistics |
| `GET /api/scraping/districts` | District scraping status |
| `GET /api/links` | List scraped links |
| `GET /api/basic-data` | List basic data |
| `GET /api/links/export` | Export links as CSV |
| `GET /api/basic-data/export` | Export basic data as CSV |

---

## 📊 Dashboard Features

Your dashboard will show:

✅ **Dashboard Stats**
- Total Districts: 36
- Total Links: 11+ (from your CSV)
- Total Data Scraped: 11+ (from your CSV)
- Failed Projects: Count

✅ **Districts View**
- All 36 Maharashtra districts
- Progress per district (from scrape_data.csv)
- Link/Data status

✅ **Links Table**
- View all scraped links
- Filter by district
- Search by RERA ID or project name
- Export to CSV

✅ **Basic Data Table**
- View all project details
- Filter by district
- Search functionality
- Export to CSV

---

## 🔄 Data Flow

```
┌─────────────────────────────────────────┐
│  Your CSV Files (data folder)           │
├─────────────────────────────────────────┤
│  - links.csv                             │
│  - basic_data.csv                        │
│  - scrape_data.csv                       │
└──────────────┬──────────────────────────┘
               │
               │ Imported on server start
               ↓
┌─────────────────────────────────────────┐
│  SQLite Database                         │
│  (data/local_database.db)                │
├─────────────────────────────────────────┤
│  Tables:                                 │
│  - links                                 │
│  - basic_data                            │
│  - scrape_jobs                           │
└──────────────┬──────────────────────────┘
               │
               │ Express API
               ↓
┌─────────────────────────────────────────┐
│  React Frontend                          │
│  http://localhost:5000                   │
└─────────────────────────────────────────┘
```

---

## 📝 Adding More Data

### Option 1: Add to Existing CSVs

Just add rows to your CSV files:

```csv
# data/links.csv
id,district,rera_id,project_name,pincode,project_url,...
12,Mumbai,P51900012345,New Project,400001,https://...
```

Then delete the database and restart:

```powershell
Remove-Item .\data\local_database.db
node server-local.js
```

### Option 2: Direct Database Insert

```powershell
# Install sqlite3 CLI
npm install -g sqlite3

# Open database
sqlite3 data/local_database.db

# Insert manually
INSERT INTO links (district, rera_id, project_name, pincode, project_url, page_number)
VALUES ('Mumbai', 'P51900012345', 'New Project', '400001', 'https://...', 1);

# Exit
.exit
```

---

## 🧪 Testing

### Test Health Check
```powershell
curl http://localhost:5000/api/health
```

Expected response:
```json
{
  "status": "OK",
  "database": "SQLite Connected",
  "mode": "LOCAL"
}
```

### Test Dashboard Stats
```powershell
curl http://localhost:5000/api/dashboard/stats
```

### Test Links API
```powershell
curl "http://localhost:5000/api/links?page=1&pageSize=10"
```

---

## 🐛 Troubleshooting

### Server won't start

```powershell
# Check if port 5000 is already in use
netstat -ano | findstr :5000

# Kill the process using port 5000
taskkill /PID <process_id> /F

# Or use a different port
$env:PORT=3000; node server-local.js
```

### Database errors

```powershell
# Delete and recreate database
Remove-Item .\data\local_database.db
node server-local.js
```

### Frontend not loading

```powershell
# Rebuild frontend
cd frontend
npm run build
cd ..
node server-local.js
```

### CSV import issues

Check your CSV format:
- Files should be in `data/` folder
- First row = headers
- Properly quoted values with commas

---

## 📊 Database Queries

### View all data

```sql
-- Open database
sqlite3 data/local_database.db

-- Count records
SELECT 'Links' as table_name, COUNT(*) as count FROM links
UNION ALL
SELECT 'Basic Data', COUNT(*) FROM basic_data
UNION ALL
SELECT 'Jobs', COUNT(*) FROM scrape_jobs;

-- View links
SELECT district, rera_id, project_name FROM links LIMIT 10;

-- View basic data
SELECT district, project_name, status FROM basic_data LIMIT 10;

-- Exit
.exit
```

---

## 🚀 Next Steps

### 1. Run Locally First
```powershell
node server-local.js
```
Open: http://localhost:5000

### 2. Then Try AWS Deployment

Once local version works perfectly:
- Follow **FREE_TIER_DEPLOYMENT.md** for AWS
- Use PostgreSQL instead of SQLite
- Enable scraping workers

---

## ✅ Checklist

- [ ] Node.js installed (v18+)
- [ ] Dependencies installed (`npm install`)
- [ ] Frontend built (`cd frontend && npm run build`)
- [ ] CSV files in `data/` folder
- [ ] `.env.local` file created
- [ ] Server running (`node server-local.js`)
- [ ] Browser opens `http://localhost:5000`
- [ ] Dashboard loads with your data
- [ ] Can view links table
- [ ] Can view basic data table
- [ ] Can export CSV files

---

## 💡 Tips

1. **Development Mode**: Use `npm run local:dev` for auto-restart
2. **Data Refresh**: Delete `local_database.db` to reimport CSVs
3. **Port Conflict**: Change PORT in `.env.local`
4. **Frontend Changes**: Rebuild with `cd frontend && npm run build`
5. **API Testing**: Use browser console or Postman

---

## 📞 Support

If something doesn't work:

1. Check console output for errors
2. Verify CSV file format
3. Check database was created: `ls data/local_database.db`
4. Test API directly: `curl http://localhost:5000/api/health`

---

**🎉 Enjoy your local MahaRERA dashboard!**
