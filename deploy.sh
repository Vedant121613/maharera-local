#!/bin/bash

# ============================================================================
# MahaRERA Auto Deployment Script for AWS Free Tier (8GB RAM)
# ============================================================================
# This script automates the deployment process on a fresh AWS EC2 instance
# Run this script after cloning your repository on the EC2 instance
# ============================================================================

set -e  # Exit on any error

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║       MahaRERA Application - AWS Deployment Script         ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Detect OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
else
    echo -e "${RED}Cannot detect OS. Please install manually.${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Detected OS: $OS${NC}"

# Check if running as root
if [ "$EUID" -eq 0 ]; then 
    echo -e "${RED}✗ Please do not run this script as root. Run as normal user (ec2-user or ubuntu).${NC}"
    exit 1
fi

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# ============================================================================
# Step 1: Update System
# ============================================================================
echo ""
echo -e "${BLUE}[1/10] Updating system packages...${NC}"
if [ "$OS" = "amzn" ]; then
    sudo yum update -y > /dev/null 2>&1
elif [ "$OS" = "ubuntu" ]; then
    sudo apt update -y > /dev/null 2>&1
    sudo apt upgrade -y > /dev/null 2>&1
fi
echo -e "${GREEN}✓ System updated${NC}"

# ============================================================================
# Step 2: Install Node.js 20
# ============================================================================
echo ""
echo -e "${BLUE}[2/10] Installing Node.js 20...${NC}"
if ! command_exists node || [ "$(node -v | cut -d'v' -f2 | cut -d'.' -f1)" -lt 20 ]; then
    if [ "$OS" = "amzn" ]; then
        curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash - > /dev/null 2>&1
        sudo yum install -y nodejs > /dev/null 2>&1
    elif [ "$OS" = "ubuntu" ]; then
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - > /dev/null 2>&1
        sudo apt install -y nodejs > /dev/null 2>&1
    fi
    echo -e "${GREEN}✓ Node.js $(node -v) installed${NC}"
else
    echo -e "${GREEN}✓ Node.js $(node -v) already installed${NC}"
fi

# ============================================================================
# Step 3: Install PostgreSQL
# ============================================================================
echo ""
echo -e "${BLUE}[3/10] Installing PostgreSQL...${NC}"
if ! command_exists psql; then
    if [ "$OS" = "amzn" ]; then
        sudo amazon-linux-extras install postgresql14 -y > /dev/null 2>&1
        sudo yum install -y postgresql-server postgresql-contrib > /dev/null 2>&1
        sudo postgresql-setup initdb > /dev/null 2>&1
    elif [ "$OS" = "ubuntu" ]; then
        sudo apt install -y postgresql postgresql-contrib > /dev/null 2>&1
    fi
    sudo systemctl start postgresql
    sudo systemctl enable postgresql > /dev/null 2>&1
    echo -e "${GREEN}✓ PostgreSQL installed and started${NC}"
else
    echo -e "${GREEN}✓ PostgreSQL already installed${NC}"
fi

# ============================================================================
# Step 4: Configure PostgreSQL Database
# ============================================================================
echo ""
echo -e "${BLUE}[4/10] Configuring PostgreSQL database...${NC}"

# Generate random password for database
DB_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)

# Check if database already exists
DB_EXISTS=$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='maharera'" 2>/dev/null || echo "0")

if [ "$DB_EXISTS" != "1" ]; then
    sudo -u postgres psql > /dev/null 2>&1 << EOF
CREATE DATABASE maharera;
CREATE USER maharera_user WITH PASSWORD '$DB_PASSWORD';
GRANT ALL PRIVILEGES ON DATABASE maharera TO maharera_user;
ALTER DATABASE maharera OWNER TO maharera_user;
EOF
    echo -e "${GREEN}✓ Database 'maharera' created${NC}"
else
    echo -e "${YELLOW}⚠ Database 'maharera' already exists${NC}"
fi

# Configure pg_hba.conf for local connections
if [ "$OS" = "amzn" ]; then
    PG_HBA="/var/lib/pgsql/data/pg_hba.conf"
elif [ "$OS" = "ubuntu" ]; then
    PG_HBA=$(sudo -u postgres psql -tAc "SHOW hba_file")
fi

if ! sudo grep -q "host.*maharera.*127.0.0.1/32.*md5" "$PG_HBA"; then
    sudo sed -i 's/local.*all.*all.*peer/local   all             all                                     md5/' "$PG_HBA"
    echo "host    all             all             127.0.0.1/32            md5" | sudo tee -a "$PG_HBA" > /dev/null
    sudo systemctl restart postgresql
    echo -e "${GREEN}✓ PostgreSQL configured for local connections${NC}"
else
    echo -e "${YELLOW}⚠ PostgreSQL already configured${NC}"
fi

# ============================================================================
# Step 5: Install Python 3.11 and Chrome
# ============================================================================
echo ""
echo -e "${BLUE}[5/10] Installing Python 3.11 and Chrome...${NC}"

# Install Python
if ! command_exists python3.11; then
    if [ "$OS" = "amzn" ]; then
        sudo yum install -y python3.11 python3.11-pip > /dev/null 2>&1
    elif [ "$OS" = "ubuntu" ]; then
        sudo apt install -y python3.11 python3.11-venv python3-pip > /dev/null 2>&1
    fi
    echo -e "${GREEN}✓ Python 3.11 installed${NC}"
else
    echo -e "${GREEN}✓ Python 3.11 already installed${NC}"
fi

# Install Chrome
if ! command_exists google-chrome; then
    if [ "$OS" = "amzn" ]; then
        wget -q https://dl.google.com/linux/direct/google-chrome-stable_current_x86_64.rpm
        sudo yum install -y ./google-chrome-stable_current_x86_64.rpm > /dev/null 2>&1
        rm -f google-chrome-stable_current_x86_64.rpm
    elif [ "$OS" = "ubuntu" ]; then
        wget -q https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
        sudo apt install -y ./google-chrome-stable_current_amd64.deb > /dev/null 2>&1
        rm -f google-chrome-stable_current_amd64.deb
    fi
    echo -e "${GREEN}✓ Chrome installed${NC}"
else
    echo -e "${GREEN}✓ Chrome already installed${NC}"
fi

# ============================================================================
# Step 6: Setup Node.js Application
# ============================================================================
echo ""
echo -e "${BLUE}[6/10] Setting up Node.js application...${NC}"

# Install root dependencies
npm install > /dev/null 2>&1
echo -e "${GREEN}✓ Server dependencies installed${NC}"

# Build frontend
cd frontend
npm install > /dev/null 2>&1
npm run build > /dev/null 2>&1
cd ..
echo -e "${GREEN}✓ Frontend built${NC}"

# Generate WORKER_TOKEN
WORKER_TOKEN=$(openssl rand -hex 32)

# Create .env file
cat > .env << EOF
DATABASE_URL=postgresql://maharera_user:$DB_PASSWORD@localhost:5432/maharera
WORKER_TOKEN=$WORKER_TOKEN
PORT=5000
NODE_ENV=production
EOF
echo -e "${GREEN}✓ Server .env configured${NC}"

# ============================================================================
# Step 7: Setup Python Worker
# ============================================================================
echo ""
echo -e "${BLUE}[7/10] Setting up Python worker...${NC}"

cd scraper_worker

# Create virtual environment
python3.11 -m venv venv > /dev/null 2>&1
source venv/bin/activate

# Install dependencies
pip install --upgrade pip > /dev/null 2>&1
pip install -r requirements.txt > /dev/null 2>&1
deactivate

echo -e "${GREEN}✓ Python dependencies installed${NC}"

# Create .env file for worker
cat > .env << EOF
API_BASE_URL=http://localhost:5000
WORKER_TOKEN=$WORKER_TOKEN
WORKER_ID=aws-free-tier-worker-1
POLL_INTERVAL=5
STATUS_CHECK_INTERVAL=3
EOF
echo -e "${GREEN}✓ Worker .env configured${NC}"

cd ..

# ============================================================================
# Step 8: Create Systemd Services
# ============================================================================
echo ""
echo -e "${BLUE}[8/10] Creating systemd services...${NC}"

USER=$(whoami)
WORK_DIR=$(pwd)

# Create server service
sudo tee /etc/systemd/system/maharera-server.service > /dev/null << EOF
[Unit]
Description=MahaRERA Express Server
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=$USER
WorkingDirectory=$WORK_DIR
EnvironmentFile=$WORK_DIR/.env
ExecStart=$(which node) $WORK_DIR/server.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# Create worker service
sudo tee /etc/systemd/system/maharera-worker.service > /dev/null << EOF
[Unit]
Description=MahaRERA Python Scraper Worker
After=network.target maharera-server.service
Requires=maharera-server.service

[Service]
Type=simple
User=$USER
WorkingDirectory=$WORK_DIR/scraper_worker
EnvironmentFile=$WORK_DIR/scraper_worker/.env
ExecStart=$WORK_DIR/scraper_worker/venv/bin/python $WORK_DIR/scraper_worker/worker.py
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

echo -e "${GREEN}✓ Systemd services created${NC}"

# Reload and enable services
sudo systemctl daemon-reload
sudo systemctl enable maharera-server > /dev/null 2>&1
sudo systemctl enable maharera-worker > /dev/null 2>&1
echo -e "${GREEN}✓ Services enabled${NC}"

# Start services
sudo systemctl start maharera-server
sleep 3
sudo systemctl start maharera-worker
sleep 2
echo -e "${GREEN}✓ Services started${NC}"

# ============================================================================
# Step 9: Install and Configure Nginx
# ============================================================================
echo ""
echo -e "${BLUE}[9/10] Installing and configuring Nginx...${NC}"

if ! command_exists nginx; then
    if [ "$OS" = "amzn" ]; then
        sudo yum install -y nginx > /dev/null 2>&1
    elif [ "$OS" = "ubuntu" ]; then
        sudo apt install -y nginx > /dev/null 2>&1
    fi
    echo -e "${GREEN}✓ Nginx installed${NC}"
else
    echo -e "${GREEN}✓ Nginx already installed${NC}"
fi

# Create Nginx configuration
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
        
        proxy_connect_timeout 600;
        proxy_send_timeout 600;
        proxy_read_timeout 600;
        send_timeout 600;
    }
}
EOF

sudo systemctl start nginx
sudo systemctl enable nginx > /dev/null 2>&1
echo -e "${GREEN}✓ Nginx configured and started${NC}"

# ============================================================================
# Step 10: Create Monitoring and Backup Scripts
# ============================================================================
echo ""
echo -e "${BLUE}[10/10] Creating monitoring and backup scripts...${NC}"

# Create monitoring script
cat > ~/monitor.sh << 'EOF'
#!/bin/bash
echo "=== MahaRERA System Status ==="
echo ""
echo "Server Status: $(systemctl is-active maharera-server)"
echo "Worker Status: $(systemctl is-active maharera-worker)"
echo "Database Status: $(systemctl is-active postgresql)"
echo "Nginx Status: $(systemctl is-active nginx)"
echo ""
echo "Memory Usage:"
free -h | grep Mem
echo ""
echo "Disk Usage:"
df -h / | tail -1
echo ""
echo "Database Stats:"
PGPASSWORD='$DB_PASSWORD' psql -h localhost -U maharera_user -d maharera -c "SELECT 'Total Links' as metric, COUNT(*) as count FROM links UNION ALL SELECT 'Total Basic Data', COUNT(*) FROM basic_data UNION ALL SELECT 'Pending Jobs', COUNT(*) FROM scrape_jobs WHERE status='PENDING' UNION ALL SELECT 'Running Jobs', COUNT(*) FROM scrape_jobs WHERE status='RUNNING';" 2>/dev/null || echo "Database connection failed"
EOF
chmod +x ~/monitor.sh

# Create backup script
mkdir -p ~/backups
cat > ~/backup.sh << EOF
#!/bin/bash
BACKUP_DIR=~/backups
DATE=\$(date +%Y%m%d_%H%M%S)
PGPASSWORD='$DB_PASSWORD' pg_dump -h localhost -U maharera_user maharera > \$BACKUP_DIR/db_backup_\$DATE.sql
find \$BACKUP_DIR -name "db_backup_*.sql" -mtime +7 -delete
echo "Backup completed: \$DATE"
EOF
chmod +x ~/backup.sh

# Schedule daily backups
(crontab -l 2>/dev/null | grep -v "backup.sh"; echo "0 2 * * * ~/backup.sh >> ~/backup.log 2>&1") | crontab -

echo -e "${GREEN}✓ Monitoring and backup scripts created${NC}"

# ============================================================================
# Deployment Complete
# ============================================================================
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║            🎉 DEPLOYMENT COMPLETED SUCCESSFULLY! 🎉         ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check service status
SERVER_STATUS=$(systemctl is-active maharera-server)
WORKER_STATUS=$(systemctl is-active maharera-worker)

if [ "$SERVER_STATUS" = "active" ] && [ "$WORKER_STATUS" = "active" ]; then
    echo -e "${GREEN}✓ All services are running!${NC}"
else
    echo -e "${YELLOW}⚠ Some services may not be running. Check logs:${NC}"
    echo -e "  sudo journalctl -u maharera-server -n 20"
    echo -e "  sudo journalctl -u maharera-worker -n 20"
fi

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}📋 IMPORTANT INFORMATION - SAVE THIS!${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${YELLOW}Database Credentials:${NC}"
echo -e "  Host:     localhost"
echo -e "  Port:     5432"
echo -e "  Database: maharera"
echo -e "  User:     maharera_user"
echo -e "  Password: ${RED}$DB_PASSWORD${NC}"
echo ""
echo -e "${YELLOW}Worker Token:${NC}"
echo -e "  ${RED}$WORKER_TOKEN${NC}"
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Get public IP
PUBLIC_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo "YOUR_EC2_IP")

echo -e "${GREEN}Access Your Application:${NC}"
echo -e "  ${BLUE}http://$PUBLIC_IP${NC}"
echo ""
echo -e "${GREEN}API Endpoints:${NC}"
echo -e "  Health Check: ${BLUE}http://$PUBLIC_IP/api/health${NC}"
echo -e "  Dashboard:    ${BLUE}http://$PUBLIC_IP/api/dashboard/stats${NC}"
echo ""
echo -e "${YELLOW}Useful Commands:${NC}"
echo -e "  Check Status:  ${BLUE}~/monitor.sh${NC}"
echo -e "  View Logs:     ${BLUE}sudo journalctl -u maharera-server -f${NC}"
echo -e "  Restart Apps:  ${BLUE}sudo systemctl restart maharera-server maharera-worker${NC}"
echo -e "  Backup DB:     ${BLUE}~/backup.sh${NC}"
echo ""
echo -e "${YELLOW}Security Group Settings (AWS Console):${NC}"
echo -e "  ${RED}⚠ Make sure these ports are open:${NC}"
echo -e "    - Port 80 (HTTP) - 0.0.0.0/0"
echo -e "    - Port 443 (HTTPS) - 0.0.0.0/0"
echo -e "    - Port 22 (SSH) - Your IP only"
echo ""
echo -e "${GREEN}📚 Full Documentation:${NC}"
echo -e "  See FREE_TIER_DEPLOYMENT.md for detailed information"
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
