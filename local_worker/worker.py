import os
import time
import threading
from dotenv import load_dotenv
from api_client import ScraperAPIClient
from link_scraper import run_link_scraper
from data_scraper import run_data_scraper

load_dotenv()

HEARTBEAT_INTERVAL = int(os.getenv("HEARTBEAT_INTERVAL", 10))
POLL_INTERVAL = int(os.getenv("POLL_INTERVAL", 5))

current_status = "ONLINE"
current_job_id = None
stop_heartbeat = False


def heartbeat_thread_func(api_client: ScraperAPIClient):
    global current_status, current_job_id, stop_heartbeat
    while not stop_heartbeat:
        api_client.send_heartbeat(status=current_status, current_job_id=current_job_id)
        time.sleep(HEARTBEAT_INTERVAL)


def main():
    global current_status, current_job_id, stop_heartbeat

    api_client = ScraperAPIClient()
    print("==================================================")
    print(" RERA Scraper Local Worker Agent Active ")
    print(f" Target Server: {os.getenv('SERVER_URL')}")
    print(" Listening for jobs from Coolify server...")
    print("==================================================")

    # Start background Heartbeat Thread
    t = threading.Thread(target=heartbeat_thread_func, args=(api_client,), daemon=True)
    t.start()

    try:
        while True:
            job = api_client.poll_job()

            if job:
                job_id = job["id"]
                job_type = job["job_type"]
                current_job_id = job_id
                current_status = "BUSY"

                print(f"\n[➔] CLAIMED JOB #{job_id} | Type: {job_type} | District: {job['district']}")

                try:
                    if job_type == "LINK_SCRAPER":
                        run_link_scraper(job, api_client)
                    elif job_type == "DATA_SCRAPER":
                        run_data_scraper(job, api_client)
                    else:
                        print(f"[!] Unknown job type: {job_type}")
                        api_client.update_job_progress(
                            job_id,
                            status="FAILED",
                            error_message=f"Unknown job type: {job_type}",
                        )
                except Exception as e:
                    print(f"[!] Error running job #{job_id}: {e}")
                    api_client.update_job_progress(
                        job_id, status="FAILED", error_message=str(e)
                    )

                current_status = "ONLINE"
                current_job_id = None
            else:
                time.sleep(POLL_INTERVAL)

    except KeyboardInterrupt:
        print("\n[*] Shutting down local worker gracefully...")
        stop_heartbeat = True
        api_client.send_heartbeat(status="OFFLINE", current_job_id=None)


if __name__ == "__main__":
    main()