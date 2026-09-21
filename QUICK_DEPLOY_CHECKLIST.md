# ✅ Quick Deployment Checklist

## 🎯 Goal
Deploy your working local app to AWS EC2: `13.232.174.98`

---

## Part 1: Prepare on Your PC (15 minutes)

### ✅ Step 1: Create .gitignore
```powershell
# Already done! You have .gitignore file
```

### ✅ Step 2: Push to GitHub
```powershell
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/rera-new-data-shravni.git
git branch -M main
git push -u origin main
```

**Need help?** See `GITHUB_PUSH_GUIDE.md`

---

## Part 2: Connect to AWS (5 minutes)

### ✅ Step 3: Connect via SSH

**Option A: AWS Console (Easiest)**
1. Go to AWS Console → EC2 → Instances
2. Select instance `i-0117759ca0d94e3f9`
3. Click **"Connect"** button
4. Choose **"Session Manager"** or **"EC2 Instance Connect"**
5. Click **"Connect"**

**Option B: SSH from your PC**
```powershell
ssh -i your-key.pem ec2-user@13.232.174.98
```

---

## Part 3: Setup on AWS EC2 (30 minutes)

### ✅ Step 4: Install Everything
```bash
# Copy and paste this entire block:
sudo yum update -y
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs postgresql-server postgresql-contrib python3.11 python3.11-pip git
wget https://dl.google.com/linux/direct/google-chrome-stable_current_x86_64.rpm
sudo yum install -y ./google-chrome-stable_current_x86_64.rpm
rm google-chrome-stable_current_x86_64.rpm
```

### ✅ Step 5: Setup PostgreSQL
```bash
sudo postgresql-setup initdb
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Create database
sudo -u postgres psql << EOF
CREATE DATABASE maharera;
CREATE USER maharera_user WITH PASSWORD 'SecurePass123!';
GRANT ALL PRIVILEGES ON DATABASE maharera TO maharera_user;
ALTER DATABASE maharera OWNER TO maharera_user;
\q
EOF

# Configure access
sudo sed -i 's/local   all   all                                     peer/local   all   all                                     md5/' /var/lib/pgsql/data/pg_hba.conf
echo "host    all    all    127.0.0.1/32    md5" | sudo tee -a /var/lib/pgsql/data/pg_hba.conf
sudo systemctl restart postgresql
```

### ✅ Step 6: Clone Your Code
```bash
cd ~
git clone https://github.com/YOUR_USERNAME/rera-new-data-shravni.git
cd rera-new-data-shravni
```

### ✅ Step 7: Install Dependencies
```bash
# Node dependencies
npm install
cd frontend && npm install && npm run build && cd ..

# Python dependencies
cd scraper_worker
python3.11 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
deactivate
cd ..
```

### ✅ Step 8: Create Config Files
```bash
# Generate WORKER_TOKEN
WORKER_TOKEN=$(openssl rand -hex 32)

# Server .env
cat > .env << EOF
DATABASE_URL=postgresql://maharera_user:SecurePass123!@localhost:5432/maharera
WORKER_TOKEN=$WORKER_TOKEN
PORT=5000
NODE_ENV=production
EOF

# Worker .env
cat > scraper_worker/.env << EOF
API_BASE_URL=http://localhost:5000
WORKER_TOKEN=$WORKER_TOKEN
WORKER_ID=aws-ec2-worker-1
POLL_INTERVAL=5
STATUS_CHECK_INTERVAL=3
EOF

echo "✅ Config files created. WORKER_TOKEN: $WORKER_TOKEN"
```

### ✅ Step 9: Create Services
```bash
# Server service
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

# Worker service
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

# Start services
sudo systemctl daemon-reload
sudo systemctl enable maharera-server maharera-worker
sudo systemctl start maharera-server maharera-worker
```

### ✅ Step 10: Install Nginx
```bash
sudo yum install -y nginx

# Configure Nginx
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

sudo systemctl start nginx
sudo systemctl enable nginx
```

---

## Part 4: Configure AWS Security Group (2 minutes)

### ✅ Step 11: Open Port 80

1. AWS Console → EC2 → Security Groups
2. Find your instance's security group
3. Edit **Inbound Rules**
4. Add rule:
   - Type: HTTP
   - Port: 80
   - Source: 0.0.0.0/0
5. Save

---

## Part 5: Upload Your Data (5 minutes)

### ✅ Step 12: Transfer CSV Files

**Option A: From your PC**
```powershell
scp -i your-key.pem data/*.csv ec2-user@13.232.174.98:~/rera-new-data-shravni/data/
```

**Option B: Via Dashboard**
1. Open http://13.232.174.98
2. Go to Links page → Upload → select `links.csv`
3. Go to Basic Data page → Upload → select `basic_data.csv`

---

## 🎉 Part 6: Test & Verify

### ✅ Step 13: Check Everything

```bash
# On EC2, check status
sudo systemctl status maharera-server
sudo systemctl status maharera-worker
curl http://localhost:5000/api/health
```

### ✅ Step 14: Open in Browser

**Visit:** `http://13.232.174.98`

You should see:
- ✅ Dashboard loads
- ✅ Your data is visible
- ✅ Can navigate pages
- ✅ No errors

---

## 🐛 Quick Troubleshooting

### Server not starting?
```bash
sudo journalctl -u maharera-server -n 50
```

### Can't access from browser?
```bash
# Check nginx
sudo systemctl status nginx

# Check security group has port 80 open
```

### Worker not running?
```bash
sudo journalctl -u maharera-worker -n 50
```

---

## 📊 Monitor Your App

```bash
# Create quick status check
cat > ~/status.sh << 'EOF'
#!/bin/bash
echo "Server: $(systemctl is-active maharera-server)"
echo "Worker: $(systemctl is-active maharera-worker)"
echo "Nginx: $(systemctl is-active nginx)"
curl -s http://localhost:5000/api/health | jq '.'
EOF

chmod +x ~/status.sh
~/status.sh
```

---

## ✅ Final Checklist

- [ ] Code pushed to GitHub
- [ ] Connected to EC2 via SSH
- [ ] PostgreSQL installed and running
- [ ] Node.js, Python, Chrome installed
- [ ] Code cloned from GitHub
- [ ] Dependencies installed
- [ ] Config files created
- [ ] Services created and started
- [ ] Nginx installed and running
- [ ] Security group port 80 open
- [ ] CSV data uploaded
- [ ] Dashboard accessible at http://13.232.174.98
- [ ] All features working

---

## 🎯 Your App URLs

- **Dashboard:** http://13.232.174.98
- **API Health:** http://13.232.174.98/api/health
- **Stats:** http://13.232.174.98/api/dashboard/stats

---

## 🚀 Next Steps

1. **Test all features** - Make sure everything works
2. **Start scraping** - Try scraping a district
3. **Monitor logs** - Watch for errors
4. **Setup backups** - Database backup script
5. **Add domain** - Point your domain to this IP (optional)
6. **Setup SSL** - Use Let's Encrypt for HTTPS (optional)

---

**Your app is now live on AWS!** 🎉

**Total Time:** ~60 minutes from start to finish

Need detailed help? See:
- `DEPLOY_TO_AWS.md` - Full deployment guide
- `GITHUB_PUSH_GUIDE.md` - GitHub instructions
- `FREE_TIER_DEPLOYMENT.md` - Detailed AWS setup
