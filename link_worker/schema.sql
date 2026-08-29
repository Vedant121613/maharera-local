-- link_worker/schema.sql

CREATE TABLE IF NOT EXISTS scraping_jobs (
    id SERIAL PRIMARY KEY,
    district_name VARCHAR(100) NOT NULL,
    state_id INT NOT NULL DEFAULT 27,
    district_id INT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'pending', -- pending, running, paused, stopped, completed, failed
    total_pages_found INT DEFAULT 0,
    total_projects_reported INT DEFAULT 0,
    last_processed_page INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    last_error TEXT,
    CONSTRAINT unique_district_job UNIQUE (district_name)
);

CREATE TABLE IF NOT EXISTS project_links (
    id BIGSERIAL PRIMARY KEY,
    job_id INT REFERENCES scraping_jobs(id) ON DELETE CASCADE,
    district VARCHAR(100) NOT NULL,
    rera_id VARCHAR(100) NOT NULL,
    project_name TEXT,
    pincode VARCHAR(20),
    project_url TEXT NOT NULL,
    page_number INT,
    status VARCHAR(30) DEFAULT 'discovered', -- discovered, failed, retry_pending
    attempt_count INT DEFAULT 1,
    last_attempt_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_rera_per_district UNIQUE (district, rera_id)
);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON scraping_jobs(status);
CREATE INDEX IF NOT EXISTS idx_links_district ON project_links(district);
CREATE INDEX IF NOT EXISTS idx_links_rera_id ON project_links(rera_id);