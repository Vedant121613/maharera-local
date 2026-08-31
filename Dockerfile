# Stage 1: Build React Frontend
FROM node:18-alpine AS builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Express Server Setup
FROM node:18-alpine
WORKDIR /app

# Install Root Dependencies (Express, pg, cors)
COPY package*.json ./
RUN npm install --production

# Copy Express Server
COPY server.js ./

# Copy Frontend Build Output from Stage 1
COPY --from=builder /app/frontend/dist ./frontend/dist

EXPOSE 5000
CMD ["node", "server.js"]