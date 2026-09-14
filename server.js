const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const cors = require('cors');
const multer = require('multer');
const initSqlJs = require('sql.js');
// The frontend's buildUrl() sends unset filters as the literal string
// "null" (not omitted), since it only checks `value !== undefined`. Treat
// those (and "undefined"/"") as "no filter" everywhere we read query params.
function cleanParam(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === '' || s === 'null' || s === 'undefined' ? null : s;
}

// Tiny dependency-free CSV serializer (avoids pinning an extra npm package
// for a one-line need; handles quoting/commas/newlines/nulls).
function toCsv(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escape = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(',')];
  for (const row of rows) lines.push(headers.map((h) => escape(row[h])).join(','));
  return lines.join('\n');
}

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

// SQLite (.db) upload support — data_scraper.py's local output is a SQLite
// file (table "projects"); sql.js (pure WASM, no native build step) reads
// it in-process so the uploaded file can be inserted straight into Postgres.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 300 * 1024 * 1024 } });
let SQLJS = null;
initSqlJs().then((sql) => { SQLJS = sql; }).catch((err) => console.error('Failed to init sql.js:', err));

function readSqliteTable(fileBuffer, tableName) {
  const db = new SQLJS.Database(new Uint8Array(fileBuffer));
  try {
    const result = db.exec(`SELECT * FROM ${tableName}`);
    if (!result[0]) return [];
    const { columns, values } = result[0];
    return values.map((row) => Object.fromEntries(columns.map((c, i) => [c, row[i]])));
  } finally {
    db.close();
  }
}

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

-- Certificate PDF storage (NEW, additive) — the actual PDF bytes returned
-- by /project-document?id=<qstr>&type=DocProjectCert, stored per project.
-- Certificate URL storage (NEW, additive) — the /project-document?id=...
-- link itself, stored exactly like project_url, since the endpoint requires
-- the site's own browser session to actually return a PDF (see link_scraper.py).
ALTER TABLE links ADD COLUMN IF NOT EXISTS certificate_url TEXT;
ALTER TABLE links ADD COLUMN IF NOT EXISTS certificate_status VARCHAR(20);

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
    case 'STOP_REQUESTED': return 'paused'; // "stopping" — frontend's WorkerStatus has no distinct value, 'paused' is the closest honest signal
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
    const district = cleanParam(req.query.district);
    const status = cleanParam(req.query.status);
    const search = cleanParam(req.query.search);
    const sortColumn = cleanParam(req.query.sortColumn);
    const sortDirection = cleanParam(req.query.sortDirection);

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
      certificateUrl: r.certificate_url || 'N/A', // extra field — safe to ignore if unused by the frontend today
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

app.post('/api/links/upload', upload.single('file'), async (req, res) => {
  // Accepts a SQLite .db file (e.g. produced by the scraper) and upserts its
  // rows into the links table — same dedup key (district, rera_id) as the
  // normal worker upload path.
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No file uploaded (expected form field "file")' });
  }
  if (!SQLJS) {
    return res.status(503).json({ success: false, error: 'Server is still starting up, try again shortly' });
  }
  try {
    let rows;
    let tableUsed;
    try {
      rows = readSqliteTable(req.file.buffer, 'links');
      tableUsed = 'links';
    } catch {
      // Fall back to the "projects" table (data_scraper.py's schema) and
      // pull out just the link-relevant fields.
      const projectRows = readSqliteTable(req.file.buffer, 'projects');
      rows = projectRows.map((r) => ({
        district: r.district, rera_id: r.rera_id, project_name: r.project_name,
        pincode: r.pin_code, project_url: r.view_details_url, page_number: r.page_number,
      }));
      tableUsed = 'projects (link fields only)';
    }

    const before = await pool.query('SELECT COUNT(*)::int AS c FROM links');
    let processed = 0;
    for (const r of rows) {
      if (!r.rera_id || !r.district) continue;
      await pool.query(
        `INSERT INTO links (district, rera_id, project_name, pincode, project_url, page_number)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (district, rera_id) DO UPDATE SET
           project_name = EXCLUDED.project_name, pincode = EXCLUDED.pincode,
           project_url = EXCLUDED.project_url, page_number = EXCLUDED.page_number`,
        [r.district, r.rera_id, r.project_name || 'N/A', r.pincode || 'N/A', r.project_url || 'N/A', r.page_number || 0]
      );
      processed += 1;
    }
    const after = await pool.query('SELECT COUNT(*)::int AS c FROM links');
    const inserted = after.rows[0].c - before.rows[0].c;
    res.json({
      success: true, totalRecords: after.rows[0].c, inserted,
      duplicates: processed - inserted, failed: rows.length - processed,
    });
  } catch (err) {
    res.status(400).json({ success: false, error: `Could not read .db file: ${err.message}` });
  }
});

app.get('/api/links/export', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM links ORDER BY district, rera_id');
    const csv = toCsv(rows);
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
    const district = cleanParam(req.query.district);
    const search = cleanParam(req.query.search);

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

app.post('/api/basic-data/upload', upload.single('file'), async (req, res) => {
  // Accepts the .db file data_scraper.py produces locally (table "projects")
  // and upserts every row into basic_data — same key (project_id) and
  // column set the automated worker upload already uses.
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No file uploaded (expected form field "file")' });
  }
  if (!SQLJS) {
    return res.status(503).json({ success: false, error: 'Server is still starting up, try again shortly' });
  }
  try {
    const rows = readSqliteTable(req.file.buffer, 'projects');
    const before = await pool.query('SELECT COUNT(*)::int AS c FROM basic_data');
    let processed = 0;
    for (const r of rows) {
      if (!r.project_id) continue;
      await pool.query(
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
        [r.project_id, r.rera_id, r.district, r.taluka, r.village, r.project_name, r.registration_number,
         r.date_of_registration, r.proposed_completion_date_original, r.address, r.pin_code, r.longitude,
         r.latitude, r.view_details_url, r.page_number, r.status]
      );
      processed += 1;
    }
    const after = await pool.query('SELECT COUNT(*)::int AS c FROM basic_data');
    const inserted = after.rows[0].c - before.rows[0].c;
    res.json({
      success: true, totalRecords: after.rows[0].c, inserted,
      duplicates: processed - inserted, failed: rows.length - processed,
    });
  } catch (err) {
    res.status(400).json({ success: false, error: `Could not read .db file (expected a "projects" table): ${err.message}` });
  }
});

app.get('/api/basic-data/export', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM basic_data ORDER BY district, rera_id');
    const csv = toCsv(rows);
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
  // Optional ?type=link|data lets the worker run independent link/data poll
  // loops concurrently, each only ever claiming its own job type (so a busy
  // Data job can never delay a Link job, or vice versa).
  const jobType = cleanParam(req.query.type);
  try {
    const typeFilter = jobType ? 'AND worker_type = $1' : '';
    const params = jobType ? [jobType] : [];
    const { rows } = await pool.query(`
      UPDATE scrape_jobs SET status = 'RUNNING', started_at = COALESCE(started_at, NOW()), updated_at = NOW()
      WHERE id = (
        SELECT id FROM scrape_jobs WHERE status = 'PENDING' ${typeFilter} ORDER BY created_at ASC
        FOR UPDATE SKIP LOCKED LIMIT 1
      )
      RETURNING id, worker_type AS type, district, district_id AS "districtId", status
    `, params);
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
      `UPDATE scrape_jobs SET status = $2::varchar, error = $3, updated_at = NOW(),
       completed_at = CASE WHEN $2::varchar = 'COMPLETED' THEN NOW() ELSE completed_at END
       WHERE id = $1::int`,
      [req.params.id, status, error || null]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Link scraper uploads discovered links in batches for a given job/district
app.post('/api/worker/links', async (req, res) => {
  const { district, rows } = req.body; // rows: [{reraId, projectName, pincode, viewUrl, pageNumber, certificateUrl, certificateStatus}]
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
        `INSERT INTO links (district, rera_id, project_name, pincode, project_url, page_number, certificate_url, certificate_status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (district, rera_id) DO UPDATE SET
           project_name = EXCLUDED.project_name, pincode = EXCLUDED.pincode,
           project_url = EXCLUDED.project_url, page_number = EXCLUDED.page_number,
           certificate_url = EXCLUDED.certificate_url, certificate_status = EXCLUDED.certificate_status
         RETURNING (xmax = 0) AS inserted`,
        [district, r.reraId, r.projectName || 'N/A', r.pincode || 'N/A', r.viewUrl || 'N/A', r.pageNumber || 0,
         r.certificateUrl || 'N/A', r.certificateStatus || 'N/A']
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