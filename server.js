const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const cors = require('cors');
const { Parser: CsvParser } = require('json2csv');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.text({ type: ['text/plain', 'application/sql'], limit: '50mb' }));

// PostgreSQL Pool Connection (Render / Cloud DB URL) — unchanged from existing setup
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('sslmode=require')
    ? { rejectUnauthorized: false }
    : false
});

const WORKER_TOKEN = process.env.WORKER_TOKEN || '';

// Same district id/name pairs as frontend/src/mocks/districts.ts (MahaRERA's
// own project_district select) — single source of truth for both sides.
const DISTRICTS = [
  { id: 497, name: 'Nandurbar' }, { id: 498, name: 'Dhule' }, { id: 499, name: 'Jalgaon' },
  { id: 500, name: 'Buldana' }, { id: 501, name: 'Akola' }, { id: 502, name: 'Washim' },
  { id: 503, name: 'Amravati' }, { id: 504, name: 'Wardha' }, { id: 505, name: 'Nagpur' },
  { id: 506, name: 'Bhandara' }, { id: 507, name: 'Gondiya' }, { id: 508, name: 'Gadchiroli' },
  { id: 509, name: 'Chandrapur' }, { id: 510, name: 'Yavatmal' }, { id: 511, name: 'Nanded' },
  { id: 512, name: 'Hingoli' }, { id: 513, name: 'Parbhani' }, { id: 514, name: 'Jalna' },
  { id: 515, name: 'Aurangabad' }, { id: 516, name: 'Nashik' }, { id: 517, name: 'Thane' },
  { id: 518, name: 'Mumbai Suburban' }, { id: 519, name: 'Mumbai City' }, { id: 520, name: 'Raigarh' },
  { id: 521, name: 'Pune' }, { id: 522, name: 'Ahmednagar' }, { id: 523, name: 'Beed' },
  { id: 524, name: 'Latur' }, { id: 525, name: 'Osmanabad' }, { id: 526, name: 'Solapur' },
  { id: 527, name: 'Satara' }, { id: 528, name: 'Ratnagiri' }, { id: 529, name: 'Sindhudurg' },
  { id: 530, name: 'Kolhapur' }, { id: 531, name: 'Sangli' }, { id: 990, name: 'Palghar' },
  { id: 992, name: 'DHARASHIV' },
];
const DISTRICT_BY_ID = new Map(DISTRICTS.map((d) => [d.id, d]));

// ------------------------------------------------------------------
// SCHEMA (auto-applied on boot; additive only — never touches `tasks`/
// `projects` created by the existing server.js flow)
// ------------------------------------------------------------------
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS scrape_jobs (
  id SERIAL PRIMARY KEY,
  worker_type VARCHAR(10) NOT NULL CHECK (worker_type IN ('link','data')),
  district VARCHAR(100) NOT NULL,
  district_id INT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  processed INT DEFAULT 0,
  total INT DEFAULT 0,
  found INT DEFAULT 0,
  failed INT DEFAULT 0,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_scrape_jobs_status ON scrape_jobs(status);
CREATE INDEX IF NOT EXISTS idx_scrape_jobs_district ON scrape_jobs(district, worker_type);

CREATE TABLE IF NOT EXISTS links (
  id BIGSERIAL PRIMARY KEY,
  district VARCHAR(100) NOT NULL,
  rera_id VARCHAR(100) NOT NULL,
  project_name TEXT,
  pincode VARCHAR(20),
  project_url TEXT NOT NULL,
  page_number INT,
  status VARCHAR(30) DEFAULT 'active',
  scraped_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uniq_link UNIQUE (district, rera_id)
);
CREATE INDEX IF NOT EXISTS idx_links_district ON links(district);

CREATE TABLE IF NOT EXISTS basic_data (
  id BIGSERIAL PRIMARY KEY,
  project_id VARCHAR(50) UNIQUE,
  rera_id VARCHAR(100),
  district VARCHAR(100),
  taluka VARCHAR(150),
  village VARCHAR(150),
  project_name TEXT,
  registration_number TEXT,
  date_of_registration TEXT,
  proposed_completion_date TEXT,
  address TEXT,
  pincode VARCHAR(20),
  longitude TEXT,
  latitude TEXT,
  view_details_url TEXT,
  page_number INT,
  status VARCHAR(20),
  scraped_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_basic_data_district ON basic_data(district);
`;

async function initSchema() {
  await pool.query(SCHEMA_SQL);
  console.log('[schema] scrape_jobs / links / basic_data ready');
}

// ------------------------------------------------------------------
// WORKER AUTH — everything under /api/worker/* requires this
// ------------------------------------------------------------------
function requireWorkerToken(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!WORKER_TOKEN || token !== WORKER_TOKEN) {
    return res.status(401).json({ success: false, error: 'Invalid or missing worker token' });
  }
  next();
}

// ------------------------------------------------------------------
// 1. Health check (unchanged)
// ------------------------------------------------------------------
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'OK', database: 'Connected' });
  } catch (err) {
    res.status(500).json({ status: 'Error', message: err.message });
  }
});

// ------------------------------------------------------------------
// 2. DASHBOARD + SCRAPING CONTROLS  (consumed by scrapingApi.ts)
// ------------------------------------------------------------------
app.get('/api/dashboard/stats', async (req, res) => {
  try {
    const [{ rows: linkRows }, { rows: dataRows }, { rows: failedRows }] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS c FROM links'),
      pool.query('SELECT COUNT(*)::int AS c FROM basic_data'),
      pool.query("SELECT COUNT(*)::int AS c FROM basic_data WHERE status = 'FAILED'"),
    ]);
    // NOTE: no {success, data} envelope here — the frontend's apiRequest()
    // already wraps whatever JSON we send in one, so we return the raw
    // DashboardStats shape directly (wrapping it again double-nests it).
    res.json({
      totalDistricts: DISTRICTS.length,
      totalProjects: linkRows[0].c,
      totalLinks: linkRows[0].c,
      totalDataScraped: dataRows[0].c,
      totalFailed: failedRows[0].c,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

function mapStatus(s) {
  switch (s) {
    case 'RUNNING': return 'running';
    case 'STOP_REQUESTED': return 'running';
    case 'STOPPED': return 'stopped';
    case 'COMPLETED': return 'completed';
    case 'FAILED': return 'failed';
    default: return 'pending';
  }
}

app.get('/api/scraping/districts', async (req, res) => {
  try {
    const { rows: latestJobs } = await pool.query(`
      SELECT DISTINCT ON (district, worker_type) *
      FROM scrape_jobs
      ORDER BY district, worker_type, created_at DESC
    `);
    const { rows: linkCounts } = await pool.query(
      'SELECT district, COUNT(*)::int AS c FROM links GROUP BY district'
    );
    const { rows: dataCounts } = await pool.query(
      "SELECT district, COUNT(*)::int AS c, SUM((status='FAILED')::int)::int AS f FROM basic_data GROUP BY district"
    );
    const linkCountByDistrict = Object.fromEntries(linkCounts.map((r) => [r.district, r.c]));
    const dataCountByDistrict = Object.fromEntries(dataCounts.map((r) => [r.district, r.c]));
    const dataFailByDistrict = Object.fromEntries(dataCounts.map((r) => [r.district, r.f]));

    const jobFor = (district, type) =>
      latestJobs.find((j) => j.district === district && j.worker_type === type);

    const data = DISTRICTS.map((d) => {
      const lj = jobFor(d.name, 'link');
      const dj = jobFor(d.name, 'data');
      return {
        district: d.name,
        districtId: d.id,
        linkStatus: mapStatus(lj?.status),
        dataStatus: mapStatus(dj?.status),
        linkProgress: {
          totalProjects: lj?.total || 0,
          projectsProcessed: lj?.processed || 0,
          linksFound: linkCountByDistrict[d.name] || 0,
          linksFailed: lj?.failed || 0,
        },
        dataProgress: {
          totalLinks: linkCountByDistrict[d.name] || 0,
          dataScraped: dataCountByDistrict[d.name] || 0,
          dataPending: Math.max((linkCountByDistrict[d.name] || 0) - (dataCountByDistrict[d.name] || 0), 0),
          dataFailed: dataFailByDistrict[d.name] || 0,
        },
        lastUpdated: (lj?.updated_at || dj?.updated_at || new Date()).toISOString?.() || new Date().toISOString(),
      };
    });

    res.json(data); // raw DistrictScrapingState[] — see note above
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/scraping/:districtId/:worker/:action', async (req, res) => {
  const districtId = parseInt(req.params.districtId, 10);
  const worker = req.params.worker; // 'link' | 'data'
  const action = req.params.action; // 'start' | 'stop' | 'restart' | 'resume'
  const district = DISTRICT_BY_ID.get(districtId);

  if (!district || !['link', 'data'].includes(worker)) {
    return res.status(400).json({ success: false, error: 'Unknown district or worker kind' });
  }

  try {
    if (action === 'stop') {
      await pool.query(
        `UPDATE scrape_jobs SET status = 'STOP_REQUESTED', updated_at = NOW()
         WHERE district = $1 AND worker_type = $2 AND status IN ('PENDING','RUNNING')`,
        [district.name, worker]
      );
    } else {
      // start / restart / resume: reuse an existing non-final job if present,
      // otherwise queue a new one. The local worker.py picks it up next poll.
      const { rows: existing } = await pool.query(
        `SELECT id FROM scrape_jobs WHERE district = $1 AND worker_type = $2
         AND status IN ('PENDING','RUNNING','STOP_REQUESTED') LIMIT 1`,
        [district.name, worker]
      );
      if (existing.length === 0) {
        await pool.query(
          `INSERT INTO scrape_jobs (worker_type, district, district_id, status)
           VALUES ($1, $2, $3, 'PENDING')`,
          [worker, district.name, district.id]
        );
      }
    }

    // Return the updated DistrictScrapingState for this district (same shape
    // as /api/scraping/districts entries).
    const { rows: latestJobs } = await pool.query(
      `SELECT DISTINCT ON (worker_type) * FROM scrape_jobs
       WHERE district = $1 ORDER BY worker_type, created_at DESC`,
      [district.name]
    );
    const lj = latestJobs.find((j) => j.worker_type === 'link');
    const dj = latestJobs.find((j) => j.worker_type === 'data');
    const { rows: linkCountRows } = await pool.query('SELECT COUNT(*)::int AS c FROM links WHERE district = $1', [district.name]);
    const { rows: dataCountRows } = await pool.query('SELECT COUNT(*)::int AS c FROM basic_data WHERE district = $1', [district.name]);

    res.json({
      district: district.name,
      districtId: district.id,
      linkStatus: mapStatus(lj?.status),
      dataStatus: mapStatus(dj?.status),
      linkProgress: {
        totalProjects: lj?.total || 0,
        projectsProcessed: lj?.processed || 0,
        linksFound: linkCountRows[0].c,
        linksFailed: lj?.failed || 0,
      },
      dataProgress: {
        totalLinks: linkCountRows[0].c,
        dataScraped: dataCountRows[0].c,
        dataPending: Math.max(linkCountRows[0].c - dataCountRows[0].c, 0),
        dataFailed: dj?.failed || 0,
      },
      lastUpdated: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ------------------------------------------------------------------
// 3. LINKS  (consumed by linksApi.ts)
// ------------------------------------------------------------------
app.get('/api/links', async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 25, 1), 500);
    const { search, district, status, sortColumn, sortDirection } = req.query;

    const where = [];
    const params = [];
    if (district) { params.push(district); where.push(`district = $${params.length}`); }
    if (status) { params.push(status); where.push(`status = $${params.length}`); }
    if (search) {
      params.push(`%${search}%`);
      where.push(`(project_name ILIKE $${params.length} OR rera_id ILIKE $${params.length})`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const sortableColumns = { reraId: 'rera_id', projectName: 'project_name', district: 'district', scrapedAt: 'scraped_at' };
    const sortCol = sortableColumns[sortColumn] || 'scraped_at';
    const sortDir = sortDirection === 'asc' ? 'ASC' : 'DESC';

    const { rows: countRows } = await pool.query(`SELECT COUNT(*)::int AS c FROM links ${whereSql}`, params);
    const totalItems = countRows[0].c;

    params.push(pageSize, (page - 1) * pageSize);
    const { rows } = await pool.query(
      `SELECT * FROM links ${whereSql} ORDER BY ${sortCol} ${sortDir} LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const data = rows.map((r, i) => ({
      srNo: (page - 1) * pageSize + i + 1,
      district: r.district,
      taluka: 'N/A',
      village: 'N/A',
      reraId: r.rera_id,
      projectName: r.project_name || 'N/A',
      projectUrl: r.project_url,
      status: r.status === 'active' ? 'active' : r.status,
      scrapedAt: r.scraped_at,
    }));

    res.json({
      data,
      pagination: { page, pageSize, totalItems, totalPages: Math.ceil(totalItems / pageSize) || 1 },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/links/upload', express.raw({ type: '*/*', limit: '50mb' }), async (req, res) => {
  // Minimal support for the existing "upload a .sql dump" UI action: runs the
  // uploaded file's statements as-is. Intended for trusted, manually-prepared
  // exports only (this endpoint does not parse multipart itself beyond the
  // raw body, matching the "minimum required" scope of this integration).
  try {
    const sql = req.body.toString('utf-8');
    const before = await pool.query('SELECT COUNT(*)::int AS c FROM links');
    await pool.query(sql);
    const after = await pool.query('SELECT COUNT(*)::int AS c FROM links');
    const inserted = after.rows[0].c - before.rows[0].c;
    res.json({ success: true, totalRecords: after.rows[0].c, inserted, duplicates: 0, failed: 0 });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/links/export', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM links ORDER BY district, rera_id');
    const parser = new CsvParser();
    const csv = parser.parse(rows);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="links-export.csv"');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ------------------------------------------------------------------
// 4. BASIC DATA  (consumed by basicDataApi.ts)
// ------------------------------------------------------------------
app.get('/api/basic-data', async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 25, 1), 500);
    const { search, district } = req.query;

    const where = [];
    const params = [];
    if (district) { params.push(district); where.push(`district = $${params.length}`); }
    if (search) {
      params.push(`%${search}%`);
      where.push(`(project_name ILIKE $${params.length} OR rera_id ILIKE $${params.length})`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const { rows: countRows } = await pool.query(`SELECT COUNT(*)::int AS c FROM basic_data ${whereSql}`, params);
    const totalItems = countRows[0].c;

    params.push(pageSize, (page - 1) * pageSize);
    const { rows } = await pool.query(
      `SELECT * FROM basic_data ${whereSql} ORDER BY scraped_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const data = rows.map((r) => ({
      reraId: r.rera_id,
      projectName: r.project_name || 'N/A',
      district: r.district || 'N/A',
      taluka: r.taluka || 'N/A',
      village: r.village || 'N/A',
      promoter: 'NOT FOUND', // not extracted by the current data scraper
      registrationDate: r.date_of_registration || 'N/A',
      projectStatus: r.status || 'N/A',
    }));

    res.json({
      data,
      pagination: { page, pageSize, totalItems, totalPages: Math.ceil(totalItems / pageSize) || 1 },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/basic-data/upload', express.raw({ type: '*/*', limit: '50mb' }), async (req, res) => {
  try {
    const sql = req.body.toString('utf-8');
    const before = await pool.query('SELECT COUNT(*)::int AS c FROM basic_data');
    await pool.query(sql);
    const after = await pool.query('SELECT COUNT(*)::int AS c FROM basic_data');
    const inserted = after.rows[0].c - before.rows[0].c;
    res.json({ success: true, totalRecords: after.rows[0].c, inserted, duplicates: 0, failed: 0 });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/basic-data/export', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM basic_data ORDER BY district, rera_id');
    const parser = new CsvParser();
    const csv = parser.parse(rows);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="basic-data-export.csv"');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ------------------------------------------------------------------
// 5. WORKER-FACING API  (consumed only by scraper_worker/worker.py)
// ------------------------------------------------------------------
app.use('/api/worker', requireWorkerToken);

app.post('/api/worker/heartbeat', (req, res) => {
  res.json({ success: true, serverTime: new Date().toISOString() });
});

app.get('/api/worker/jobs/next', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      UPDATE scrape_jobs SET status = 'RUNNING', started_at = COALESCE(started_at, NOW()), updated_at = NOW()
      WHERE id = (
        SELECT id FROM scrape_jobs WHERE status = 'PENDING' ORDER BY created_at ASC
        FOR UPDATE SKIP LOCKED LIMIT 1
      )
      RETURNING id, worker_type AS type, district, district_id AS "districtId", status
    `);
    res.json({ success: true, data: rows[0] || null });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/worker/jobs/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM scrape_jobs WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ success: false, error: 'Job not found' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/worker/jobs/:id/progress', async (req, res) => {
  const { processed, total, found, failed } = req.body;
  try {
    await pool.query(
      `UPDATE scrape_jobs SET processed = COALESCE($2, processed), total = COALESCE($3, total),
       found = COALESCE($4, found), failed = COALESCE($5, failed), updated_at = NOW() WHERE id = $1`,
      [req.params.id, processed, total, found, failed]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/worker/jobs/:id/complete', async (req, res) => {
  const { status, error } = req.body; // COMPLETED | STOPPED | FAILED
  try {
    await pool.query(
      `UPDATE scrape_jobs SET status = $2, error = $3, updated_at = NOW(),
       completed_at = CASE WHEN $2 = 'COMPLETED' THEN NOW() ELSE completed_at END WHERE id = $1`,
      [req.params.id, status, error || null]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Link scraper uploads discovered links in batches for a given job/district
app.post('/api/worker/links', async (req, res) => {
  const { district, rows } = req.body; // rows: [{reraId, projectName, pincode, viewUrl, pageNumber}]
  if (!district || !Array.isArray(rows)) {
    return res.status(400).json({ success: false, error: 'district and rows[] are required' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let inserted = 0;
    for (const r of rows) {
      if (!r.reraId || r.reraId === 'N/A') continue;
      const result = await client.query(
        `INSERT INTO links (district, rera_id, project_name, pincode, project_url, page_number)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (district, rera_id) DO UPDATE SET
           project_name = EXCLUDED.project_name, pincode = EXCLUDED.pincode,
           project_url = EXCLUDED.project_url, page_number = EXCLUDED.page_number
         RETURNING (xmax = 0) AS inserted`,
        [district, r.reraId, r.projectName || 'N/A', r.pincode || 'N/A', r.viewUrl || 'N/A', r.pageNumber || 0]
      );
      if (result.rows[0]?.inserted) inserted += 1;
    }
    await client.query('COMMIT');
    res.json({ success: true, data: { received: rows.length, inserted } });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});

// Data scraper reads the district's links so it only processes that district
app.get('/api/worker/links', async (req, res) => {
  const { district } = req.query;
  if (!district) return res.status(400).json({ success: false, error: 'district is required' });
  try {
    const { rows } = await pool.query(
      'SELECT rera_id AS "reraId", project_url AS "viewUrl", page_number AS "pageNumber" FROM links WHERE district = $1 ORDER BY id',
      [district]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Data scraper uploads extracted project details in batches
app.post('/api/worker/basic-data', async (req, res) => {
  const { rows } = req.body;
  if (!Array.isArray(rows)) return res.status(400).json({ success: false, error: 'rows[] is required' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const r of rows) {
      if (!r.projectId) continue;
      await client.query(
        `INSERT INTO basic_data (
           project_id, rera_id, district, taluka, village, project_name, registration_number,
           date_of_registration, proposed_completion_date, address, pincode, longitude, latitude,
           view_details_url, page_number, status
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         ON CONFLICT (project_id) DO UPDATE SET
           rera_id = EXCLUDED.rera_id, district = EXCLUDED.district, taluka = EXCLUDED.taluka,
           village = EXCLUDED.village, project_name = EXCLUDED.project_name,
           registration_number = EXCLUDED.registration_number, date_of_registration = EXCLUDED.date_of_registration,
           proposed_completion_date = EXCLUDED.proposed_completion_date, address = EXCLUDED.address,
           pincode = EXCLUDED.pincode, longitude = EXCLUDED.longitude, latitude = EXCLUDED.latitude,
           view_details_url = EXCLUDED.view_details_url, page_number = EXCLUDED.page_number, status = EXCLUDED.status`,
        [r.projectId, r.reraId, r.district, r.taluka, r.village, r.projectName, r.registrationNumber,
         r.dateOfRegistration, r.proposedCompletionDate, r.address, r.pincode, r.longitude, r.latitude,
         r.viewDetailsUrl, r.pageNumber, r.status]
      );
    }
    await client.query('COMMIT');
    res.json({ success: true, data: { received: rows.length } });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});

// ------------------------------------------------------------------
// Serve Vite Frontend Build in Production (unchanged)
// ------------------------------------------------------------------
app.use(express.static(path.join(__dirname, 'frontend/dist')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend/dist', 'index.html'));
});

const PORT = process.env.PORT || 5000;
initSchema()
  .then(() => app.listen(PORT, () => console.log(`Server running on port ${PORT}`)))
  .catch((err) => {
    console.error('Failed to initialize schema:', err);
    process.exit(1);
  });