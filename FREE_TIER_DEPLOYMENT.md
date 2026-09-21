# AWS Free Tier Deployment Guide (8GB RAM Instance)

## 🎯 Perfect Setup for Your Instance

With 8GB RAM, you can run **everything on a single EC2 instance**:
- PostgreSQL Database (self-hosted)
- Node.js Express Server
- Python Scraper Workers (2-3 concurrent)
- Nginx as reverse proxy

**Estimated Resource Usage:**
- PostgreSQL: ~500MB RAM
- Node.js Server: ~200MB RAM
- Python Worker (each): ~800MB RAM
- Nginx: ~50MB RAM
- System: ~1GB RAM
- **Total**: ~3-4GB RAM used (plenty of headroom!)

---

## 📋 Complete Deployment Steps

### Step 1: Connect to Your AWS Instance

```bash
# SSH into your instance
ssh -i your-key.pem ec2-user@your-ec2-public-ip

# Or for Ubuntu:
ssh -i your-key.pem ubuntu@your-ec2-public-ip
```

### Step 2: Update System & Install Dependencies

```bash
# Update system
sudo yum update -y  # For Amazon Linux
# OR
sudo apt update && sudo apt upgrade -y  # For Ubuntu

# Install Git
sudo yum install -y git  # Amazon Linux
# OR
sudo apt install -y git  # Ubuntu

# Install Node.js 20
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -  # Amazon Linux
sudo yum install -y nodejs
# OR for Ubuntu:
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node --version  # Should show v20.x.x
npm --version
```

### Step 3: Install PostgreSQL

```bash
# Amazon Linux 2
sudo amazon-linux-extras install postgresql14 -y
sudo yum install postgresql-server postgresql-contrib -y

# Initialize database
sudo postgresql-setup initdb

# Start PostgreSQL
sudo systemctl start postgresql
sudo systemctl enable postgresql

# For Ubuntu:
sudo apt install -y postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### Step 4: Configure PostgreSQL

```bash
# Switch to postgres user
sudo -u postgres psql

# In PostgreSQL prompt, run:
CREATE DATABASE maharera;
CREATE USER maharera_user WITH PASSWORD 'YourSecurePassword123!';
GRANT ALL PRIVILEGES ON DATABASE maharera TO maharera_user;
ALTER DATABASE maharera OWNER TO maharera_user;
\q

# Edit PostgreSQL config to allow local connections
sudo nano /var/lib/pgsql/data/pg_hba.conf
# OR for Ubuntu:
sudo nano /etc/postgresql/14/main/pg_hba.conf

# Change this line:
# FROM: local   all   all   peer
# TO:   local   all   all   md5

# Also add:
host    all             all             127.0.0.1/32            md5

# Restart PostgreSQL
sudo systemctl restart postgresql
```

**Test the connection:**
```bash
psql -h localhost -U maharera_user -d maharera
# Enter password when prompted
# If successful, type \q to exit
```

### Step 5: Install Python 3.11 & Dependencies

```bash
# Install Python 3.11
sudo yum install -y python3.11 python3.11-pip  # Amazon Linux
# OR
sudo apt install -y python3.11 python3.11-venv python3-pip  # Ubuntu

# Verify Python
python3.11 --version

# Install Chrome and ChromeDriver (required for Selenium)
# For Amazon Linux:
sudo yum install -y wget unzip
wget https://dl.google.com/linux/direct/google-chrome-stable_current_x86_64.rpm
sudo yum install -y ./google-chrome-stable_current_x86_64.rpm

# For Ubuntu:
wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
sudo apt install -y ./google-chrome-stable_current_amd64.deb

# Verify Chrome installation
google-chrome --version

# Install ChromeDriver (webdriver-manager will handle this automatically)
```

### Step 6: Clone Your Repository

```bash
# Navigate to home directory
cd ~

# Clone your repository
git clone https://github.com/your-username/rera-new-data-shravni.git
# OR upload your code via SCP:
# scp -i your-key.pem -r ./rera-new-data-shravni ec2-user@your-ip:~/

cd rera-new-data-shravni
```

### Step 7: Setup Node.js Application

```bash
# Install root dependencies (Express server)
npm install

# Install frontend dependencies and build
cd frontend
npm install
npm run build
cd ..

# Create .env file for server
cat > .env << 'EOF'
DATABASE_URL=postgresql://maharera_user:YourSecurePassword123!@localhost:5432/maharera
WORKER_TOKEN=$(openssl rand -hex 32)
PORT=5000
NODE_ENV=production
EOF

# Display and save the WORKER_TOKEN
echo "Your WORKER_TOKEN is:"
grep WORKER_TOKEN .env | cut -d'=' -f2
# IMPORTANT: Copy this token for the next step!
```

### Step 8: Setup Python Worker

```bash
cd scraper_worker

# Create virtual environment
python3.11 -m venv venv

# Activate virtual environment
source venv/bin/activate

# Install Python dependencies
pip install --upgrade pip
pip install -r requirements.txt

# Create .env file for worker
# Replace YOUR_WORKER_TOKEN_HERE with the token from Step 7
cat > .env << 'EOF'
API_BASE_URL=http://localhost:5000
WORKER_TOKEN=YOUR_WORKER_TOKEN_HERE
WORKER_ID=aws-free-tier-worker-1
POLL_INTERVAL=5
STATUS_CHECK_INTERVAL=3
EOF

# Edit the file to add your actual token
nano .env
# Replace YOUR_WORKER_TOKEN_HERE with the actual token, then save (Ctrl+X, Y, Enter)

cd ..
```

### Step 9: Create Systemd Services (Auto-start on boot)

#### A. Create Server Service

```bash
sudo nano /etc/systemd/system/maharera-server.service
```

Add this content:

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

**For Ubuntu**, change `User=ec2-user` to `User=ubuntu` and update paths accordingly.

#### B. Create Worker Service

```bash
sudo nano /etc/systemd/system/maharera-worker.service
```

Add this content:

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

#### C. Enable and Start Services

```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable services (start on boot)
sudo systemctl enable maharera-server
sudo systemctl enable maharera-worker

# Start services
sudo systemctl start maharera-server
sudo systemctl start maharera-worker

# Check status
sudo systemctl status maharera-server
sudo systemctl status maharera-worker

# View logs
sudo journalctl -u maharera-server -f
sudo journalctl -u maharera-worker -f
```

### Step 10: Install and Configure Nginx

```bash
# Install Nginx
sudo yum install -y nginx  # Amazon Linux
# OR
sudo apt install -y nginx  # Ubuntu

# Create Nginx configuration
sudo nano /etc/nginx/conf.d/maharera.conf
```

Add this configuration:

```nginx
server {
    listen 80;
    server_name _;  # Replace with your domain if you have one

    client_max_body_size 100M;  # Allow large file uploads

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
        
        # Timeouts for long-running operations
        proxy_connect_timeout 600;
        proxy_send_timeout 600;
        proxy_read_timeout 600;
        send_timeout 600;
    }
}
```

```bash
# Test Nginx configuration
sudo nginx -t

# Start Nginx
sudo systemctl start nginx
sudo systemctl enable nginx

# Check status
sudo systemctl status nginx
```

### Step 11: Configure AWS Security Group

Go to AWS Console → EC2 → Security Groups:

**Add Inbound Rules:**
- **HTTP**: Port 80, Source: 0.0.0.0/0
- **HTTPS**: Port 443, Source: 0.0.0.0/0 (for future SSL)
- **SSH**: Port 22, Source: Your IP only (for security)
- **Custom TCP**: Port 5000, Source: Your IP only (for testing)

**Save the rules.**

### Step 12: Test Your Deployment

```bash
# Test from server itself
curl http://localhost/api/health

# Test from your computer
curl http://YOUR_EC2_PUBLIC_IP/api/health

# Should return:
# {"status":"OK","database":"Connected"}
```

Open browser and visit:
```
http://YOUR_EC2_PUBLIC_IP
```

You should see your MahaRERA dashboard! 🎉

---

## 🔧 Useful Commands

### Check Application Status
```bash
# Check all services
sudo systemctl status maharera-server
sudo systemctl status maharera-worker
sudo systemctl status postgresql
sudo systemctl status nginx

# Check server logs (real-time)
sudo journalctl -u maharera-server -f

# Check worker logs (real-time)
sudo journalctl -u maharera-worker -f

# Check last 100 lines
sudo journalctl -u maharera-server -n 100
```

### Restart Services
```bash
# Restart server
sudo systemctl restart maharera-server

# Restart worker
sudo systemctl restart maharera-worker

# Restart PostgreSQL
sudo systemctl restart postgresql

# Restart Nginx
sudo systemctl restart nginx
```

### Update Application
```bash
cd ~/rera-new-data-shravni

# Pull latest code
git pull

# Update server dependencies
npm install

# Rebuild frontend
cd frontend
npm install
npm run build
cd ..

# Update worker dependencies
cd scraper_worker
source venv/bin/activate
pip install -r requirements.txt
deactivate
cd ..

# Restart services
sudo systemctl restart maharera-server
sudo systemctl restart maharera-worker
```

### Database Management
```bash
# Connect to database
psql -h localhost -U maharera_user -d maharera

# Backup database
pg_dump -h localhost -U maharera_user maharera > backup_$(date +%Y%m%d).sql

# Restore database
psql -h localhost -U maharera_user maharera < backup_20240101.sql

# Check database size
psql -h localhost -U maharera_user -d maharera -c "SELECT pg_size_pretty(pg_database_size('maharera'));"

# View tables
psql -h localhost -U maharera_user -d maharera -c "\dt"

# Check record counts
psql -h localhost -U maharera_user -d maharera -c "SELECT 'links' as table, COUNT(*) FROM links UNION ALL SELECT 'basic_data', COUNT(*) FROM basic_data UNION ALL SELECT 'scrape_jobs', COUNT(*) FROM scrape_jobs;"
```

### Monitor Resource Usage
```bash
# Check memory usage
free -h

# Check disk usage
df -h

# Check running processes
top

# Check PostgreSQL connections
sudo -u postgres psql -c "SELECT count(*) FROM pg_stat_activity;"

# Check Nginx connections
sudo ss -tuln | grep :80
```

---

## 🔒 Security Hardening

### 1. Setup Firewall (UFW for Ubuntu)
```bash
sudo apt install -y ufw
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### 2. Change Default PostgreSQL Password
```bash
sudo -u postgres psql
ALTER USER postgres WITH PASSWORD 'NewStrongPassword123!';
\q
```

### 3. Setup Automatic Security Updates
```bash
# Amazon Linux
sudo yum install -y yum-cron
sudo systemctl enable yum-cron
sudo systemctl start yum-cron

# Ubuntu
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure --priority=low unattended-upgrades
```

### 4. Setup Fail2Ban (Prevent Brute Force)
```bash
sudo yum install -y fail2ban  # Amazon Linux
# OR
sudo apt install -y fail2ban  # Ubuntu

sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

---

## 📊 Setup Monitoring

### Create Monitoring Script

```bash
nano ~/monitor.sh
```

Add this content:

```bash
#!/bin/bash
echo "=== MahaRERA System Status ==="
echo ""
echo "Server Status:"
systemctl is-active maharera-server
echo ""
echo "Worker Status:"
systemctl is-active maharera-worker
echo ""
echo "Database Status:"
systemctl is-active postgresql
echo ""
echo "Memory Usage:"
free -h | grep Mem
echo ""
echo "Disk Usage:"
df -h / | tail -1
echo ""
echo "Database Stats:"
psql -h localhost -U maharera_user -d maharera -c "SELECT 'Total Links' as metric, COUNT(*) as count FROM links UNION ALL SELECT 'Total Basic Data', COUNT(*) FROM basic_data UNION ALL SELECT 'Pending Jobs', COUNT(*) FROM scrape_jobs WHERE status='PENDING' UNION ALL SELECT 'Running Jobs', COUNT(*) FROM scrape_jobs WHERE status='RUNNING';" 2>/dev/null || echo "Database connection failed"
```

```bash
# Make it executable
chmod +x ~/monitor.sh

# Run it
~/monitor.sh

# Add to cron for daily reports (optional)
crontab -e
# Add this line:
0 9 * * * ~/monitor.sh > ~/daily_report.txt
```

---

## 🚀 Setup SSL Certificate (Free with Let's Encrypt)

### Prerequisites
- You need a domain name pointing to your EC2 IP
- If you don't have a domain, skip this section

```bash
# Install Certbot
sudo yum install -y certbot python3-certbot-nginx  # Amazon Linux
# OR
sudo apt install -y certbot python3-certbot-nginx  # Ubuntu

# Stop Nginx temporarily
sudo systemctl stop nginx

# Get certificate (replace your-domain.com)
sudo certbot certonly --standalone -d your-domain.com

# Update Nginx configuration
sudo nano /etc/nginx/conf.d/maharera.conf
```

Update configuration to:

```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

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
```

```bash
# Test and restart Nginx
sudo nginx -t
sudo systemctl start nginx

# Setup auto-renewal
sudo crontab -e
# Add this line:
0 0 * * * certbot renew --quiet && systemctl reload nginx
```

---

## 🔄 Backup Strategy

### Automated Daily Backups

```bash
# Create backup directory
mkdir -p ~/backups

# Create backup script
nano ~/backup.sh
```

Add this content:

```bash
#!/bin/bash
BACKUP_DIR=~/backups
DATE=$(date +%Y%m%d_%H%M%S)

# Database backup
pg_dump -h localhost -U maharera_user maharera > $BACKUP_DIR/db_backup_$DATE.sql

# Keep only last 7 days
find $BACKUP_DIR -name "db_backup_*.sql" -mtime +7 -delete

echo "Backup completed: $DATE"
```

```bash
# Make executable
chmod +x ~/backup.sh

# Test it
~/backup.sh

# Schedule daily backups at 2 AM
crontab -e
# Add:
0 2 * * * ~/backup.sh >> ~/backup.log 2>&1
```

---

## 🐛 Troubleshooting

### Server won't start
```bash
# Check logs
sudo journalctl -u maharera-server -n 50

# Common issues:
# 1. Database connection failed - check DATABASE_URL in .env
# 2. Port already in use - check: sudo lsof -i :5000
# 3. Missing environment variables - check: cat .env
```

### Worker won't connect
```bash
# Check worker logs
sudo journalctl -u maharera-worker -n 50

# Common issues:
# 1. Wrong WORKER_TOKEN - must match server's token
# 2. Wrong API_BASE_URL - should be http://localhost:5000
# 3. Chrome/ChromeDriver issues - reinstall: pip install --upgrade selenium webdriver-manager
```

### Database connection errors
```bash
# Test connection
psql -h localhost -U maharera_user -d maharera

# Check PostgreSQL is running
sudo systemctl status postgresql

# Check PostgreSQL logs
sudo journalctl -u postgresql -n 50

# Restart PostgreSQL
sudo systemctl restart postgresql
```

### High memory usage
```bash
# Check processes
top -o %MEM

# If worker uses too much memory, reduce worker count
# Edit worker.py and change:
# MAX_BROWSER_WORKERS = 1  # Reduce from 2 to 1

# Restart worker
sudo systemctl restart maharera-worker
```

### Out of disk space
```bash
# Check disk usage
df -h

# Clean old logs
sudo journalctl --vacuum-time=7d

# Clean package cache
sudo yum clean all  # Amazon Linux
# OR
sudo apt clean  # Ubuntu

# Remove old backups
rm ~/backups/db_backup_old_*.sql
```

---

## 📈 Performance Optimization

### Optimize PostgreSQL for 8GB RAM

```bash
sudo nano /var/lib/pgsql/data/postgresql.conf
# OR for Ubuntu:
sudo nano /etc/postgresql/14/main/postgresql.conf
```

Add/modify these settings:

```
# For 8GB RAM instance
shared_buffers = 2GB
effective_cache_size = 6GB
maintenance_work_mem = 512MB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100
random_page_cost = 1.1
effective_io_concurrency = 200
work_mem = 10MB
min_wal_size = 1GB
max_wal_size = 4GB
max_worker_processes = 4
max_parallel_workers_per_gather = 2
max_parallel_workers = 4
```

```bash
# Restart PostgreSQL
sudo systemctl restart postgresql
```

---

## ✅ Post-Deployment Checklist

- [ ] All services running (`systemctl status maharera-*`)
- [ ] Database accessible (`psql` connection test)
- [ ] Server responding (`curl http://localhost/api/health`)
- [ ] Frontend loads in browser (`http://YOUR_IP`)
- [ ] Worker connecting (check logs: `journalctl -u maharera-worker`)
- [ ] Security groups configured (ports 80, 443 open)
- [ ] Nginx reverse proxy working
- [ ] Daily backups scheduled (`crontab -l`)
- [ ] SSL certificate installed (if using domain)
- [ ] Monitoring script working (`~/monitor.sh`)

---

## 🎉 Your Application is Live!

Access your application at:
```
http://YOUR_EC2_PUBLIC_IP
```

Or if you setup SSL:
```
https://your-domain.com
```

### Quick Health Check URLs:
- Dashboard: `http://YOUR_IP/`
- Health: `http://YOUR_IP/api/health`
- Stats: `http://YOUR_IP/api/dashboard/stats`
- Districts: `http://YOUR_IP/api/scraping/districts`

---

## 📞 Need Help?

Common commands:
```bash
# View all logs in real-time
sudo journalctl -u maharera-server -u maharera-worker -f

# Restart everything
sudo systemctl restart maharera-server maharera-worker nginx

# Check system health
~/monitor.sh

# Manual backup
~/backup.sh
```

Your deployment is complete! 🚀
