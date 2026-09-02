const express = require('express');
const router = express.Router();
const pool = require('../db'); // Adjust path to existing Postgres pool if needed

// Secret token for local worker auth
const WORKER_AUTH_TOKEN = process.env.WORKER_AUTH_TOKEN || 'rera-local-worker-secret-key';

// Middleware for authenticating local worker
const authenticateWorker = (req, res, next) => {
    const token = req.headers['x-worker-auth-token'];
    if (!token || token !== WORKER_AUTH_TOKEN) {
        return res.status(401).json({ success: false, message: 'Unauthorized Worker' });
    }
    next();
};

// 1. Worker Heartbeat
router.post('/heartbeat', authenticateWorker, async (req, res) => {
    const { worker_id, hostname, status, current_job_id } = req.body;
    try {
        await pool.query(
            `INSERT INTO worker_nodes (worker_id, hostname, status, current_job_id, last_heartbeat)
             VALUES ($1, $2, $3, $4, NOW())
             ON CONFLICT (worker_id) 
             DO UPDATE SET 
                hostname = EXCLUDED.hostname,
                status = EXCLUDED.status,
                current_job_id = EXCLUDED.current_job_id,
                last_heartbeat = NOW()`,
            [worker_id, hostname, status || 'ONLINE', current_job_id || null]
        );
        res.json({ success: true, message: 'Heartbeat received' });
    } catch (err) {
        console.error('Heartbeat error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 2. Poll Next Pending Job
router.get('/jobs/poll', authenticateWorker, async (req, res) => {
    const { worker_id } = req.query;
    try {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const result = await client.query(
                `SELECT * FROM scraping_jobs 
                 WHERE status = 'PENDING' 
                 ORDER BY created_at ASC 
                 FOR UPDATE SKIP LOCKED 
                 LIMIT 1`
            );

            if (result.rows.length === 0) {
                await client.query('COMMIT');
                return res.json({ success: true, job: null });
            }

            const job = result.rows[0];
            await client.query(
                `UPDATE scraping_jobs 
                 SET status = 'RUNNING', assigned_worker_id = $1, started_at = NOW() 
                 WHERE id = $2`,
                [worker_id, job.id]
            );
            await client.query('COMMIT');

            res.json({ success: true, job });
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('Poll jobs error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 3. Update Job Progress & Check for Stop Request
router.post('/jobs/:id/progress', authenticateWorker, async (req, res) => {
    const { id } = req.params;
    const { processed_items, total_items, failed_items, status, error_message } = req.body;

    try {
        const checkRes = await pool.query('SELECT status FROM scraping_jobs WHERE id = $1', [id]);
        if (checkRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Job not found' });
        }

        const currentStatus = checkRes.rows[0].status;
        const isStopRequested = currentStatus === 'STOP_REQUESTED';

        let newStatus = isStopRequested ? 'STOP_REQUESTED' : (status || currentStatus);

        await pool.query(
            `UPDATE scraping_jobs 
             SET processed_items = COALESCE($1, processed_items),
                 total_items = COALESCE($2, total_items),
                 failed_items = COALESCE($3, failed_items),
                 status = $4,
                 error_message = COALESCE($5, error_message),
                 completed_at = CASE WHEN $4 IN ('COMPLETED', 'STOPPED', 'FAILED') THEN NOW() ELSE completed_at END
             WHERE id = $6`,
            [processed_items, total_items, failed_items, newStatus, error_message, id]
        );

        res.json({ 
            success: true, 
            stop_requested: isStopRequested,
            status: newStatus 
        });
    } catch (err) {
        console.error('Progress update error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 4. Bulk Upload RERA Links
router.post('/data/links/bulk', authenticateWorker, async (req, res) => {
    const { links } = req.body; // Array of { rera_reg_no, project_name, district, detail_url }
    if (!Array.isArray(links) || links.length === 0) {
        return res.status(400).json({ success: false, message: 'No links provided' });
    }

    try {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            for (const item of links) {
                await client.query(
                    `INSERT INTO rera_links (rera_reg_no, project_name, district, detail_url)
                     VALUES ($1, $2, $3, $4)
                     ON CONFLICT (rera_reg_no) 
                     DO UPDATE SET project_name = EXCLUDED.project_name, detail_url = EXCLUDED.detail_url`,
                    [item.rera_reg_no, item.project_name, item.district, item.detail_url]
                );
            }
            await client.query('COMMIT');
            res.json({ success: true, count: links.length });
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('Bulk links error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 5. Bulk Upload RERA Details
router.post('/data/projects/bulk', authenticateWorker, async (req, res) => {
    const { projects } = req.body;
    if (!Array.isArray(projects) || projects.length === 0) {
        return res.status(400).json({ success: false, message: 'No project details provided' });
    }

    try {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            for (const proj of projects) {
                await client.query(
                    `INSERT INTO rera_projects 
                     (rera_reg_no, project_name, promoter_name, district, address, proposed_completion_date, project_status, total_area, raw_data, updated_at)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
                     ON CONFLICT (rera_reg_no) 
                     DO UPDATE SET 
                        project_name = EXCLUDED.project_name,
                        promoter_name = EXCLUDED.promoter_name,
                        address = EXCLUDED.address,
                        proposed_completion_date = EXCLUDED.proposed_completion_date,
                        project_status = EXCLUDED.project_status,
                        total_area = EXCLUDED.total_area,
                        raw_data = EXCLUDED.raw_data,
                        updated_at = NOW()`,
                    [
                        proj.rera_reg_no,
                        proj.project_name,
                        proj.promoter_name,
                        proj.district,
                        proj.address,
                        proj.proposed_completion_date,
                        proj.project_status,
                        proj.total_area,
                        JSON.stringify(proj.raw_data || {})
                    ]
                );

                // Mark link status as PROCESSED
                await client.query(
                    `UPDATE rera_links SET status = 'PROCESSED' WHERE rera_reg_no = $1`,
                    [proj.rera_reg_no]
                );
            }
            await client.query('COMMIT');
            res.json({ success: true, count: projects.length });
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('Bulk projects error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 6. Fetch Unprocessed Links (For DATA_SCRAPER worker job)
router.get('/data/links/pending', authenticateWorker, async (req, res) => {
    const { district, limit = 50 } = req.query;
    try {
        const query = district 
            ? `SELECT * FROM rera_links WHERE district = $1 AND status = 'PENDING' LIMIT $2`
            : `SELECT * FROM rera_links WHERE status = 'PENDING' LIMIT $1`;
        
        const params = district ? [district, limit] : [limit];
        const result = await pool.query(query, params);
        res.json({ success: true, links: result.rows });
    } catch (err) {
        console.error('Pending links error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;