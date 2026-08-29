import logging
from contextlib import contextmanager
from typing import Optional, Dict, List, Any
import psycopg2
from psycopg2.extras import RealDictCursor
from psycopg2.pool import ThreadedConnectionPool
from config import Config

logger = logging.getLogger("LinkWorker.Database")

class Database:
    _pool: Optional[ThreadedConnectionPool] = None

    @classmethod
    def initialize(cls):
        if cls._pool is None:
            cls._pool = ThreadedConnectionPool(
                minconn=1,
                maxconn=Config.PRIMARY_MAX_WORKERS + 2,
                host=Config.DB_HOST,
                port=Config.DB_PORT,
                dbname=Config.DB_NAME,
                user=Config.DB_USER,
                password=Config.DB_PASSWORD
            )
            logger.info("Database connection pool initialized successfully.")

    @classmethod
    @contextmanager
    def get_connection(cls):
        if cls._pool is None:
            cls.initialize()
        conn = cls._pool.getconn()
        try:
            yield conn
        finally:
            cls._pool.putconn(conn)

    @classmethod
    def execute_schema(cls, schema_path: str):
        with open(schema_path, "r", encoding="utf-8") as f:
            sql = f.read()
        with cls.get_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(sql)
            conn.commit()
        logger.info("Database schema applied.")

    @classmethod
    def claim_next_job(cls) -> Optional[Dict[str, Any]]:
        query = """
        UPDATE scraping_jobs
        SET status = 'running',
            started_at = NOW(),
            updated_at = NOW()
        WHERE id = (
            SELECT id FROM scraping_jobs
            WHERE status = 'pending'
            ORDER BY created_at ASC
            FOR UPDATE SKIP LOCKED
            LIMIT 1
        )
        RETURNING id, district_name, state_id, district_id, last_processed_page, status;
        """
        with cls.get_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(query)
                job = cursor.fetchone()
                conn.commit()
                return dict(job) if job else None

    @classmethod
    def check_job_status(cls, job_id: int) -> str:
        query = "SELECT status FROM scraping_jobs WHERE id = %s;"
        with cls.get_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(query, (job_id,))
                res = cursor.fetchone()
                return res[0] if res else "stopped"

    @classmethod
    def update_job_progress(cls, job_id: int, current_page: int, total_pages: int, total_projects: int, status: str = "running"):
        query = """
        UPDATE scraping_jobs
        SET last_processed_page = %s,
            total_pages_found = %s,
            total_projects_reported = %s,
            status = %s,
            updated_at = NOW()
        WHERE id = %s;
        """
        with cls.get_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(query, (current_page, total_pages, total_projects, status, job_id))
            conn.commit()

    @classmethod
    def complete_job(cls, job_id: int, status: str = "completed", error_msg: Optional[str] = None):
        query = """
        UPDATE scraping_jobs
        SET status = %s,
            completed_at = CASE WHEN %s = 'completed' THEN NOW() ELSE NULL END,
            last_error = %s,
            updated_at = NOW()
        WHERE id = %s;
        """
        with cls.get_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(query, (status, status, error_msg, job_id))
            conn.commit()

    @classmethod
    def insert_project_links(cls, job_id: int, district: str, projects: List[Dict[str, Any]]) -> int:
        if not projects:
            return 0
        
        query = """
        INSERT INTO project_links 
        (job_id, district, rera_id, project_name, pincode, project_url, page_number, status, attempt_count, last_attempt_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s, 'discovered', 1, NOW())
        ON CONFLICT (district, rera_id) 
        DO UPDATE SET 
            project_name = EXCLUDED.project_name,
            pincode = EXCLUDED.pincode,
            project_url = EXCLUDED.project_url,
            updated_at = NOW()
        RETURNING id;
        """
        inserted_count = 0
        with cls.get_connection() as conn:
            with conn.cursor() as cursor:
                for p in projects:
                    rera_id = p.get("RERA ID", "N/A")
                    if rera_id == "N/A" or not rera_id:
                        continue
                    cursor.execute(query, (
                        job_id,
                        district,
                        rera_id,
                        p.get("Project Name", "N/A"),
                        p.get("Pincode", "N/A"),
                        p.get("View Details URL", "N/A"),
                        p.get("Page Number", 0)
                    ))
                    if cursor.fetchone():
                        inserted_count += 1
            conn.commit()
        return inserted_count