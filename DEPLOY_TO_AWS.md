# 🚀 Deploy to AWS - Complete Guide

## Your AWS Instance Info (From Screenshot)

```
Instance ID: i-0117759ca0d94e3f9
Instance Name: maharera-scraper
Public IP: 13.232.174.98
Instance State: ✅ Running
Instance Type: m7i.flex.large
Region: ap-south-1 (Mumbai)
```

---

## 📋 Complete Deployment Steps

### PART 1: Prepare Your Code (On Your PC)

#### Step 1: Update package.json

```powershell
# Edit package.json to use production server
```

Create `.env.production` file:

```bash
DATABASE_URL=postgresql://maharera_user:YOUR_PASSWORD@localhost:5432/maharera
WORKER_TOKEN=your-secure-32-byte-token
PORT=5000
NODE_ENV=production
```

#### Step 2: Push to GitHub

```powershell
# Initialize git (if not already)
git init
git add .
git commit -m "Initial commit - MahaRERA scraper"

# Create repository on GitHub, then:
git remote add origin https://github.com/YOUR_USERNAME/rera-new-data-shravni.git
git branch -M main
git push -u origin main
```

---

### PART 2: Connect to Your AWS Instance

#### Step 1: Get Your SSH Key

You need your `.pem` key file to connect. If you don't have it:
1. Go to AWS Console → EC2 → Key Pairs
2. Download or create new key pair
3. Save as `maharera-key.pem`

#### Step 2: Connect via SSH

```powershell
# Set correct permissions (if needed)
icacls maharera-key.pem /inheritance:r
icacls maharera-key.pem /grant:r "%username%:R"

# Connect to your instance
ssh -i maharera-key.pem ec2-user@13.232.174.98
```

Or use **AWS Console → Connect** button (easier!)

---

### PART 3: Setup on AWS Instance

Once connected via SSH, run these commands:

#### Step 1: Update System

```bash
sudo yum update -y
```

#### Step 2: Install Node.js 20

```bash
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs
node --version  # Should show v20.x.x
```

#### Step 3: Install PostgreSQL

```bash
sudo amazon-linux-extras install postgresql14 -y
sudo yum install -y postgresql-server postgresql-contrib
sudo postgresql-setup initdb
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

#### Step 4: Configure PostgreSQL

```bash
# Switch to postgres user
sudo -u postgres psql

# In PostgreSQL prompt:
CREATE DATABASE maharera;
CREATE USER maharera_user WITH PASSWORD 'YourSecurePassword123!';
GRANT ALL PRIVILEGES ON DATABASE maharera TO maharera_user;
ALTER DATABASE maharera OWNER TO maharera_user;
\q

# Edit config to allow local connections
sudo nano /var/lib/pgsql/data/pg_hba.conf
```

Change this line:
```
FROM: local   all   all   peer
TO:   local   all   all   md5
```

Add this line:
```
host    all    all    127.0.0.1/32    md5
```

Save and restart:
```bash
sudo systemctl restart postgresql

# Test connection
psql -h localhost -U maharera_user -d maharera
# Enter password when prompted
\q
```

#### Step 5: Install Python 3.11 & Chrome (for scraper)

```bash
# Install Python
sudo yum install -y python3.11 python3.11-pip

# Install Chrome
wget https://dl.google.com/linux/direct/google-chrome-stable_current_x86_64.rpm
sudo yum install -y ./google-chrome-stable_current_x86_64.rpm
rm google-chrome-stable_current_x86_64.rpm

# Verify
google-chrome --version
python3.11 --version
```

#### Step 6: Clone Your Repository

```bash
cd ~
git clone https://github.com/YOUR_USERNAME/rera-new-data-shravni.git
cd rera-new-data-shravni
```

#### Step 7: Setup Application

```bash
# Install Node dependencies
npm install

# Build frontend
cd frontend
npm install
npm run build
cd ..

# Create .env file
cat > .env << 'EOF'
DATABASE_URL=postgresql://maharera_user:YourSecurePassword123!@localhost:5432/maharera
WORKER_TOKEN=$(openssl rand -hex 32)
PORT=5000
NODE_ENV=production
EOF

# Save the WORKER_TOKEN
grep WORKER_TOKEN .env
# IMPORTANT: Copy this token!
```

#### Step 8: Setup Python Worker

```bash
cd scraper_worker

# Create virtual environment
python3.11 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Create .env file (use same WORKER_TOKEN from above!)
cat > .env << 'EOF'
API_BASE_URL=http://localhost:5000
WORKER_TOKEN=YOUR_WORKER_TOKEN_FROM_ABOVE
WORKER_ID=aws-ec2-worker-1
POLL_INTERVAL=5
STATUS_CHECK_INTERVAL=3
EOF

# Edit to add your actual token
nano .env
# Press Ctrl+X, Y, Enter to save

deactivate
cd ..
```

#### Step 9: Import Your CSV Data (Optional)

```bash
# Upload your CSV files to EC2
# On your PC (new PowerShell window):
scp -i maharera-key.pem data/*.csv ec2-user@13.232.174.98:~/rera-new-data-shravni/data/

# Back on EC2, import to PostgreSQL
# We'll use the upload endpoints from the dashboard
```

#### Step 10: Create Systemd Services

**Server Service:**
```bash
sudo nano /etc/systemd/system/maharera-server.service
```

Paste this:
```ini
[Unit]
Description=MahaRERA Express Server
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=ec2-user
WorkingDirectory=/home/ec2-user/rera-new-data-shravni
EnvironmentFile=/home/ec2-user/rera-new-data-shravni/.env
ExecStart=/usr/bin/node /home/ec2-user/rera-new-data-shravni/server.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

**Worker Service:**
```bash
sudo nano /etc/systemd/system/maharera-worker.service
```

Paste this:
```ini
[Unit]
Description=MahaRERA Python Scraper Worker
After=network.target maharera-server.service
Requires=maharera-server.service

[Service]
Type=simple
User=ec2-user
WorkingDirectory=/home/ec2-user/rera-new-data-shravni/scraper_worker
EnvironmentFile=/home/ec2-user/rera-new-data-shravni/scraper_worker/.env
ExecStart=/home/ec2-user/rera-new-data-shravni/scraper_worker/venv/bin/python /home/ec2-user/rera-new-data-shravni/scraper_worker/worker.py
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

**Enable and Start:**
```bash
sudo systemctl daemon-reload
sudo systemctl enable maharera-server
sudo systemctl enable maharera-worker
sudo systemctl start maharera-server
sudo systemctl start maharera-worker

# Check status
sudo systemctl status maharera-server
sudo systemctl status maharera-worker
```

#### Step 11: Install Nginx

```bash
sudo yum install -y nginx

# Configure Nginx
sudo nano /etc/nginx/conf.d/maharera.conf
```

Paste this:
```nginx
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
        
        proxy_connect_timeout 600;
        proxy_send_timeout 600;
        proxy_read_timeout 600;
        send_timeout 600;
    }
}
```

Start Nginx:
```bash
sudo systemctl start nginx
sudo systemctl enable nginx
sudo systemctl status nginx
```

---

### PART 4: Configure AWS Security Group

In AWS Console:

1. Go to **EC2 → Security Groups**
2. Find security group for your instance
3. Edit **Inbound Rules**
4. Add these rules:

```
Type        Protocol    Port    Source          Description
HTTP        TCP         80      0.0.0.0/0      Public web access
HTTPS       TCP         443     0.0.0.0/0      Secure access (future)
SSH         TCP         22      Your IP        SSH access
Custom TCP  TCP         5000    Your IP        Direct API (optional)
```

5. Click **Save Rules**

---

### PART 5: Import Your CSV Data

#### Option 1: Via Dashboard UI

1. Open browser: `http://13.232.174.98`
2. Go to **Links** page
3. Click **Upload** button
4. Select `data/links.csv`
5. Go to **Basic Data** page
6. Click **Upload** button
7. Select `data/basic_data.csv`

#### Option 2: Via Command Line

```bash
# On EC2 instance
cd ~/rera-new-data-shravni

# Upload links
curl -X POST http://localhost:5000/api/links/upload \
  -F "file=@data/links.csv"

# Upload basic data
curl -X POST http://localhost:5000/api/basic-data/upload \
  -F "file=@data/basic_data.csv"
```

---

## 🎉 You're Live!

**Open your browser:** `http://13.232.174.98`

You should see your MahaRERA dashboard with all your data! ✅

---

## 🔧 Useful Commands

### View Logs
```bash
# Server logs
sudo journalctl -u maharera-server -f

# Worker logs
sudo journalctl -u maharera-worker -f

# Last 100 lines
sudo journalctl -u maharera-server -n 100
```

### Restart Services
```bash
sudo systemctl restart maharera-server
sudo systemctl restart maharera-worker
sudo systemctl restart nginx
```

### Update Code (after git push)
```bash
cd ~/rera-new-data-shravni
git pull
npm install
cd frontend && npm install && npm run build && cd ..
cd scraper_worker && source venv/bin/activate && pip install -r requirements.txt && deactivate && cd ..
sudo systemctl restart maharera-server
sudo systemctl restart maharera-worker
```

### Database Queries
```bash
psql -h localhost -U maharera_user -d maharera

# Inside PostgreSQL:
SELECT COUNT(*) FROM links;
SELECT COUNT(*) FROM basic_data;
SELECT * FROM scrape_jobs;
\q
```

### Check Status
```bash
# All services
sudo systemctl status maharera-server maharera-worker nginx postgresql

# Quick health check
curl http://localhost:5000/api/health
```

---

## 🐛 Troubleshooting

### Server won't start
```bash
sudo journalctl -u maharera-server -n 50
# Check DATABASE_URL in .env
# Check PostgreSQL is running
```

### Worker won't start
```bash
sudo journalctl -u maharera-worker -n 50
# Check WORKER_TOKEN matches
# Check Chrome is installed
```

### Can't access from browser
```bash
# Check Nginx
sudo systemctl status nginx

# Check Security Group has port 80 open
# Try from EC2: curl http://localhost

# Check server is running
sudo systemctl status maharera-server
```

### Database connection failed
```bash
# Check PostgreSQL
sudo systemctl status postgresql

# Test connection
psql -h localhost -U maharera_user -d maharera

# Check pg_hba.conf
sudo cat /var/lib/pgsql/data/pg_hba.conf
```

---

## 📊 Monitor Your App

```bash
# Create monitoring script
cat > ~/monitor.sh << 'EOF'
#!/bin/bash
echo "=== MahaRERA Status ==="
echo "Server: $(systemctl is-active maharera-server)"
echo "Worker: $(systemctl is-active maharera-worker)"
echo "Nginx: $(systemctl is-active nginx)"
echo "PostgreSQL: $(systemctl is-active postgresql)"
echo ""
echo "Database Stats:"
psql -h localhost -U maharera_user -d maharera -c "SELECT 'Links' as table, COUNT(*) FROM links UNION ALL SELECT 'Basic Data', COUNT(*) FROM basic_data UNION ALL SELECT 'Jobs', COUNT(*) FROM scrape_jobs;"
EOF

chmod +x ~/monitor.sh
~/monitor.sh
```

---

## ✅ Deployment Checklist

- [ ] PostgreSQL installed and running
- [ ] Database created (maharera)
- [ ] User created (maharera_user)
- [ ] Node.js 20 installed
- [ ] Python 3.11 installed
- [ ] Chrome installed
- [ ] Code cloned from GitHub
- [ ] Dependencies installed (npm + pip)
- [ ] Frontend built
- [ ] .env files created (with matching WORKER_TOKEN)
- [ ] Systemd services created
- [ ] Services started and enabled
- [ ] Nginx installed and configured
- [ ] Security Group configured (port 80 open)
- [ ] CSV data imported
- [ ] Dashboard accessible via http://13.232.174.98
- [ ] Can start/stop scraping jobs
- [ ] Worker is processing jobs

---

## 🎯 Next Steps After Deployment

1. **Test everything** - Try all features
2. **Setup backups** - Regular database backups
3. **Add domain** - Point your domain to the IP
4. **Setup SSL** - Use Let's Encrypt for HTTPS
5. **Monitor logs** - Watch for errors
6. **Scale if needed** - Add more workers

---

**Your app is now live on AWS!** 🚀

Access at: `http://13.232.174.98`
