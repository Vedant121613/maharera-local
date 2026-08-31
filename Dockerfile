# Step 1: Frontend Build
FROM node:18-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Step 2: Express Server & Static Serving
FROM node:18-alpine
WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY server.js ./
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

EXPOSE 5000
CMD ["node", "server.js"]