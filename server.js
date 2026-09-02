const express = require('express');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middlewares
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 1. Express API Routes
app.use('/api/worker', require('./backend/routes/worker'));
app.use('/api/jobs', require('./backend/routes/jobs'));

// 2. Health check route for Coolify deployment
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date() });
});

// 3. Serve Frontend Build Files (Vite 'dist' & Create React App 'build' fallback)
const frontendBuildPath = path.join(__dirname, 'frontend/dist');
app.use(express.static(frontendBuildPath));

// Catch-all handler for Single Page Application (SPA) routing
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendBuildPath, 'index.html'), (err) => {
    if (err) {
      // Fallback if 'dist' is not found, try 'build'
      res.sendFile(path.join(__dirname, 'frontend/build', 'index.html'));
    }
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`[🚀 Server] Running on port ${PORT}`);
});