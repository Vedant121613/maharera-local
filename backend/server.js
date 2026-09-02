const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Increased limit for bulk scrap payloads

// Existing App Routes
// const reraDataRoutes = require('./routes/rera');
// app.use('/api/rera', reraDataRoutes);

// New Scraper & Worker Management Routes
const workerRoutes = require('./routes/worker');
const jobRoutes = require('./routes/jobs');

app.use('/api/worker', workerRoutes);
app.use('/api/jobs', jobRoutes);

// Healthcheck
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date() });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});