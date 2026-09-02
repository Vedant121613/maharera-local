const express = require('express');
const router = express.Router();
const pool = require('../db');

// 1. Trigger a New Scraping Job
router.post('/jobs', async (req, res) => {
    const { job_type, district, start_page, end_page } = req.body;

    if (!job_type || !district) {
        return res.status(400).json({ success: false, message: 'job_type and district are required' });
    }

    try {
        const result = await pool.query(
            `INSERT INTO scraping_jobs (job_type, district, start_page, end_page, status)
             VALUES ($1, $2, $3, $4, 'PENDING')
             RETURNING *`,
            [job_type, district, start_page || 1, end_page || null]
        );
        res.status(201).json({ success: true, job: result.rows[0] });
    } catch (err) {
        console.error('Create job error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 2. Request Stop for a Running Job
router.post('/jobs/:id/stop', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(
            `UPDATE scraping_jobs 
             SET status = 'STOP_REQUESTED' 
             WHERE id = $1 AND status IN ('PENDING', 'RUNNING')
             RETURNING *`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({ success: false, message: 'Job not active or already finished' });
        }

        res.json({ success: true, message: 'Stop request issued', job: result.rows[0] });
    } catch (err) {
        console.error('Stop job error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 3. Get Job Status & Recent Queue
router.get('/jobs', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT * FROM scraping_jobs ORDER BY created_at DESC LIMIT 20`
        );
        res.json({ success: true, jobs: result.rows });
    } catch (err) {
        console.error('Fetch jobs error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 4. Get Worker Status Overview
router.get('/workers', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT worker_id, hostname, status, current_job_id, last_heartbeat,
                    (last_heartbeat > NOW() - INTERVAL '30 seconds') as is_active
             FROM worker_nodes 
             ORDER BY last_heartbeat DESC`
        );
        res.json({ success: true, workers: result.rows });
    } catch (err) {
        console.error('Fetch workers error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;