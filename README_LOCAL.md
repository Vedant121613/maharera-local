# 🏠 Run MahaRERA Dashboard Locally (No Cloud Dependencies)

## 🎯 What This Does

- ✅ Runs **completely offline** on your computer
- ✅ Uses **SQLite** (no PostgreSQL installation needed)
- ✅ Imports your **existing CSV data** automatically
- ✅ Same beautiful dashboard as production
- ✅ No scraping needed - just view your data!

---

## ⚡ Quick Start (2 Commands)

```powershell
# 1. Run the setup script
.\start-local.ps1

# That's it! Browser opens automatically
```

**OR Manual Setup:**

```powershell
# 1. Install dependencies
npm install --save better-sqlite3 cors dotenv express

# 2. Build frontend
cd frontend
npm install
npm run build
cd ..

# 3. Start server
node server-local.js
```

**Then open:** `http://localhost:5000`

---

## 📁 Your Data Files

The server automatically imports these CSV files:

```
data/
├── links.csv           ← 11+ project links (Nandurbar, Dhule, etc.)
├── basic_data.csv      ← 11+ project details  
└── scrape_data.csv     ← 7 scraping jobs status
```

---

## 🎮 What You Can Do

### ✅ Dashboard Features (All Working)

1. **View Statistics**
   - Total districts: 36
   - Total links: From your CSV
   - Total data scraped: From your CSV

2. **Browse Districts**
   - See all 36 Maharashtra districts
   - View progress per district

3. **Links Table**
   - View all scraped project links
   - Filter by district
   - Search by RERA ID or name
   - Export to CSV

4. **Basic Data Table**
   - View detailed project information
   - Filter and search
   - Export to CSV

5. **Export Data**
   - Download links as CSV
   - Download basic data as CSV

---

## 🗄️ Database

**Location:** `data/local_database.db` (created automatically)

**Type:** SQLite (single file, no server)

**Tables:**
- `links` - Project links
- `basic_data` - Detailed project data
- `scrape_jobs` - Scraping job status

---

## 📊 Your Current Data

Based on your CSV files:

### Districts with Data:
- ✅ **Nandurbar** (11 links, 2 data SUCCESS, 7 PENDING)
- ✅ **Dhule** (62 links scraped)
- ✅ **Buldana** (40 links, COMPLETED)
- ✅ **Pune** (3700+ links scraped)

### Sample Projects:
```
P49700009502 - Chhoriya Residency Phase 2 (Nandurbar) ✅
P49700008973 - SHREE GANESH IMPERIAL (Nandurbar) ✅
P49700013238 - K R SUNCITY (Nandurbar) ⏳ PENDING
... and more
```

---

## 🔧 Common Tasks

### Add More Data

**Option 1: Add to CSV**
```csv
# Add rows to data/links.csv or data/basic_data.csv
id,district,rera_id,project_name,...
100,Mumbai,P51900012345,New Project,...
```

Then restart:
```powershell
Remove-Item data\local_database.db
node server-local.js
```

**Option 2: Import New CSV**
Just drop your CSV file in `data/` folder and restart!

---

### Change Port

Edit `.env.local`:
```bash
PORT=3000
```

Or run with custom port:
```powershell
$env:PORT=3000; node server-local.js
```

---

### View Database

```powershell
# Install SQLite browser (optional)
# Or use command line:

# Open database
sqlite3 data\local_database.db

# Run queries
SELECT COUNT(*) FROM links;
SELECT COUNT(*) FROM basic_data;
SELECT * FROM links LIMIT 5;

# Exit
.quit
```

---

### Rebuild Frontend

If you make changes to React code:

```powershell
cd frontend
npm run build
cd ..
node server-local.js
```

---

## 🌐 API Endpoints

All working locally:

```
GET  /api/health                    → Health check
GET  /api/dashboard/stats           → Dashboard statistics
GET  /api/scraping/districts        → District status
GET  /api/links?page=1&pageSize=25  → List links
GET  /api/basic-data?page=1         → List basic data
GET  /api/links/export              → Export links CSV
GET  /api/basic-data/export         → Export basic data CSV
```

Test with browser or curl:
```powershell
curl http://localhost:5000/api/health
curl http://localhost:5000/api/dashboard/stats
```

---

## 🐛 Troubleshooting

### Port 5000 already in use

```powershell
# Kill the process using port 5000
netstat -ano | findstr :5000
taskkill /PID <process_id> /F

# Or use different port
$env:PORT=3000; node server-local.js
```

### Frontend not loading

```powershell
# Rebuild frontend
cd frontend
npm run build
cd ..
```

### Database errors

```powershell
# Delete and recreate
Remove-Item data\local_database.db
node server-local.js
```

### CSV import issues

Check your CSV format:
- UTF-8 encoding
- Comma-separated values
- First row = headers
- Quoted values with commas

---

## 📈 Next Steps

### 1. ✅ Run Locally First (You Are Here!)

Get comfortable with the dashboard:
- View your existing data
- Test filtering and search
- Export some CSV files
- Understand the UI

### 2. 🚀 Then Deploy to AWS (Optional)

Once satisfied with local version:
- Follow `FREE_TIER_DEPLOYMENT.md`
- Use PostgreSQL instead of SQLite
- Enable scraping workers
- Access from anywhere

---

## 💡 Pro Tips

1. **Fast Restart**: Delete `local_database.db` to reimport CSV
2. **Dev Mode**: Use `nodemon server-local.js` for auto-restart
3. **Debug**: Check browser console (F12) for errors
4. **Test API**: Use Postman or browser to test endpoints
5. **Backup**: Your CSV files are your backup!

---

## ✅ Success Checklist

- [ ] Node.js installed (v18+)
- [ ] Dependencies installed
- [ ] Frontend built successfully
- [ ] CSV files in `data/` folder
- [ ] Server running: `node server-local.js`
- [ ] Browser opens: `http://localhost:5000`
- [ ] Dashboard displays your data
- [ ] Can view links table
- [ ] Can view basic data table
- [ ] Can export CSV files

---

## 🎉 You're Done!

Your MahaRERA dashboard is running locally with your existing data!

**No internet needed. No PostgreSQL needed. No AWS needed.**

Just pure local development bliss! 🚀

---

## 📞 Having Issues?

Check the console output for errors:
- Red text = errors
- Look for "Error:", "Failed", or stack traces
- Database errors usually mean CSV format issues
- Frontend errors mean build issues

**Need help?** Check `LOCAL_SETUP.md` for detailed documentation.
