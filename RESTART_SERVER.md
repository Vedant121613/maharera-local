# 🔄 How to Restart Local Server

## Quick Restart

If the server is running and you need to restart:

```powershell
# Press Ctrl+C in the terminal to stop

# Then start again
node server-local.js
```

---

## Full Reload (Reimport CSV Data)

If you updated your CSV files and want to reload data:

```powershell
# 1. Stop server (Ctrl+C)

# 2. Delete database
Remove-Item data\local_database.db

# 3. Start server (will reimport CSV)
node server-local.js
```

---

## Browser Cache Issues

If you see 404 errors or old UI:

```powershell
# 1. Hard refresh in browser
Ctrl + Shift + R

# 2. Or clear browser cache
Ctrl + Shift + Delete

# 3. Close all browser tabs for localhost:5000

# 4. Restart server
node server-local.js

# 5. Open fresh browser tab
```

---

## Complete Fresh Start

```powershell
# 1. Stop server (Ctrl+C)

# 2. Clean database
Remove-Item data\local_database.db

# 3. Rebuild frontend
cd frontend
npm run build
cd ..

# 4. Start server
node server-local.js

# 5. Hard refresh browser (Ctrl+Shift+R)
```

---

## Changes I Just Made

I added the missing scraping control endpoints so the UI won't show 404 errors when you try to start/stop scraping.

**Please restart your server:**

```powershell
# Press Ctrl+C to stop
# Then run:
node server-local.js
```

**Then refresh your browser with:** `Ctrl + Shift + R`

The 404 errors should be gone!

---

## What the Scraping Buttons Do (Local Mode)

In local mode, the start/stop/resume buttons won't actually scrape (since we're working with existing CSV data), but they will:

- ✅ Return current status without errors
- ✅ Show proper UI feedback
- ✅ Not break the dashboard

**Note:** To actually scrape new data, you need to:
1. Deploy to AWS (see FREE_TIER_DEPLOYMENT.md)
2. Setup PostgreSQL
3. Run Python worker processes

For now, just enjoy viewing your existing data! 📊
