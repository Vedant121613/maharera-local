# MahaRERA Scraper - AWS Deployment Documentation

## 📚 Complete Documentation Index

Your application is **fully AWS-ready** and comes with comprehensive deployment guides:

### 🚀 Start Here
1. **QUICK_START.md** - Deploy in 5 minutes with automated script
2. **FREE_TIER_DEPLOYMENT.md** - Complete step-by-step manual for 8GB free tier
3. **AWS_DEPLOYMENT_GUIDE.md** - Advanced options (ECS, Elastic Beanstalk, RDS)

### 🛠️ Configuration Files
- **.env.production.example** - Server environment variables template
- **scraper_worker/.env.production.example** - Worker environment variables template
- **deploy.sh** - Automated deployment script

---

## 🎯 Quick Deploy (TL;DR)

Perfect for your **8GB AWS Free Tier instance**:

```bash
# 1. SSH into your AWS instance
ssh -i your-key.pem ec2-user@YOUR_EC2_IP

# 2. Clone repository
git clone YOUR_REPO_URL
cd rera-new-data-shravni

# 3. Run deployment script
chmod +x deploy.sh
./deploy.sh

# 4. Open in browser
# http://YOUR_EC2_IP
```

**Done! ✅** Your app is live in ~15 minutes.

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────┐
│              AWS EC2 Instance (8GB RAM)             │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌──────────────┐   ┌─────────────────────────┐   │
│  │    Nginx     │──→│   Node.js Express       │   │
│  │   (Port 80)  │   │     Server              │   │
│  └──────────────┘   │   (Port 5000)           │   │
│         ▲           └──────────┬──────────────┘   │
│         │                      │                   │
│    Internet                    │                   │
│                                ▼                   │
│                    ┌─────────────────────┐        │
│                    │   PostgreSQL        │        │
│                    │   Database          │        │
│                    │   (Port 5432)       │        │
│                    └──────────┬──────────┘        │
│                               │                   │
│                               │                   │
│  ┌────────────────────────────┼──────────────┐   │
│  │   Python Scraper Workers (2-3 instances)  │   │
│  │   - Link Scraper (Selenium + Chrome)      │   │
│  │   - Data Scraper (Selenium + Chrome)      │   │
│  └───────────────────────────────────────────┘   │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## 📋 Environment Variables

### Server (.env)
```bash
DATABASE_URL=postgresql://maharera_user:password@localhost:5432/maharera
WORKER_TOKEN=your-32-byte-random-token
PORT=5000
NODE_ENV=production
```

### Worker (scraper_worker/.env)
```bash
API_BASE_URL=http://localhost:5000
WORKER_TOKEN=same-token-as-server
WORKER_ID=aws-worker-1
POLL_INTERVAL=5
STATUS_CHECK_INTERVAL=3
```

**Generate secure tokens:**
```bash
# Linux/Mac/WSL
openssl rand -hex 32

# Windows PowerShell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

---

## 🔒 AWS Security Group Configuration

### Required Inbound Rules

| Type  | Protocol | Port | Source    | Description           |
|-------|----------|------|-----------|-----------------------|
| HTTP  | TCP      | 80   | 0.0.0.0/0 | Public web access     |
| HTTPS | TCP      | 443  | 0.0.0.0/0 | Secure web access     |
| SSH   | TCP      | 22   | Your IP   | Remote administration |

### Optional (for debugging)
| Type       | Protocol | Port | Source  | Description      |
|------------|----------|------|---------|------------------|
| Custom TCP | TCP      | 5000 | Your IP | Direct API access|

---

## 💾 Resource Requirements

### Minimum (Single Worker)
- **RAM**: 3GB
- **CPU**: 1 vCPU
- **Storage**: 20GB
- **Instance**: t2.small or t3.small

### Recommended (8GB Free Tier)
- **RAM**: 8GB ✅
- **CPU**: 2 vCPU
- **Storage**: 30GB
- **Instance**: t2.large, t3.large, or t3a.large

### Resource Usage Breakdown
```
PostgreSQL:       ~500 MB
Node.js Server:   ~200 MB
Python Worker 1:  ~800 MB
Python Worker 2:  ~800 MB
Nginx:            ~50 MB
System:           ~1000 MB
─────────────────────────
Total Used:       ~3.3 GB
Free:             ~4.7 GB (buffer for data/cache)
```

---

## 🚀 Deployment Options

### 1. Single EC2 Instance (Recommended for Free Tier)
✅ **Pros:**
- Simple setup
- Low cost ($0 with free tier)
- All-in-one solution
- Easy to manage

❌ **Cons:**
- Single point of failure
- Manual scaling
- Limited by instance size

**Best for**: Development, testing, small-scale production

---

### 2. ECS Fargate (Production Scale)
✅ **Pros:**
- Auto-scaling
- High availability
- Managed infrastructure
- Container-based

❌ **Cons:**
- Higher cost (~$73/month)
- More complex setup
- Requires Docker knowledge

**Best for**: Production, high-traffic applications

---

### 3. Elastic Beanstalk (Easiest Managed)
✅ **Pros:**
- Simplest managed option
- Automated deployment
- Built-in monitoring
- Auto-scaling

❌ **Cons:**
- Less control
- Medium cost (~$45/month)
- Opinionated architecture

**Best for**: Quick production deployment, less DevOps overhead

---

## 📊 Cost Estimates

### Free Tier (12 months)
```
EC2 t2.micro (750 hrs/month)     $0.00
RDS PostgreSQL t3.micro          $0.00 (if using RDS Free Tier)
Data Transfer (1GB)              $0.00
────────────────────────────────
Total:                           $0.00/month
```

### After Free Tier
```
EC2 t3.small (all-in-one)        ~$15/month
Storage (30GB EBS)               ~$3/month
Data Transfer                    ~$5/month
────────────────────────────────
Total:                           ~$23/month
```

### Production with RDS
```
EC2 t3.medium                    ~$30/month
RDS PostgreSQL db.t3.micro       ~$15/month
Application Load Balancer        ~$18/month
Data Transfer                    ~$10/month
────────────────────────────────
Total:                           ~$73/month
```

---

## 🔧 Essential Commands

### Service Management
```bash
# Check status
sudo systemctl status maharera-server
sudo systemctl status maharera-worker

# Start/Stop/Restart
sudo systemctl start maharera-server
sudo systemctl stop maharera-worker
sudo systemctl restart maharera-server maharera-worker

# View logs (live)
sudo journalctl -u maharera-server -f
sudo journalctl -u maharera-worker -f

# View last 100 lines
sudo journalctl -u maharera-server -n 100
```

### Database Management
```bash
# Connect to database
psql -h localhost -U maharera_user -d maharera

# Backup database
pg_dump -h localhost -U maharera_user maharera > backup.sql

# Restore database
psql -h localhost -U maharera_user maharera < backup.sql

# Check database size
psql -h localhost -U maharera_user -d maharera -c \
  "SELECT pg_size_pretty(pg_database_size('maharera'));"
```

### Monitoring
```bash
# System resources
free -h              # Memory usage
df -h                # Disk usage
top                  # Running processes
htop                 # Better process viewer (if installed)

# Application health
curl http://localhost/api/health
curl http://localhost/api/dashboard/stats

# Custom monitoring script
~/monitor.sh
```

### Updates
```bash
cd ~/rera-new-data-shravni
git pull
npm install
cd frontend && npm install && npm run build && cd ..
cd scraper_worker && source venv/bin/activate && \
  pip install -r requirements.txt && deactivate && cd ..
sudo systemctl restart maharera-server maharera-worker
```

---

## 🐛 Common Issues & Solutions

### 1. Server won't start
```bash
# Check logs
sudo journalctl -u maharera-server -n 50

# Common causes:
# - DATABASE_URL incorrect → Fix in .env
# - Port 5000 in use → sudo lsof -i :5000
# - Missing dependencies → npm install
```

### 2. Worker can't connect
```bash
# Check worker logs
sudo journalctl -u maharera-worker -n 50

# Common causes:
# - WORKER_TOKEN mismatch → Must be identical in both .env files
# - Wrong API_BASE_URL → Should be http://localhost:5000
# - Server not running → Check server status first
```

### 3. Database connection failed
```bash
# Check PostgreSQL
sudo systemctl status postgresql

# Test connection
psql -h localhost -U maharera_user -d maharera

# Common causes:
# - PostgreSQL not running → sudo systemctl start postgresql
# - Wrong credentials → Check .env DATABASE_URL
# - pg_hba.conf not configured → See FREE_TIER_DEPLOYMENT.md
```

### 4. Can't access from browser
```bash
# Check Nginx
sudo systemctl status nginx

# Check if server responds
curl http://localhost:5000/api/health

# Common causes:
# - Security Group not open → Add port 80 inbound rule
# - Nginx not running → sudo systemctl start nginx
# - Server not running → Check server status
```

### 5. High memory usage
```bash
# Check memory
free -h

# Check processes
top -o %MEM

# Solution: Reduce worker count in data_scraper.py
# Change: MAX_BROWSER_WORKERS = 1  (from 2)
# Restart: sudo systemctl restart maharera-worker
```

---

## 📈 Performance Tuning

### For 8GB RAM Instance
```python
# scraper_worker/data_scraper.py
MAX_BROWSER_WORKERS = 2  # Good for 8GB

# scraper_worker/link_scraper.py
PRIMARY_MAX_WORKERS = 5  # Optimal for network I/O
```

### PostgreSQL Optimization
```bash
# Edit postgresql.conf
sudo nano /var/lib/pgsql/data/postgresql.conf

# For 8GB RAM:
shared_buffers = 2GB
effective_cache_size = 6GB
maintenance_work_mem = 512MB
work_mem = 10MB
```

---

## 🔐 Security Best Practices

### 1. Strong Credentials
- ✅ Use 32+ byte random tokens
- ✅ Change default passwords
- ✅ Never commit .env files
- ✅ Rotate tokens periodically

### 2. Firewall Configuration
```bash
# Install UFW (Ubuntu)
sudo apt install -y ufw
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### 3. Automatic Updates
```bash
# Amazon Linux
sudo yum install -y yum-cron
sudo systemctl enable yum-cron

# Ubuntu
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure unattended-upgrades
```

### 4. SSL Certificate (Free)
```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Get certificate (requires domain)
sudo certbot --nginx -d your-domain.com

# Auto-renewal
sudo crontab -e
# Add: 0 0 * * * certbot renew --quiet
```

---

## 📞 Support & Documentation

### 📖 Documentation Files
- `QUICK_START.md` - 5-minute deployment guide
- `FREE_TIER_DEPLOYMENT.md` - Complete manual for 8GB instance
- `AWS_DEPLOYMENT_GUIDE.md` - Advanced deployment options
- `.env.production.example` - Environment variable templates

### 🛠️ Scripts
- `deploy.sh` - Automated deployment
- `~/monitor.sh` - System health check
- `~/backup.sh` - Database backup

### 🔗 Useful Links
- AWS Free Tier: https://aws.amazon.com/free/
- PostgreSQL Docs: https://www.postgresql.org/docs/
- Node.js Docs: https://nodejs.org/docs/
- Selenium Docs: https://www.selenium.dev/documentation/

---

## ✅ Deployment Checklist

### Pre-Deployment
- [ ] AWS account created
- [ ] EC2 instance launched (8GB RAM)
- [ ] Security key pair downloaded
- [ ] Security groups configured
- [ ] Domain name configured (optional)

### Deployment
- [ ] Connected to EC2 via SSH
- [ ] Repository cloned
- [ ] `deploy.sh` executed successfully
- [ ] All services started
- [ ] Database initialized

### Post-Deployment
- [ ] Application accessible from browser
- [ ] API health check passes
- [ ] Worker connecting successfully
- [ ] Backup script scheduled
- [ ] Monitoring script working
- [ ] SSL configured (if using domain)

### Testing
- [ ] Frontend loads correctly
- [ ] Can view district list
- [ ] Can start/stop scraping jobs
- [ ] Data appears in tables
- [ ] Export functionality works

---

## 🎉 Conclusion

Your MahaRERA scraper is **production-ready** for AWS deployment!

**Next Steps:**
1. Read `QUICK_START.md`
2. Run `deploy.sh` on your EC2 instance
3. Access your app at `http://YOUR_EC2_IP`
4. Start scraping Maharashtra RERA data!

**Need help?** Check the detailed guides or review the troubleshooting section.

**Happy Scraping! 🚀**
