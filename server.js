const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// PostgreSQL Pool Connection (Render / Cloud DB URL)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// API Routes

// 1. Health Check
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'OK', database: 'Connected' });
  } catch (err) {
    res.status(500).json({ status: 'Error', message: err.message });
  }
});

// 2. Frontend user creates new scraping task
app.post('/api/tasks/create', async (req, res) => {
  const { district, searchParam } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO tasks (district, search_param, status, created_at) VALUES ($1, $2, $3, NOW()) RETURNING *',
      [district, searchParam, 'PENDING']
    );
    res.json({ success: true, task: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Local Python Scraper fetches next pending task
app.get('/api/tasks/pending', async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM tasks WHERE status = 'PENDING' ORDER BY created_at ASC LIMIT 1"
    );
    if (result.rows.length === 0) {
      return res.json({ task: null });
    }
    const task = result.rows[0];
    await pool.query("UPDATE tasks SET status = 'PROCESSING' WHERE id = $1", [task.id]);
    res.json({ task });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Local Python Scraper sends finished scraped data back to Database
app.post('/api/tasks/complete', async (req, res) => {
  const { taskId, scrapedData } = req.body;
  try {
    // Insert into scraped_projects table
    for (const item of scrapedData) {
      await pool.query(
        'INSERT INTO projects (task_id, project_name, rera_no, promoter, data) VALUES ($1, $2, $3, $4, $5)',
        [taskId, item.projectName || '', item.reraNo || '', item.promoter || '', JSON.stringify(item)]
      );
    }
    await pool.query("UPDATE tasks SET status = 'COMPLETED' WHERE id = $1", [taskId]);
    res.json({ success: true, message: 'Data synced successfully' });
  } catch (err) {
    await pool.query("UPDATE tasks SET status = 'FAILED' WHERE id = $1", [taskId]);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Serve Vite Frontend Build in Production
app.use(express.static(path.join(__dirname, 'frontend/dist')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend/dist', 'index.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));