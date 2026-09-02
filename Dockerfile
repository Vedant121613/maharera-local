FROM node:20-alpine

WORKDIR /app

# 1. Copy root package files & install server dependencies
COPY package*.json ./
RUN npm install

# 2. Copy frontend package files & build React static files
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm install

COPY . .
RUN cd frontend && npm run build

EXPOSE 5000

CMD ["node", "server.js"]