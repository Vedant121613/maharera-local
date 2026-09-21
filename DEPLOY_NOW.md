# 🚀 Deploy to AWS NOW - Quick Guide

## Your AWS Instance (From Screenshot)
```
✅ Instance Running: i-0117759ca0d94e3f9 (maharera-scraper)
✅ Public IP: 13.232.174.98
✅ Region: ap-south-1 (Mumbai)
✅ Type: m7i.flex.large (Good for your app!)
```

---

## 🎯 3-Step Deployment Process

### STEP 1: Push to GitHub (5 minutes)
### STEP 2: Deploy to AWS (30 minutes)
### STEP 3: Test & Go Live (5 minutes)

---

## 📤 STEP 1: Push to GitHub

Open PowerShell in your project folder:

```powershell
# Initialize git (if not already)
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit: MahaRERA dashboard"

# Create repository on GitHub (https://github.com/new)
# Then connect:
git remote add origin https://github.com/YOUR_USERNAME/rera-new-data-shravni.git
git branch -M main
git push -u origin main
```

**Done!** Your code is on GitHub ✅

---

## 🌐 STEP 2: Deploy to AWS

### Connect to Your EC2

**Option A: AWS Console (Easiest)**
1. Go to AWS Console → EC2
2. Select your instance (i-0117759ca0d94e3f9)
3. Click **"Connect"** button
4. Choose **"EC2 Instance Connect"**
5. Click **"Connect"**

**Option B: SSH**
```powershell
ssh -i your-key.pem ec2-user@13.232.174.98
```

---

### Run These Commands on EC2

**Copy & paste each block:**

#### 1️⃣ Install Everything (5 min)
```bash
sudo yum update -y && \
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash - && \
sudo yum install -y nodejs postgresql-server postgresql-contrib python3.11 python3.11-pip git nginx && \
wget -q https://dl.google.com/linux/direct/google-chrome-stable_current_x86_64.rpm && \
sudo yum install -y ./google-chrome-stable_current_x86_64.rpm && \
rm google-chrome-stable_current_x86_64.rpm && \
echo "✅ All packages installed!"
```

#### 2️⃣ Setup PostgreSQL (2 min)
```bash
sudo postgresql-setup initdb && \
sudo systemctl start postgresql && \
sudo systemctl enable postgresql && \
sudo -u postgres psql -c "CREATE DATABASE maharera;" && \
sudo -u postgres psql -c "CREATE USER maharera_user WITH PASSWORD 'SecurePass123!';" && \
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE maharera TO maharera_user;" && \
sudo -u postgres psql -c "ALTER DATABASE maharera OWNER TO maharera_user;" && \
sudo sed -i 's/peer/md5/' /var/lib/pgsql/data/pg_hba.conf && \
echo "host all all 127.0.0.1/32 md5" | sudo tee -a /var/lib/pgsql/data/pg_hba.conf && \
sudo systemctl restart postgresql && \
echo "✅ PostgreSQL configured!"
```

#### 3️⃣ Clone Your Code (1 min)
```bash
cd ~ && \
git clone https://github.com/YOUR_USERNAME/rera-new-data-shravni.git && \
cd rera-new-data-shravni && \
echo "✅ Code cloned!"
```

#### 4️⃣ Install Dependencies (5 min)
```bash
npm install && \
cd frontend && npm install && npm run build && cd .. && \
cd scraper_worker && python3.11 -m venv venv && source venv/bin/activate && pip install -r requirements.txt && deactivate && cd .. && \
echo "✅ Dependencies installed!"
```

#### 5️⃣ Create Config Files (1 min)
```bash
WORKER_TOKEN=$(openssl rand -hex 32) && \
cat > .env << EOF
DATABASE_URL=postgresql://maharera_user:SecurePass123!@localhost:5432/maharera
WORKER_TOKEN=$WORKER_TOKEN
PORT=5000
NODE_ENV=production
EOF
cat > scraper_worker/.env << EOF
API_BASE_URL=http://localhost:5000
WORKER_TOKEN=$WORKER_TOKEN
WORKER_ID=aws-ec2-worker-1
POLL_INTERVAL=5
STATUS_CHECK_INTERVAL=3
EOF
echo "✅ Config files created! Token: $WORKER_TOKEN"
```

#### 6️⃣ Create & Start Services (2 min)
```bash
# Create server service
sudo tee /etc/systemd/system/maharera-server.service > /dev/null << 'EOF'
[Unit]
Description=MahaRERA Express Server
After=network.target postgresql.service
[Service]
Type=simple
User=ec2-user
WorkingDirectory=/home/ec2-user/rera-new-data-shravni
EnvironmentFile=/home/ec2-user/rera-new-data-shravni/.env
ExecStart=/usr/bin/node /home/ec2-user/rera-new-data-shravni/server.js
Restart=always
RestartSec=10
[Install]
WantedBy=multi-user.target
EOF

# Create worker service
sudo tee /etc/systemd/system/maharera-worker.service > /dev/null << 'EOF'
[Unit]
Description=MahaRERA Python Worker
After=network.target maharera-server.service
[Service]
Type=simple
User=ec2-user
WorkingDirectory=/home/ec2-user/rera-new-data-shravni/scraper_worker
EnvironmentFile=/home/ec2-user/rera-new-data-shravni/scraper_worker/.env
ExecStart=/home/ec2-user/rera-new-data-shravni/scraper_worker/venv/bin/python /home/ec2-user/rera-new-data-shravni/scraper_worker/worker.py
Restart=always
RestartSec=10
[Install]
WantedBy=multi-user.target
EOF

# Start everything
sudo systemctl daemon-reload && \
sudo systemctl enable maharera-server maharera-worker && \
sudo systemctl start maharera-server maharera-worker && \
echo "✅ Services started!"
```

#### 7️⃣ Setup Nginx (1 min)
```bash
sudo tee /etc/nginx/conf.d/maharera.conf > /dev/null << 'EOF'
server {
    listen 80;
    server_name _;
    client_max_body_size 100M;
    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF
sudo systemctl start nginx && \
sudo systemctl enable nginx && \
echo "✅ Nginx configured!"
```

#### 8️⃣ Check Status
```bash
echo "=== Service Status ===" && \
echo "Server: $(systemctl is-active maharera-server)" && \
echo "Worker: $(systemctl is-active maharera-worker)" && \
echo "Nginx: $(systemctl is-active nginx)" && \
echo "" && \
curl -s http://localhost:5000/api/health && \
echo "" && \
echo "✅ All services running!"
```

---

## 🔐 STEP 2.5: Open Port 80 in AWS

1. Go to AWS Console → EC2 → Security Groups
2. Find security group for instance `i-0117759ca0d94e3f9`
3. Click **"Edit inbound rules"**
4. Click **"Add rule"**:
   - Type: **HTTP**
   - Port: **80**
   - Source: **0.0.0.0/0**
5. Click **"Save rules"**

---

## ✅ STEP 3: Test & Go Live!

### Open Your Browser

Visit: **http://13.232.174.98**

You should see:
- ✅ MahaRERA Dashboard
- ✅ Statistics on homepage
- ✅ Districts page
- ✅ Links page
- ✅ Basic Data page

---

## 📤 Upload Your CSV Data

Two options:

### Option A: Via Dashboard (Easiest)
1. Go to **Links** page
2. Click **Upload** button
3. Select `data/links.csv` from your PC
4. Go to **Basic Data** page
5. Click **Upload** button
6. Select `data/basic_data.csv` from your PC

### Option B: Via SCP
```powershell
# From your PC
scp -i your-key.pem data/*.csv ec2-user@13.232.174.98:~/rera-new-data-shravni/data/
```

---

## 🎉 You're Live!

Your application is now running at:
```
🌐 http://13.232.174.98
```

---

## 📊 Quick Status Check

On EC2:
```bash
# Check everything
~/status.sh

# Or manually:
sudo systemctl status maharera-server maharera-worker nginx
curl http://localhost:5000/api/health
```

---

## 🔄 Update Your App (Future)

When you make changes:

```powershell
# On your PC - commit and push
git add .
git commit -m "Your changes"
git push
```

```bash
# On EC2 - pull and restart
cd ~/rera-new-data-shravni
git pull
npm install
cd frontend && npm run build && cd ..
sudo systemctl restart maharera-server maharera-worker
```

---

## 🐛 Troubleshooting

### Check Logs
```bash
# Server logs
sudo journalctl -u maharera-server -n 50

# Worker logs
sudo journalctl -u maharera-worker -n 50

# Nginx logs
sudo tail -f /var/log/nginx/error.log
```

### Restart Everything
```bash
sudo systemctl restart maharera-server maharera-worker nginx postgresql
```

### Check Database
```bash
psql -h localhost -U maharera_user -d maharera
# Password: SecurePass123!
# Then: SELECT COUNT(*) FROM links;
```

---

## ✅ Success Checklist

After deployment, verify:

- [ ] Can access http://13.232.174.98
- [ ] Dashboard loads properly
- [ ] Can navigate all pages
- [ ] CSV data visible in tables
- [ ] Can filter and search
- [ ] Can start/stop scraping jobs
- [ ] Worker is processing jobs
- [ ] No errors in logs

---

## 🎯 What's Working

✅ **Same app as localhost** - Just on cloud!
✅ **Real scraping** - Python workers actually scrape
✅ **Live database** - PostgreSQL with your data
✅ **Public access** - Anyone can visit (if you share IP)
✅ **Always on** - Runs 24/7 even when your PC is off

---

## 📚 Documentation

- **QUICK_DEPLOY_CHECKLIST.md** - Step-by-step guide
- **DEPLOY_TO_AWS.md** - Detailed deployment manual
- **GITHUB_PUSH_GUIDE.md** - GitHub instructions
- **FREE_TIER_DEPLOYMENT.md** - Full AWS documentation

---

## 💰 Cost Estimate

With your m7i.flex.large instance:
- **Instance**: ~$30-40/month
- **Data transfer**: ~$5-10/month
- **Total**: ~$40-50/month

**To reduce costs:**
- Switch to t3.small (~$15/month)
- Use Reserved Instances (save 30-40%)
- Stop when not scraping

---

## 🚀 You're Ready!

**Total deployment time:** ~40 minutes

**Your app:** http://13.232.174.98

**Next:** Start scraping some districts! 🎉

---

**Need help?** Check the detailed guides in this folder.

**Everything working?** Enjoy your cloud-deployed MahaRERA scraper! 🎈
