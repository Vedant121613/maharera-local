# AWS Deployment Guide - MahaRERA Scraper Application

## Architecture Overview

Your application consists of three main components:

1. **Node.js Express Server** - Serves frontend + REST API
2. **PostgreSQL Database** - Stores scraped data
3. **Python Scraper Worker** - Background scraping processes

---

## ✅ AWS Deployment Options

### Option 1: AWS ECS (Elastic Container Service) - RECOMMENDED
- **Best for**: Production deployments with auto-scaling
- **Components**:
  - ECS Fargate tasks for Express server
  - ECS Fargate tasks for Python worker (can run multiple instances)
  - RDS PostgreSQL for database
  - Application Load Balancer for HTTPS/SSL

### Option 2: AWS EC2 + Docker
- **Best for**: More control, lower cost for steady workloads
- **Components**:
  - Single or multiple EC2 instances
  - Docker Compose to run all services
  - RDS PostgreSQL or PostgreSQL on EC2

### Option 3: AWS Elastic Beanstalk
- **Best for**: Simplest deployment (AWS handles infrastructure)
- **Components**:
  - Elastic Beanstalk for Node.js application
  - Separate EC2 for Python worker
  - RDS PostgreSQL

---

## 📋 Required Environment Variables

### 1. Express Server (server.js)

```bash
# Database Connection
DATABASE_URL=postgresql://username:password@host:5432/database_name

# Worker Authentication
WORKER_TOKEN=your-secure-random-token-here-use-openssl-rand-hex-32

# Server Port
PORT=5000
```

**How to generate WORKER_TOKEN:**
```bash
# On Linux/Mac:
openssl rand -hex 32

# On Windows PowerShell:
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

### 2. Frontend (.env for build time)

```bash
# Backend API URL (production)
VITE_API_BASE_URL=https://your-domain.com
```

### 3. Python Scraper Worker (.env)

```bash
# Backend API Connection
API_BASE_URL=https://your-domain.com
WORKER_TOKEN=your-secure-random-token-here-same-as-server

# Worker Identification
WORKER_ID=aws-worker-1

# Optional: Polling Configuration
POLL_INTERVAL=5
STATUS_CHECK_INTERVAL=3

# Scraping Configuration (set by worker.py, but can override)
# SCRAPE_STATE_ID=27
# SCRAPE_DISTRICT_ID=521
# SCRAPE_DISTRICT_NAME=Pune
```

---

## 🚀 Step-by-Step Deployment

## OPTION 1: AWS ECS Deployment (Production)

### Prerequisites
1. AWS CLI installed and configured
2. Docker installed locally
3. AWS account with IAM permissions for ECS, RDS, VPC, ECR

### Step 1: Create PostgreSQL Database (RDS)

```bash
# Create RDS PostgreSQL instance
aws rds create-db-instance \
  --db-instance-identifier maharera-db \
  --db-instance-class db.t3.micro \
  --engine postgres \
  --engine-version 15.4 \
  --master-username admin \
  --master-user-password "YourSecurePassword123!" \
  --allocated-storage 20 \
  --backup-retention-period 7 \
  --vpc-security-group-ids sg-xxxxxxxxx \
  --publicly-accessible \
  --storage-encrypted
```

**Get your DATABASE_URL:**
```
postgresql://admin:YourSecurePassword123!@maharera-db.xxxxxx.us-east-1.rds.amazonaws.com:5432/postgres
```

### Step 2: Build and Push Docker Images

#### A. Create ECR Repositories

```bash
# Create repositories
aws ecr create-repository --repository-name maharera-server
aws ecr create-repository --repository-name maharera-worker

# Login to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <your-account-id>.dkr.ecr.us-east-1.amazonaws.com
```

#### B. Build and Push Server Image

```bash
# Build server image (uses existing Dockerfile)
docker build -t maharera-server:latest .

# Tag and push
docker tag maharera-server:latest <account-id>.dkr.ecr.us-east-1.amazonaws.com/maharera-server:latest
docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/maharera-server:latest
```

#### C. Build and Push Worker Image

Create `scraper_worker/Dockerfile`:

```dockerfile
FROM python:3.11-slim

# Install Chrome and dependencies for Selenium
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    unzip \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list \
    && apt-get update \
    && apt-get install -y google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Create data directory
RUN mkdir -p data

CMD ["python", "worker.py"]
```

```bash
# Build worker image
cd scraper_worker
docker build -t maharera-worker:latest .

# Tag and push
docker tag maharera-worker:latest <account-id>.dkr.ecr.us-east-1.amazonaws.com/maharera-worker:latest
docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/maharera-worker:latest
cd ..
```

### Step 3: Create ECS Cluster

```bash
aws ecs create-cluster --cluster-name maharera-cluster
```

### Step 4: Create Task Definitions

#### Server Task Definition (`server-task-def.json`):

```json
{
  "family": "maharera-server",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "arn:aws:iam::<account-id>:role/ecsTaskExecutionRole",
  "containerDefinitions": [
    {
      "name": "server",
      "image": "<account-id>.dkr.ecr.us-east-1.amazonaws.com/maharera-server:latest",
      "essential": true,
      "portMappings": [
        {
          "containerPort": 5000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "DATABASE_URL",
          "value": "postgresql://admin:password@maharera-db.xxx.us-east-1.rds.amazonaws.com:5432/postgres"
        },
        {
          "name": "WORKER_TOKEN",
          "value": "your-secure-token-here"
        },
        {
          "name": "PORT",
          "value": "5000"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/maharera-server",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
```

#### Worker Task Definition (`worker-task-def.json`):

```json
{
  "family": "maharera-worker",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "1024",
  "memory": "2048",
  "executionRoleArn": "arn:aws:iam::<account-id>:role/ecsTaskExecutionRole",
  "containerDefinitions": [
    {
      "name": "worker",
      "image": "<account-id>.dkr.ecr.us-east-1.amazonaws.com/maharera-worker:latest",
      "essential": true,
      "environment": [
        {
          "name": "API_BASE_URL",
          "value": "https://your-alb-url.elb.amazonaws.com"
        },
        {
          "name": "WORKER_TOKEN",
          "value": "your-secure-token-here"
        },
        {
          "name": "WORKER_ID",
          "value": "aws-worker-1"
        },
        {
          "name": "POLL_INTERVAL",
          "value": "5"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/maharera-worker",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
```

Register task definitions:

```bash
aws ecs register-task-definition --cli-input-json file://server-task-def.json
aws ecs register-task-definition --cli-input-json file://worker-task-def.json
```

### Step 5: Create ECS Services

```bash
# Create server service (with load balancer)
aws ecs create-service \
  --cluster maharera-cluster \
  --service-name maharera-server \
  --task-definition maharera-server \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx],securityGroups=[sg-xxx],assignPublicIp=ENABLED}" \
  --load-balancers "targetGroupArn=arn:aws:elasticloadbalancing:...,containerName=server,containerPort=5000"

# Create worker service (no load balancer)
aws ecs create-service \
  --cluster maharera-cluster \
  --service-name maharera-worker \
  --task-definition maharera-worker \
  --desired-count 2 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx],securityGroups=[sg-xxx],assignPublicIp=ENABLED}"
```

---

## OPTION 2: EC2 with Docker Compose (Simpler)

### Step 1: Launch EC2 Instance

1. **Launch EC2**: t3.medium or larger (2 vCPU, 4 GB RAM minimum)
2. **OS**: Amazon Linux 2 or Ubuntu 22.04
3. **Security Group**: Open ports 22 (SSH), 80 (HTTP), 443 (HTTPS), 5000 (app)
4. **Storage**: 30GB minimum

### Step 2: Install Docker and Docker Compose

```bash
# SSH into your EC2 instance
ssh -i your-key.pem ec2-user@your-ec2-ip

# Install Docker
sudo yum update -y
sudo yum install -y docker
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -a -G docker ec2-user

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Logout and login again for group changes
exit
```

### Step 3: Create docker-compose.yml

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15
    container_name: maharera-postgres
    environment:
      POSTGRES_USER: admin
      POSTGRES_PASSWORD: securepassword123
      POSTGRES_DB: maharera
    volumes:
      - postgres-data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    restart: always

  server:
    build: .
    container_name: maharera-server
    environment:
      DATABASE_URL: postgresql://admin:securepassword123@postgres:5432/maharera
      WORKER_TOKEN: your-secure-token-here
      PORT: 5000
    ports:
      - "5000:5000"
    depends_on:
      - postgres
    restart: always

  worker:
    build:
      context: ./scraper_worker
    container_name: maharera-worker
    environment:
      API_BASE_URL: http://server:5000
      WORKER_TOKEN: your-secure-token-here
      WORKER_ID: ec2-worker-1
      POLL_INTERVAL: 5
    depends_on:
      - server
    restart: always
    deploy:
      replicas: 2

volumes:
  postgres-data:
```

### Step 4: Deploy Application

```bash
# Clone your repository
git clone <your-repo-url>
cd rera-new-data-shravni

# Create .env file for server
cat > .env << EOF
DATABASE_URL=postgresql://admin:securepassword123@postgres:5432/maharera
WORKER_TOKEN=$(openssl rand -hex 32)
PORT=5000
EOF

# Create .env file for worker
cat > scraper_worker/.env << EOF
API_BASE_URL=http://server:5000
WORKER_TOKEN=$(cat .env | grep WORKER_TOKEN | cut -d'=' -f2)
WORKER_ID=ec2-worker-1
POLL_INTERVAL=5
EOF

# Build and start services
docker-compose up -d

# Check logs
docker-compose logs -f
```

### Step 5: Setup SSL with Nginx (Optional but Recommended)

```bash
# Install Nginx
sudo yum install -y nginx

# Configure reverse proxy
sudo nano /etc/nginx/conf.d/maharera.conf
```

Add this configuration:

```nginx
server {
    listen 80;
    server_name your-domain.com;

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
# Start Nginx
sudo systemctl start nginx
sudo systemctl enable nginx

# Install Certbot for SSL (Let's Encrypt)
sudo yum install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

---

## OPTION 3: AWS Elastic Beanstalk (Easiest)

### Step 1: Install EB CLI

```bash
pip install awsebcli
```

### Step 2: Initialize Elastic Beanstalk

```bash
eb init -p docker maharera-app --region us-east-1
```

### Step 3: Create RDS Database

```bash
# Create PostgreSQL database through AWS Console or CLI
# Get the DATABASE_URL
```

### Step 4: Configure Environment Variables

Create `.ebextensions/environment.config`:

```yaml
option_settings:
  aws:elasticbeanstalk:application:environment:
    DATABASE_URL: postgresql://admin:password@maharera-db.xxx.rds.amazonaws.com:5432/maharera
    WORKER_TOKEN: your-secure-token-here
    PORT: 5000
```

### Step 5: Deploy

```bash
eb create maharera-env
eb deploy
eb open
```

---

## 🔒 Security Considerations

### 1. Database Security
- **Use AWS RDS** with automated backups
- **Enable SSL** for database connections
- **Restrict access** using security groups (only from ECS/EC2)
- **Use secrets manager** for credentials (production)

```bash
# Store in AWS Secrets Manager
aws secretsmanager create-secret \
  --name maharera/database-url \
  --secret-string "postgresql://admin:password@host:5432/db"
```

### 2. API Security
- **Strong WORKER_TOKEN**: Use minimum 32-byte random hex
- **HTTPS only** in production (use ALB with SSL certificate)
- **Rate limiting**: Add to Express server
- **IP whitelisting** for worker endpoints

### 3. Application Security
- **Environment variables**: Never commit .env files
- **Update dependencies**: Regularly update npm/pip packages
- **Docker security**: Scan images for vulnerabilities
- **IAM roles**: Use least privilege principle

---

## 📊 Monitoring and Logging

### CloudWatch Logs

```bash
# Create log groups
aws logs create-log-group --log-group-name /ecs/maharera-server
aws logs create-log-group --log-group-name /ecs/maharera-worker

# View logs
aws logs tail /ecs/maharera-server --follow
```

### Application Monitoring

Add to `server.js`:

```javascript
// Health check with detailed status
app.get('/api/health/detailed', async (req, res) => {
  const dbHealth = await pool.query('SELECT 1');
  const workerCount = await pool.query('SELECT COUNT(*) FROM scrape_jobs WHERE status = \'RUNNING\'');
  
  res.json({
    status: 'OK',
    database: dbHealth ? 'Connected' : 'Disconnected',
    activeWorkers: workerCount.rows[0].count,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString()
  });
});
```

---

## 💰 Cost Estimation (Monthly)

### Option 1: ECS Fargate
- **ECS Tasks**: 2 x t3.small (~$30/month)
- **RDS PostgreSQL**: db.t3.micro (~$15/month)
- **ALB**: ~$18/month
- **Data Transfer**: ~$10/month
- **Total**: ~$73/month

### Option 2: EC2
- **EC2 t3.medium**: ~$30/month
- **RDS PostgreSQL**: db.t3.micro (~$15/month)
- **Data Transfer**: ~$10/month
- **Total**: ~$55/month

### Option 3: Elastic Beanstalk
- **EB Environment**: ~$30/month
- **RDS PostgreSQL**: ~$15/month
- **Total**: ~$45/month

---

## 🧪 Testing Deployment

```bash
# Test health endpoint
curl https://your-domain.com/api/health

# Test dashboard stats
curl https://your-domain.com/api/dashboard/stats

# Test worker connection (requires WORKER_TOKEN)
curl -H "Authorization: Bearer your-token" \
  https://your-domain.com/api/worker/heartbeat
```

---

## 🔄 CI/CD Pipeline (GitHub Actions Example)

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to AWS

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v2
    
    - name: Configure AWS credentials
      uses: aws-actions/configure-aws-credentials@v1
      with:
        aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
        aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
        aws-region: us-east-1
    
    - name: Login to Amazon ECR
      id: login-ecr
      uses: aws-actions/amazon-ecr-login@v1
    
    - name: Build, tag, and push server image
      env:
        ECR_REGISTRY: ${{ steps.login-ecr.outputs.registry }}
        ECR_REPOSITORY: maharera-server
        IMAGE_TAG: ${{ github.sha }}
      run: |
        docker build -t $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG .
        docker push $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG
    
    - name: Deploy to ECS
      run: |
        aws ecs update-service --cluster maharera-cluster \
          --service maharera-server --force-new-deployment
```

---

## 📝 Complete Environment Variables Checklist

### Server (.env)
```bash
DATABASE_URL=postgresql://user:pass@host:5432/db
WORKER_TOKEN=32-byte-hex-string
PORT=5000
NODE_ENV=production
```

### Worker (.env)
```bash
API_BASE_URL=https://your-domain.com
WORKER_TOKEN=same-as-server
WORKER_ID=unique-worker-id
POLL_INTERVAL=5
STATUS_CHECK_INTERVAL=3
```

### Frontend (build-time)
```bash
VITE_API_BASE_URL=https://your-domain.com
```

---

## ✅ Pre-Deployment Checklist

- [ ] PostgreSQL database created and accessible
- [ ] DATABASE_URL configured and tested
- [ ] WORKER_TOKEN generated (32+ bytes)
- [ ] Security groups configured (DB, Server, Worker)
- [ ] SSL certificate obtained (for production)
- [ ] Environment variables set in deployment platform
- [ ] Docker images built and tested locally
- [ ] Health check endpoints working
- [ ] Backup strategy configured
- [ ] Monitoring and logging setup
- [ ] Domain name configured (if using)

---

## 🆘 Troubleshooting

### Database Connection Issues
```bash
# Test PostgreSQL connection
psql "postgresql://user:pass@host:5432/db"

# Check security group allows connections
# Ensure RDS is publicly accessible (or use VPC peering)
```

### Worker Not Connecting
```bash
# Check worker logs
docker logs maharera-worker

# Verify WORKER_TOKEN matches
# Ensure API_BASE_URL is correct
# Check network connectivity
```

### Application Errors
```bash
# Check server logs
docker logs maharera-server

# Check database schema
psql "postgresql://..." -c "\dt"

# Verify all environment variables
env | grep -E "(DATABASE|WORKER|API)"
```

---

## 📞 Support & Next Steps

Your application is **fully deployable to AWS** with any of the three options above. 

**Recommended approach**: Start with **Option 2 (EC2 + Docker Compose)** for simplicity, then migrate to ECS Fargate as you scale.

Need help with specific deployment? Let me know which option you'd like to proceed with!
