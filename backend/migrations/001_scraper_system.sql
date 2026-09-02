-- Migration: Scraper System Architecture
-- Description: Schema for job queueing, local worker orchestration, and RERA data storage

BEGIN;

-- 1. Worker Node Status
CREATE TABLE IF NOT EXISTS worker_nodes (
    worker_id VARCHAR(64) PRIMARY KEY,
    hostname VARCHAR(255) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'OFFLINE', -- 'ONLINE', 'BUSY', 'OFFLINE'
    current_job_id INT,
    last_heartbeat TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Scraper Job Queue
CREATE TABLE IF NOT EXISTS scraping_jobs (
    id SERIAL PRIMARY KEY,
    job_type VARCHAR(50) NOT NULL, -- 'LINK_SCRAPER', 'DATA_SCRAPER'
    district VARCHAR(100) NOT NULL,
    start_page INT DEFAULT 1,
    end_page INT DEFAULT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'RUNNING', 'COMPLETED', 'STOP_REQUESTED', 'STOPPED', 'FAILED'
    assigned_worker_id VARCHAR(64) REFERENCES worker_nodes(worker_id) ON DELETE SET NULL,
    total_items INT DEFAULT 0,
    processed_items INT DEFAULT 0,
    failed_items INT DEFAULT 0,
    error_message TEXT,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for efficient polling
CREATE INDEX IF NOT EXISTS idx_scraping_jobs_status ON scraping_jobs(status);

-- 3. Extracted RERA Links Table
CREATE TABLE IF NOT EXISTS rera_links (
    id SERIAL PRIMARY KEY,
    rera_reg_no VARCHAR(100) UNIQUE NOT NULL,
    project_name VARCHAR(255) NOT NULL,
    district VARCHAR(100) NOT NULL,
    detail_url TEXT NOT NULL,
    status VARCHAR(30) DEFAULT 'PENDING', -- 'PENDING', 'PROCESSED', 'FAILED'
    scraped_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_rera_links_district_status ON rera_links(district, status);

-- 4. Extracted RERA Project Details Table
CREATE TABLE IF NOT EXISTS rera_projects (
    id SERIAL PRIMARY KEY,
    rera_reg_no VARCHAR(100) UNIQUE NOT NULL,
    project_name VARCHAR(255) NOT NULL,
    promoter_name VARCHAR(255),
    district VARCHAR(100) NOT NULL,
    address TEXT,
    proposed_completion_date VARCHAR(50),
    project_status VARCHAR(50),
    total_area VARCHAR(100),
    raw_data JSONB,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_rera_projects_district ON rera_projects(district);

COMMIT;