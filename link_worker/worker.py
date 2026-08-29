import sys
import time
import signal
import logging
from config import Config
from database import Database
from scraper import fetch_page_with_retries, get_pagination_info, build_district_url, get_thread_session

logging.basicConfig(
    level=getattr(logging, Config.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("LinkWorker.Main")

RUNNING = True

def handle_shutdown(signum, frame):
    global RUNNING
    logger.info("Shutdown signal received. Finishing active tasks gracefully...")
    RUNNING = False

signal.signal(signal.SIGTERM, handle_shutdown)
signal.signal(signal.SIGINT, handle_shutdown)

def process_job(job: dict):
    job_id = job["id"]
    district = job["district_name"]
    state_id = job["state_id"]
    district_id = job["district_id"]
    start_page = job.get("last_processed_page", 0) + 1

    logger.info(f"Processing Job ID {job_id} for District '{district}' starting from page {start_page}...")

    # Establish pagination limits
    init_url = build_district_url(state_id, district_id, 1)
    session = get_thread_session(0)
    try:
        resp = session.get(init_url, timeout=(Config.CONNECT_TIMEOUT, Config.READ_TIMEOUT))
        total_pages, total_projects = get_pagination_info(resp.text)
    except Exception as e:
        logger.error(f"Failed to fetch initial metadata for district {district}: {e}")
        Database.complete_job(job_id, status="failed", error_msg=str(e))
        return

    logger.info(f"Job {job_id} [{district}]: Total Pages: {total_pages}, Total Expected Projects: {total_projects}")
    Database.update_job_progress(job_id, start_page - 1, total_pages, total_projects, status="running")

    for current_page in range(start_page, total_pages + 1):
        if not RUNNING:
            logger.info(f"Process interrupting. Saving checkpoint for job {job_id} at page {current_page - 1}.")
            Database.update_job_progress(job_id, current_page - 1, total_pages, total_projects, status="paused")
            return

        current_status = Database.check_job_status(job_id)
        if current_status in ["stopped", "paused"]:
            logger.info(f"Job {job_id} was set to '{current_status}' via DB. Exiting job loop gracefully.")
            return

        success, projects, err = fetch_page_with_retries(state_id, district_id, district, current_page)
        if success:
            inserted = Database.insert_project_links(job_id, district, projects)
            logger.info(f"Job {job_id} [{district}] Page {current_page}/{total_pages}: {len(projects)} found, {inserted} inserted.")
            Database.update_job_progress(job_id, current_page, total_pages, total_projects, status="running")
        else:
            logger.warning(f"Job {job_id} Page {current_page} failed after retries: {err}")

    Database.complete_job(job_id, status="completed")
    logger.info(f"Job {job_id} for District '{district}' completed successfully.")

def run_worker_loop():
    logger.info("Initializing Link Worker Service...")
    Database.initialize()
    
    # Auto-apply database migration schema
    try:
        Database.execute_schema("schema.sql")
    except Exception as e:
        logger.warning(f"Schema auto-execution skipped or failed: {e}")

    logger.info(f"Worker running. Polling loop active (Re-check interval: {Config.RECHECK_INTERVAL}s).")

    while RUNNING:
        try:
            job = Database.claim_next_job()
            if job:
                process_job(job)
            else:
                logger.debug("No pending jobs found. Idle waiting...")
                time.sleep(5)
        except Exception as e:
            logger.error(f"Unhandled error in worker loop: {e}", exc_info=True)
            time.sleep(Config.RETRY_DELAY)

if __name__ == "__main__":
    run_worker_loop()