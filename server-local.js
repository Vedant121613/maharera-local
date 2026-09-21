// ============================================================================
// LOCAL DEVELOPMENT SERVER - SQLite Version (No PostgreSQL needed)
// ============================================================================
const express = require('express');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const Database = require('better-sqlite3');

// Load environment
require('dotenv').config({ path: '.env.local' });

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// SQLite Database Setup
const DB_PATH = path.join(__dirname, 'data', 'local_database.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL'); // Better performance

console.log('[LOCAL] Using SQLite database at:', DB_PATH);

// ============================================================================
// DATABASE SCHEMA INITIALIZATION
// ============================================================================
function initSchema() {
    console.log('[LOCAL] Initializing database schema...');
    
    // Create tables
    db.exec(`
        CREATE TABLE IF NOT EXISTS scrape_jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            worker_type TEXT NOT NULL CHECK (worker_type IN ('link','data')),
            district TEXT NOT NULL,
            district_id INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'PENDING',
            processed INTEGER DEFAULT 0,
            total INTEGER DEFAULT 0,
            found INTEGER DEFAULT 0,
            failed INTEGER DEFAULT 0,
            error TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            started_at TEXT,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            completed_at TEXT
        );

        CREATE TABLE IF NOT EXISTS links (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            district TEXT NOT NULL,
            rera_id TEXT NOT NULL,
            project_name TEXT,
            pincode TEXT,
            project_url TEXT NOT NULL,
            page_number INTEGER,
            status TEXT DEFAULT 'active',
            scraped_at TEXT DEFAULT CURRENT_TIMESTAMP,
            certificate_pdf BLOB,
            certificate_url TEXT,
            certificate_status TEXT,
            certificate_downloaded_at TEXT,
            UNIQUE(district, rera_id)
        );

        CREATE TABLE IF NOT EXISTS basic_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id TEXT UNIQUE,
            rera_id TEXT,
            district TEXT,
            taluka TEXT,
            village TEXT,
            project_name TEXT,
            registration_number TEXT,
            date_of_registration TEXT,
            proposed_completion_date TEXT,
            address TEXT,
            pincode TEXT,
            longitude TEXT,
            latitude TEXT,
            view_details_url TEXT,
            page_number INTEGER,
            status TEXT,
            scraped_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_scrape_jobs_status ON scrape_jobs(status);
        CREATE INDEX IF NOT EXISTS idx_scrape_jobs_district ON scrape_jobs(district, worker_type);
        CREATE INDEX IF NOT EXISTS idx_links_district ON links(district);
        CREATE INDEX IF NOT EXISTS idx_basic_data_district ON basic_data(district);
    `);

    console.log('[LOCAL] Schema initialized successfully');
}

// ============================================================================
// CSV IMPORT FUNCTIONS
// ============================================================================
function importCSVData() {
    console.log('[LOCAL] Checking for CSV files to import...');

    const dataDir = path.join(__dirname, 'data');
    
    // Import scrape_jobs
    const scrapeDataPath = path.join(dataDir, 'scrape_data.csv');
    if (fs.existsSync(scrapeDataPath)) {
        importScrapeData(scrapeDataPath);
    }

    // Import links
    const linksPath = path.join(dataDir, 'links.csv');
    if (fs.existsSync(linksPath)) {
        importLinks(linksPath);
    }

    // Import basic_data
    const basicDataPath = path.join(dataDir, 'basic_data.csv');
    if (fs.existsSync(basicDataPath)) {
        importBasicData(basicDataPath);
    }

    console.log('[LOCAL] CSV import completed');
}

function parseCSV(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());
    const headers = lines[0].split(',').map(h => h.trim());
    
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        if (values.length === headers.length) {
            const row = {};
            headers.forEach((header, idx) => {
                row[header] = values[idx] || null;
            });
            rows.push(row);
        }
    }
    return rows;
}

function parseCSVLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            values.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    values.push(current.trim());
    
    return values;
}

function importScrapeData(filePath) {
    const rows = parseCSV(filePath);
    const count = db.prepare('SELECT COUNT(*) as count FROM scrape_jobs').get().count;
    
    if (count > 0) {
        console.log(`[LOCAL] scrape_jobs already has ${count} rows, skipping import`);
        return;
    }

    console.log(`[LOCAL] Importing ${rows.length} rows into scrape_jobs...`);
    const insert = db.prepare(`
        INSERT OR IGNORE INTO scrape_jobs 
        (id, worker_type, district, district_id, status, processed, total, found, failed, error, created_at, started_at, updated_at, completed_at)
        VALUES (@id, @worker_type, @district, @district_id, @status, @processed, @total, @found, @failed, @error, @created_at, @started_at, @updated_at, @completed_at)
    `);

    const insertMany = db.transaction((rows) => {
        for (const row of rows) {
            insert.run(row);
        }
    });

    insertMany(rows);
    console.log('[LOCAL] scrape_jobs imported');
}

function importLinks(filePath) {
    const rows = parseCSV(filePath);
    const count = db.prepare('SELECT COUNT(*) as count FROM links').get().count;
    
    if (count > 0) {
        console.log(`[LOCAL] links already has ${count} rows, skipping import`);
        return;
    }

    console.log(`[LOCAL] Importing ${rows.length} rows into links...`);
    const insert = db.prepare(`
        INSERT OR IGNORE INTO links 
        (id, district, rera_id, project_name, pincode, project_url, page_number, status, scraped_at, certificate_url, certificate_status, certificate_downloaded_at)
        VALUES (@id, @district, @rera_id, @project_name, @pincode, @project_url, @page_number, @status, @scraped_at, @certificate_url, @certificate_status, @certificate_downloaded_at)
    `);

    const insertMany = db.transaction((rows) => {
        for (const row of rows) {
            insert.run(row);
        }
    });

    insertMany(rows);
    console.log('[LOCAL] links imported');
}

function importBasicData(filePath) {
    const rows = parseCSV(filePath);
    const count = db.prepare('SELECT COUNT(*) as count FROM basic_data').get().count;
    
    if (count > 0) {
        console.log(`[LOCAL] basic_data already has ${count} rows, skipping import`);
        return;
    }

    console.log(`[LOCAL] Importing ${rows.length} rows into basic_data...`);
    const insert = db.prepare(`
        INSERT OR IGNORE INTO basic_data 
        (id, project_id, rera_id, district, taluka, village, project_name, registration_number, 
         date_of_registration, proposed_completion_date, address, pincode, longitude, latitude, 
         view_details_url, page_number, status, scraped_at)
        VALUES (@id, @project_id, @rera_id, @district, @taluka, @village, @project_name, @registration_number,
                @date_of_registration, @proposed_completion_date, @address, @pincode, @longitude, @latitude,
                @view_details_url, @page_number, @status, @scraped_at)
    `);

    const insertMany = db.transaction((rows) => {
        for (const row of rows) {
            insert.run(row);
        }
    });

    insertMany(rows);
    console.log('[LOCAL] basic_data imported');
}

// ============================================================================
// DISTRICTS DATA
// ============================================================================
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

// ============================================================================
// API ENDPOINTS
// ============================================================================

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', database: 'SQLite Connected', mode: 'LOCAL' });
});

// Dashboard stats
app.get('/api/dashboard/stats', (req, res) => {
    try {
        const linkCount = db.prepare('SELECT COUNT(*) as c FROM links').get().c;
        const dataCount = db.prepare('SELECT COUNT(*) as c FROM basic_data').get().c;
        const failedCount = db.prepare("SELECT COUNT(*) as c FROM basic_data WHERE status = 'FAILED'").get().c;
        
        res.json({
            totalDistricts: DISTRICTS.length,
            totalProjects: linkCount,
            totalLinks: linkCount,
            totalDataScraped: dataCount,
            totalFailed: failedCount,
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Districts scraping status
app.get('/api/scraping/districts', (req, res) => {
    try {
        const latestJobs = db.prepare(`
            SELECT * FROM scrape_jobs 
            WHERE id IN (
                SELECT MAX(id) FROM scrape_jobs 
                GROUP BY district, worker_type
            )
        `).all();

        const linkCounts = db.prepare(`
            SELECT district, COUNT(*) as c FROM links GROUP BY district
        `).all();

        const dataCounts = db.prepare(`
            SELECT district, COUNT(*) as c, 
                   SUM(CASE WHEN status='FAILED' THEN 1 ELSE 0 END) as f 
            FROM basic_data GROUP BY district
        `).all();

        const linkCountByDistrict = Object.fromEntries(linkCounts.map(r => [r.district, r.c]));
        const dataCountByDistrict = Object.fromEntries(dataCounts.map(r => [r.district, r.c]));
        const dataFailByDistrict = Object.fromEntries(dataCounts.map(r => [r.district, r.f]));

        const jobFor = (district, type) =>
            latestJobs.find((j) => j.district === district && j.worker_type === type);

        const mapStatus = (s) => {
            switch (s) {
                case 'RUNNING': return 'running';
                case 'STOP_REQUESTED': return 'paused';
                case 'STOPPED': return 'stopped';
                case 'COMPLETED': return 'completed';
                case 'FAILED': return 'failed';
                default: return 'pending';
            }
        };

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
                lastUpdated: (lj?.updated_at || dj?.updated_at || new Date().toISOString()),
            };
        });

        res.json(data);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Links API
app.get('/api/links', (req, res) => {
    try {
        const page = Math.max(parseInt(req.query.page) || 1, 1);
        const pageSize = Math.min(Math.max(parseInt(req.query.pageSize) || 25, 1), 500);
        const district = req.query.district && req.query.district !== 'null' ? req.query.district : null;
        const search = req.query.search && req.query.search !== 'null' ? req.query.search : null;

        let whereClause = [];
        let params = {};

        if (district) {
            whereClause.push('district = @district');
            params.district = district;
        }
        if (search) {
            whereClause.push('(project_name LIKE @search OR rera_id LIKE @search)');
            params.search = `%${search}%`;
        }

        const whereSql = whereClause.length ? `WHERE ${whereClause.join(' AND ')}` : '';

        const totalItems = db.prepare(`SELECT COUNT(*) as c FROM links ${whereSql}`).get(params).c;

        params.limit = pageSize;
        params.offset = (page - 1) * pageSize;

        const rows = db.prepare(`
            SELECT * FROM links ${whereSql}
            ORDER BY scraped_at DESC
            LIMIT @limit OFFSET @offset
        `).all(params);

        const data = rows.map((r, i) => ({
            srNo: (page - 1) * pageSize + i + 1,
            district: r.district,
            taluka: 'N/A',
            village: 'N/A',
            reraId: r.rera_id,
            projectName: r.project_name || 'N/A',
            projectUrl: r.project_url,
            certificateUrl: r.certificate_url || 'N/A',
            status: r.status || 'active',
            scrapedAt: r.scraped_at,
        }));

        res.json({
            data,
            pagination: {
                page,
                pageSize,
                totalItems,
                totalPages: Math.ceil(totalItems / pageSize) || 1
            },
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Basic Data API
app.get('/api/basic-data', (req, res) => {
    try {
        const page = Math.max(parseInt(req.query.page) || 1, 1);
        const pageSize = Math.min(Math.max(parseInt(req.query.pageSize) || 25, 1), 500);
        const district = req.query.district && req.query.district !== 'null' ? req.query.district : null;
        const search = req.query.search && req.query.search !== 'null' ? req.query.search : null;

        let whereClause = [];
        let params = {};

        if (district) {
            whereClause.push('district = @district');
            params.district = district;
        }
        if (search) {
            whereClause.push('(project_name LIKE @search OR rera_id LIKE @search)');
            params.search = `%${search}%`;
        }

        const whereSql = whereClause.length ? `WHERE ${whereClause.join(' AND ')}` : '';

        const totalItems = db.prepare(`SELECT COUNT(*) as c FROM basic_data ${whereSql}`).get(params).c;

        params.limit = pageSize;
        params.offset = (page - 1) * pageSize;

        const rows = db.prepare(`
            SELECT * FROM basic_data ${whereSql}
            ORDER BY scraped_at DESC
            LIMIT @limit OFFSET @offset
        `).all(params);

        const data = rows.map((r) => ({
            reraId: r.rera_id || 'N/A',
            projectName: r.project_name || 'N/A',
            district: r.district || 'N/A',
            taluka: r.taluka || 'N/A',
            village: r.village || 'N/A',
            promoter: 'NOT FOUND',
            registrationDate: r.date_of_registration || 'N/A',
            projectStatus: r.status || 'N/A',
        }));

        res.json({
            data,
            pagination: {
                page,
                pageSize,
                totalItems,
                totalPages: Math.ceil(totalItems / pageSize) || 1
            },
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Scraping control endpoints (mock for local - no actual scraping)
app.post('/api/scraping/:districtId/:worker/:action', (req, res) => {
    const districtId = parseInt(req.params.districtId, 10);
    const worker = req.params.worker; // 'link' | 'data'
    const action = req.params.action; // 'start' | 'stop' | 'restart' | 'resume'
    const district = DISTRICT_BY_ID.get(districtId);

    if (!district || !['link', 'data'].includes(worker)) {
        return res.status(400).json({ success: false, error: 'Unknown district or worker kind' });
    }

    console.log(`[LOCAL] Scraping control request: ${district.name} / ${worker} / ${action} (IGNORED - local mode)`);

    // Mock response - just return current state
    try {
        const jobs = db.prepare(`
            SELECT * FROM scrape_jobs 
            WHERE district = ? AND worker_type = ?
            ORDER BY created_at DESC LIMIT 1
        `).all(district.name, worker);

        const lj = jobs.find(j => j.worker_type === 'link');
        const dj = jobs.find(j => j.worker_type === 'data');

        const linkCounts = db.prepare(`
            SELECT COUNT(*) as c FROM links WHERE district = ?
        `).get(district.name);

        const dataCounts = db.prepare(`
            SELECT COUNT(*) as c FROM basic_data WHERE district = ?
        `).get(district.name);

        const mapStatus = (s) => {
            switch (s) {
                case 'RUNNING': return 'running';
                case 'STOP_REQUESTED': return 'paused';
                case 'STOPPED': return 'stopped';
                case 'COMPLETED': return 'completed';
                case 'FAILED': return 'failed';
                default: return 'pending';
            }
        };

        const response = {
            district: district.name,
            districtId: district.id,
            linkStatus: mapStatus(lj?.status),
            dataStatus: mapStatus(dj?.status),
            linkProgress: {
                totalProjects: lj?.total || 0,
                projectsProcessed: lj?.processed || 0,
                linksFound: linkCounts?.c || 0,
                linksFailed: lj?.failed || 0,
            },
            dataProgress: {
                totalLinks: linkCounts?.c || 0,
                dataScraped: dataCounts?.c || 0,
                dataPending: Math.max((linkCounts?.c || 0) - (dataCounts?.c || 0), 0),
                dataFailed: dj?.failed || 0,
            },
            lastUpdated: new Date().toISOString(),
        };

        res.json(response);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Export endpoints (CSV)
app.get('/api/links/export', (req, res) => {
    try {
        const rows = db.prepare('SELECT * FROM links ORDER BY district, rera_id').all();
        const csv = objectsToCsv(rows);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="links-export.csv"');
        res.send(csv);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/basic-data/export', (req, res) => {
    try {
        const rows = db.prepare('SELECT * FROM basic_data ORDER BY district, rera_id').all();
        const csv = objectsToCsv(rows);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="basic-data-export.csv"');
        res.send(csv);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Helper: Convert objects to CSV
function objectsToCsv(rows) {
    if (!rows.length) return '';
    const headers = Object.keys(rows[0]);
    const escape = (v) => {
        if (v === null || v === undefined) return '';
        const s = String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.join(',')];
    for (const row of rows) {
        lines.push(headers.map((h) => escape(row[h])).join(','));
    }
    return lines.join('\n');
}

// ============================================================================
// Serve Frontend
// ============================================================================
app.use(express.static(path.join(__dirname, 'frontend/dist')));
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend/dist', 'index.html'));
});

// ============================================================================
// Start Server
// ============================================================================
const PORT = process.env.PORT || 5000;

initSchema();
importCSVData();

app.listen(PORT, () => {
    console.log(`\n╔═══════════════════════════════════════════════════════╗`);
    console.log(`║  🚀 LOCAL SERVER RUNNING                             ║`);
    console.log(`╠═══════════════════════════════════════════════════════╣`);
    console.log(`║  📍 URL: http://localhost:${PORT}                      ║`);
    console.log(`║  💾 Database: SQLite (local_database.db)             ║`);
    console.log(`║  📊 Mode: LOCAL DEVELOPMENT                          ║`);
    console.log(`╚═══════════════════════════════════════════════════════╝\n`);
    
    const stats = db.prepare(`
        SELECT 
            (SELECT COUNT(*) FROM links) as links,
            (SELECT COUNT(*) FROM basic_data) as basic_data,
            (SELECT COUNT(*) FROM scrape_jobs) as jobs
    `).get();
    
    console.log(`📈 Data loaded:`);
    console.log(`   - Links: ${stats.links}`);
    console.log(`   - Basic Data: ${stats.basic_data}`);
    console.log(`   - Jobs: ${stats.jobs}\n`);
});
