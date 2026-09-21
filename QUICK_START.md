# 🚀 Quick Start - Deploy to AWS in 5 Minutes

## Option 1: Automated Deployment (Recommended)

### Step 1: Connect to your AWS instance
```bash
ssh -i your-key.pem ec2-user@YOUR_EC2_IP
# OR for Ubuntu:
ssh -i your-key.pem ubuntu@YOUR_EC2_IP
```

### Step 2: Clone your repository
```bash
git clone https://github.com/your-username/rera-new-data-shravni.git
cd rera-new-data-shravni
```

### Step 3: Run the deployment script
```bash
chmod +x deploy.sh
./deploy.sh
```

**That's it!** ☕ Grab a coffee. The script takes ~10-15 minutes.

### Step 4: Open in browser
```
http://YOUR_EC2_PUBLIC_IP
```

---

## Option 2: Manual Deployment

See **FREE_TIER_DEPLOYMENT.md** for detailed step-by-step instructions.

---

## 📋 Environment Variables Summary

### Server (.env)
```bash
DATABASE_URL=postgresql://user:pass@localhost:5432/maharera
WORKER_TOKEN=your-32-byte-token
PORT=5000
NODE_ENV=production
```

### Worker (scraper_worker/.env)
```bash
API_BASE_URL=http://localhost:5000
WORKER_TOKEN=same-as-server-token
WORKER_ID=aws-worker-1
POLL_INTERVAL=5
STATUS_CHECK_INTERVAL=3
```

### Frontend (build-time only)
```bash
VITE_API_BASE_URL=http://YOUR_EC2_IP
```

---

## ⚡ Essential Commands

```bash
# Check everything
~/monitor.sh

# View server logs
sudo journalctl -u maharera-server -f

# View worker logs
sudo journalctl -u maharera-worker -f

# Restart services
sudo systemctl restart maharera-server
sudo systemctl restart maharera-worker

# Check service status
sudo systemctl status maharera-server
sudo systemctl status maharera-worker

# Backup database
~/backup.sh

# Connect to database
psql -h localhost -U maharera_user -d maharera
```

---

## 🔒 AWS Security Group Settings

**Inbound Rules** (Required):

| Type | Port | Source | Purpose |
|------|------|--------|---------|
| HTTP | 80 | 0.0.0.0/0 | Web access |
| HTTPS | 443 | 0.0.0.0/0 | Secure web access |
| SSH | 22 | Your IP | Remote access |

---

## ✅ Post-Deployment Checklist

After deployment, verify:

- [ ] Server running: `sudo systemctl status maharera-server`
- [ ] Worker running: `sudo systemctl status maharera-worker`
- [ ] Database accessible: `psql -h localhost -U maharera_user -d maharera`
- [ ] Web accessible: Open `http://YOUR_EC2_IP` in browser
- [ ] API responding: `curl http://localhost/api/health`
- [ ] Security groups configured (ports 80, 443 open)
- [ ] Backups scheduled: `crontab -l`

---

## 🐛 Quick Troubleshooting

### Server won't start?
```bash
sudo journalctl -u maharera-server -n 50
# Check .env file exists and has correct DATABASE_URL
```

### Worker not connecting?
```bash
sudo journalctl -u maharera-worker -n 50
# Verify WORKER_TOKEN matches between server and worker .env files
```

### Can't access from browser?
```bash
# Check AWS Security Group has port 80 open
# Check Nginx is running: sudo systemctl status nginx
# Check server is running: curl http://localhost:5000/api/health
```

### Database connection failed?
```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Test connection
psql -h localhost -U maharera_user -d maharera

# Restart PostgreSQL
sudo systemctl restart postgresql
```

---

## 📊 Resource Usage (8GB RAM Instance)

Expected usage:
- PostgreSQL: ~500MB
- Node.js Server: ~200MB
- Python Worker: ~800MB per worker
- Nginx: ~50MB
- System: ~1GB
- **Total**: ~3-4GB (4GB free for data/cache)

---

## 🔄 Update Your Application

```bash
cd ~/rera-new-data-shravni

# Pull latest code
git pull

# Update dependencies
npm install
cd frontend && npm install && npm run build && cd ..
cd scraper_worker && source venv/bin/activate && pip install -r requirements.txt && deactivate && cd ..

# Restart services
sudo systemctl restart maharera-server
sudo systemctl restart maharera-worker

# Check logs
sudo journalctl -u maharera-server -u maharera-worker -f
```

---

## 📚 Full Documentation

- **FREE_TIER_DEPLOYMENT.md** - Complete step-by-step manual
- **AWS_DEPLOYMENT_GUIDE.md** - Advanced deployment options (ECS, Elastic Beanstalk)
- **deploy.sh** - Automated deployment script

---

## 🆘 Need Help?

1. Check logs: `sudo journalctl -u maharera-server -u maharera-worker -f`
2. Run monitor: `~/monitor.sh`
3. Check services: `sudo systemctl status maharera-*`
4. Restart everything: `sudo systemctl restart maharera-server maharera-worker nginx postgresql`

---

## 🎉 Your Application URLs

Once deployed:

- **Frontend**: `http://YOUR_EC2_IP/`
- **Health Check**: `http://YOUR_EC2_IP/api/health`
- **Dashboard Stats**: `http://YOUR_EC2_IP/api/dashboard/stats`
- **Scraping Status**: `http://YOUR_EC2_IP/api/scraping/districts`

---

**⏱️ Estimated Deployment Time**: 10-15 minutes (automated) or 30-45 minutes (manual)

**💰 Cost**: $0 (within AWS Free Tier limits)

**🔧 Maintenance**: Automated daily backups at 2 AM

---

Good luck! 🚀
