# MahaRERA Data Scraper & Dashboard

A complete web scraping and data management solution for Maharashtra RERA (Real Estate Regulatory Authority) project data.

## 🚀 Quick Start - AWS Deployment

**Perfect for AWS Free Tier (8GB RAM)**

```bash
# SSH into your EC2 instance
ssh -i your-key.pem ec2-user@YOUR_EC2_IP

# Clone and deploy
git clone YOUR_REPO_URL
cd rera-new-data-shravni
chmod +x deploy.sh
./deploy.sh

# Open in browser: http://YOUR_EC2_IP
```

**⏱️ Deployment Time:** ~15 minutes  
**💰 Cost:** $0 (Free Tier) or ~$23/month after

---

## 📚 Complete Documentation

| Document | Purpose | Time |
|----------|---------|------|
| **[DEPLOYMENT_SUMMARY.md](./DEPLOYMENT_SUMMARY.md)** | 📊 Quick overview & checklist | 5 min |
| **[QUICK_START.md](./QUICK_START.md)** | 🚀 Deploy in 5 minutes | 3 min |
| **[FREE_TIER_DEPLOYMENT.md](./FREE_TIER_DEPLOYMENT.md)** | 📖 Complete step-by-step guide | 15 min |
| **[AWS_DEPLOYMENT_GUIDE.md](./AWS_DEPLOYMENT_GUIDE.md)** | 🏗️ Advanced deployment options | 20 min |
| **[README_AWS.md](./README_AWS.md)** | 📘 Full AWS documentation | 10 min |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────┐
│              AWS EC2 Instance (8GB RAM)             │
├─────────────────────────────────────────────────────┤
│  Nginx (80) → Express Server (5000)                 │
│                    ↓                                 │
│              PostgreSQL (5432)                      │
│                    ↓                                 │
│         Python Scraper Workers (2-3)                │
└─────────────────────────────────────────────────────┘
```

**Tech Stack:**
- **Frontend:** React 19 + Vite + Mantine UI
- **Backend:** Node.js + Express + PostgreSQL
- **Worker:** Python 3.11 + Selenium + Chrome
- **Deployment:** Nginx reverse proxy

---

## ✨ Features

### 🎯 Web Scraping
- **Dual-phase scraping**: Links collection → Detailed data extraction
- **District-based scraping**: Target specific districts
- **Concurrent processing**: Multiple workers for faster scraping
- **Auto-retry logic**: Handles network failures gracefully
- **Stop/Resume**: Control scraping jobs on-the-fly

### 📊 Dashboard
- **Real-time statistics**: Projects, links, data scraped
- **Progress tracking**: Per-district scraping progress
- **Data management**: View, search, filter, export
- **Status monitoring**: Live worker status

### 💾 Data Management
- **PostgreSQL storage**: Scalable relational database
- **Duplicate handling**: Automatic deduplication
- **CSV export**: Download data for analysis
- **File upload**: Import local scraper outputs

---

## 🔑 Environment Variables

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

**Generate secure token:** `openssl rand -hex 32`

---

## 💻 Local Development

### Prerequisites
- Node.js 20+
- Python 3.11+
- PostgreSQL 14+
- Google Chrome

### Setup

```bash
# 1. Clone repository
git clone YOUR_REPO_URL
cd rera-new-data-shravni

# 2. Setup PostgreSQL
createdb maharera
createuser maharera_user -P

# 3. Install Node dependencies
npm install
cd frontend && npm install && cd ..

# 4. Setup Python worker
cd scraper_worker
python3.11 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
cd ..

# 5. Configure environment
cp .env.production.example .env
cp scraper_worker/.env.production.example scraper_worker/.env
# Edit both .env files with your credentials

# 6. Build frontend
cd frontend && npm run build && cd ..

# 7. Start server
node server.js

# 8. Start worker (in another terminal)
cd scraper_worker
source venv/bin/activate
python worker.py
```

Open browser: `http://localhost:5000`

---

## 🚀 Deployment Options

### 1. Single EC2 Instance (Recommended)
✅ Simple, cost-effective, perfect for free tier  
📖 Guide: [FREE_TIER_DEPLOYMENT.md](./FREE_TIER_DEPLOYMENT.md)

### 2. AWS ECS Fargate
✅ Production-ready, auto-scaling, high availability  
📖 Guide: [AWS_DEPLOYMENT_GUIDE.md](./AWS_DEPLOYMENT_GUIDE.md) - Option 1

### 3. AWS Elastic Beanstalk
✅ Easiest managed deployment  
📖 Guide: [AWS_DEPLOYMENT_GUIDE.md](./AWS_DEPLOYMENT_GUIDE.md) - Option 3

---

## 📊 Resource Requirements

### Minimum
- **RAM:** 3GB
- **CPU:** 1 vCPU
- **Storage:** 20GB

### Recommended (8GB Free Tier)
- **RAM:** 8GB ✅
- **CPU:** 2 vCPU
- **Storage:** 30GB

### Usage Breakdown
```
PostgreSQL:       500 MB
Node.js Server:   200 MB
Python Worker 1:  800 MB
Python Worker 2:  800 MB
Nginx:            50 MB
System:           1000 MB
────────────────────────
Total:            ~3.3 GB
Free:             ~4.7 GB
```

---

## 🔧 Essential Commands

```bash
# Check status
sudo systemctl status maharera-server
sudo systemctl status maharera-worker

# View logs
sudo journalctl -u maharera-server -f
sudo journalctl -u maharera-worker -f

# Restart services
sudo systemctl restart maharera-server maharera-worker

# Monitor system
~/monitor.sh

# Backup database
~/backup.sh

# Connect to database
psql -h localhost -U maharera_user -d maharera
```

---

## 🔒 Security

### AWS Security Group
```
Port 80  (HTTP)  → 0.0.0.0/0  (Public web access)
Port 443 (HTTPS) → 0.0.0.0/0  (Secure web access)
Port 22  (SSH)   → Your IP    (Remote access only)
```

### Best Practices
- ✅ Use strong random tokens (32+ bytes)
- ✅ Never commit .env files
- ✅ Enable automatic security updates
- ✅ Setup SSL certificate (Let's Encrypt)
- ✅ Regular database backups
- ✅ Monitor logs for suspicious activity

---

## 📈 API Endpoints

### Public
- `GET /api/health` - Health check
- `GET /api/dashboard/stats` - Dashboard statistics
- `GET /api/scraping/districts` - District scraping status

### Data Management
- `GET /api/links` - List scraped links
- `POST /api/links/upload` - Upload links database
- `GET /api/links/export` - Export links as CSV
- `GET /api/basic-data` - List basic data
- `POST /api/basic-data/upload` - Upload basic data
- `GET /api/basic-data/export` - Export basic data

### Scraping Control
- `POST /api/scraping/:districtId/:worker/:action` - Control scraping
  - Actions: `start`, `stop`, `restart`, `resume`
  - Workers: `link`, `data`

### Worker API (Requires WORKER_TOKEN)
- `POST /api/worker/heartbeat` - Worker health check
- `GET /api/worker/jobs/next` - Get next job
- `POST /api/worker/jobs/:id/progress` - Update progress
- `POST /api/worker/jobs/:id/complete` - Mark job complete
- `POST /api/worker/links` - Upload scraped links
- `GET /api/worker/links` - Get links for district
- `POST /api/worker/basic-data` - Upload basic data

---

## 🐛 Troubleshooting

### Server won't start
```bash
sudo journalctl -u maharera-server -n 50
# Check DATABASE_URL in .env
# Verify PostgreSQL is running
```

### Worker can't connect
```bash
sudo journalctl -u maharera-worker -n 50
# Verify WORKER_TOKEN matches in both .env files
# Check API_BASE_URL is correct
```

### Database errors
```bash
sudo systemctl status postgresql
psql -h localhost -U maharera_user -d maharera
# Check credentials in DATABASE_URL
```

### High memory usage
```bash
free -h
top -o %MEM
# Reduce MAX_BROWSER_WORKERS in data_scraper.py
```

---

## 📁 Project Structure

```
rera-new-data-shravni/
├── frontend/                  # React frontend
│   ├── src/
│   │   ├── api/              # API client
│   │   ├── components/       # React components
│   │   ├── pages/            # Page components
│   │   ├── types/            # TypeScript types
│   │   └── utils/            # Utilities
│   ├── package.json
│   └── vite.config.ts
├── scraper_worker/           # Python worker
│   ├── worker.py            # Main worker orchestrator
│   ├── link_scraper.py      # Link collection scraper
│   ├── data_scraper.py      # Detail data scraper
│   ├── api_client.py        # Backend API client
│   ├── requirements.txt     # Python dependencies
│   └── .env                 # Worker config
├── server.js                 # Express backend
├── package.json             # Server dependencies
├── Dockerfile               # Docker image (server)
├── deploy.sh                # Automated deployment
├── .env                     # Server config
└── Documentation/
    ├── QUICK_START.md
    ├── FREE_TIER_DEPLOYMENT.md
    ├── AWS_DEPLOYMENT_GUIDE.md
    ├── README_AWS.md
    └── DEPLOYMENT_SUMMARY.md
```

---

## 🤝 Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature-name`
3. Commit changes: `git commit -am 'Add feature'`
4. Push to branch: `git push origin feature-name`
5. Submit pull request

---

## 📄 License

This project is for educational and research purposes. Please respect MahaRERA's terms of service and robots.txt when scraping.

---

## 🆘 Support

- 📖 **Read the docs**: Start with [DEPLOYMENT_SUMMARY.md](./DEPLOYMENT_SUMMARY.md)
- 🚀 **Quick deploy**: Follow [QUICK_START.md](./QUICK_START.md)
- 🐛 **Issues**: Check troubleshooting sections in deployment guides
- 💬 **Questions**: Review [README_AWS.md](./README_AWS.md) for FAQs

---

## 🎯 Roadmap

- [ ] Add authentication & authorization
- [ ] Implement rate limiting
- [ ] Add data validation & cleaning
- [ ] Create data analytics dashboard
- [ ] Add email notifications
- [ ] Implement webhook support
- [ ] Add multi-state support
- [ ] Create API documentation (Swagger)

---

## 🙏 Acknowledgments

- Maharashtra RERA for the public data
- OpenAI for development assistance
- AWS Free Tier for hosting

---

## ⚡ Quick Links

- **Deploy Now**: [QUICK_START.md](./QUICK_START.md)
- **Full Manual**: [FREE_TIER_DEPLOYMENT.md](./FREE_TIER_DEPLOYMENT.md)
- **AWS Guide**: [AWS_DEPLOYMENT_GUIDE.md](./AWS_DEPLOYMENT_GUIDE.md)
- **Summary**: [DEPLOYMENT_SUMMARY.md](./DEPLOYMENT_SUMMARY.md)

---

**Built with ❤️ for Maharashtra Real Estate transparency**

**Status:** ✅ Production Ready | 🚀 AWS Deployable | 📦 Fully Documented
