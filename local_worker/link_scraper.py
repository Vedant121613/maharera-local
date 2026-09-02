import time
from api_client import ScraperAPIClient


def run_link_scraper(job, api_client: ScraperAPIClient):
    job_id = job["id"]
    district = job["district"]
    start_page = job.get("start_page") or 1
    end_page = job.get("end_page") or 10

    print(f"[*] Starting LINK_SCRAPER for District: {district} (Pages {start_page} to {end_page})")

    batch = []
    processed_count = 0
    batch_size = 20

    # SIMULATION OF SCRAPING LOOP (Replace with actual Playwright/Selenium logic)
    for page in range(start_page, end_page + 1):
        print(f"[+] Scraping page {page}...")

        # 1. Check for Stop Request from Server UI
        stop_requested = api_client.update_job_progress(
            job_id,
            processed_items=processed_count,
            total_items=(end_page - start_page + 1) * 10,
            status="RUNNING",
        )
        if stop_requested:
            print("[!] Stop request received from server. Halting scraper cleanly...")
            if batch:
                api_client.upload_links_bulk(batch)
            api_client.update_job_progress(
                job_id,
                processed_items=processed_count,
                status="STOPPED",
            )
            return

        # 2. Extract Data Items
        for i in range(1, 11):
            reg_no = f"P521000{page:02d}{i:02d}"
            item = {
                "rera_reg_no": reg_no,
                "project_name": f"Sample Project {reg_no}",
                "district": district,
                "detail_url": f"https://maharera.mahaonline.gov.in/projects/{reg_no}",
            }
            batch.append(item)
            processed_count += 1

            # 3. Stream Data Batch to Cloud Server when size limit hit
            if len(batch) >= batch_size:
                api_client.upload_links_bulk(batch)
                batch.clear()

        time.sleep(1)  # Simulate network page delay

    # Flush remaining items
    if batch:
        api_client.upload_links_bulk(batch)

    # Mark completed
    api_client.update_job_progress(
        job_id,
        processed_items=processed_count,
        total_items=processed_count,
        status="COMPLETED",
    )
    print(f"[✔] LINK_SCRAPER Completed successfully. Total extracted: {processed_count}")