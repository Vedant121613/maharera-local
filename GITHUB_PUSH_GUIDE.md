# 📤 Push to GitHub - Complete Guide

## Step 1: Create .gitignore File

First, let's make sure we don't commit sensitive files:

```powershell
# Create .gitignore if it doesn't exist
New-Item -ItemType File -Path .gitignore -Force
```

Add this content to `.gitignore`:

```
# Dependencies
node_modules/
frontend/node_modules/
scraper_worker/venv/

# Environment files (NEVER COMMIT THESE!)
.env
.env.local
.env.production
frontend/.env
frontend/.env.local
scraper_worker/.env

# Database files
data/local_database.db*
*.db
*.db-shm
*.db-wal

# Logs
*.log
npm-debug.log*

# OS files
.DS_Store
Thumbs.db
desktop.ini

# IDE files
.vscode/
.idea/
*.swp
*.swo

# Build outputs
frontend/dist/
frontend/build/

# Python
__pycache__/
*.py[cod]
*.so
.Python

# Scraper output
scraper_worker/data/*.xlsx
scraper_worker/data/*.db
scraper_worker/debug_pages/

# Certificate PDFs (if any)
*.pdf
```

---

## Step 2: Initialize Git (if not already)

```powershell
# Check if git is initialized
git status

# If error, initialize git
git init
```

---

## Step 3: Create Repository on GitHub

1. Go to https://github.com
2. Click **"New repository"** (+ icon, top right)
3. Repository name: `rera-new-data-shravni`
4. Description: `MahaRERA Data Scraper Dashboard`
5. Choose **Private** (recommended) or Public
6. **DON'T** check "Initialize with README"
7. Click **"Create repository"**

GitHub will show you instructions. Follow steps below instead:

---

## Step 4: Add All Files to Git

```powershell
# Check what will be committed
git status

# Add all files (respects .gitignore)
git add .

# Verify what's staged
git status
```

**Should see:**
```
✅ server.js
✅ server-local.js
✅ package.json
✅ frontend/
✅ scraper_worker/
✅ documentation files
❌ .env (ignored)
❌ node_modules/ (ignored)
❌ data/*.db (ignored)
```

---

## Step 5: Commit Your Changes

```powershell
git commit -m "Initial commit: MahaRERA scraper dashboard with local and AWS deployment"
```

---

## Step 6: Connect to GitHub Repository

```powershell
# Replace YOUR_USERNAME with your GitHub username
git remote add origin https://github.com/YOUR_USERNAME/rera-new-data-shravni.git

# Verify remote
git remote -v
```

---

## Step 7: Push to GitHub

```powershell
# Set main branch
git branch -M main

# Push to GitHub
git push -u origin main
```

**First time pushing?** GitHub will ask for authentication:

### Option A: Personal Access Token (Recommended)

1. Go to GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Generate new token
3. Select scopes: `repo` (all)
4. Copy the token (save it somewhere!)
5. When prompted:
   - Username: your GitHub username
   - Password: paste the token

### Option B: GitHub CLI

```powershell
# Install GitHub CLI
winget install GitHub.cli

# Login
gh auth login

# Then push
git push -u origin main
```

---

## Step 8: Verify Upload

1. Go to your GitHub repository page
2. You should see all your files
3. Check that `.env` files are **NOT** there (good!)
4. Check that `node_modules/` is **NOT** there (good!)

---

## 🔄 Future Updates

When you make changes:

```powershell
# Check what changed
git status

# Add changes
git add .

# Commit with message
git commit -m "Description of what you changed"

# Push to GitHub
git push
```

---

## 📋 Common Git Commands

```powershell
# See status
git status

# See commit history
git log --oneline

# See what changed
git diff

# Undo uncommitted changes
git checkout .

# Create new branch
git checkout -b feature-name

# Switch branch
git checkout main

# Pull latest from GitHub
git pull

# Clone on another computer
git clone https://github.com/YOUR_USERNAME/rera-new-data-shravni.git
```

---

## 🛡️ Security Checklist

Before pushing, verify:

- [ ] `.gitignore` file exists
- [ ] `.env` files are listed in `.gitignore`
- [ ] No database files (`.db`) will be committed
- [ ] No `node_modules/` directory
- [ ] No passwords or tokens in code
- [ ] Run `git status` to verify what will be pushed

---

## 🚨 If You Accidentally Committed .env

If you already pushed sensitive files:

```powershell
# Remove from git (keeps local file)
git rm --cached .env
git rm --cached scraper_worker/.env

# Commit removal
git commit -m "Remove sensitive files"

# Push
git push

# Then change all passwords/tokens immediately!
```

---

## ✅ Done!

Your code is now on GitHub! 

**Repository URL:** `https://github.com/YOUR_USERNAME/rera-new-data-shravni`

Now you can:
1. Clone it on AWS EC2
2. Share with others (if public)
3. Have version control
4. Deploy easily

Next: Follow **DEPLOY_TO_AWS.md** to deploy to your EC2 instance!
