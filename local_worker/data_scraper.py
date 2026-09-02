import time
from api_client import ScraperAPIClient


def run_data_scraper(job, api_client: ScraperAPIClient):
    job_id = job["id"]
    district = job["district"]

    print(f"[*] Starting DATA_SCRAPER for District: {district}")

    processed_count = 0
    failed_count = 0

    while True:
        # Check Stop Request
        stop_requested = api_client.update_job_progress(
            job_id,
            processed_items=processed_count,
            failed_items=failed_count,
            status="RUNNING",
        )
        if stop_requested:
            print("[!] Stop request detected. Finishing execution...")
            api_client.update_job_progress(
                job_id,
                processed_items=processed_count,
                failed_items=failed_count,
                status="STOPPED",
            )
            return

        # Fetch batch of pending links from cloud PostgreSQL
        pending_links = api_client.fetch_pending_links(district, limit=10)
        if not pending_links:
            print("[*] No more pending links found for processing.")
            break

        batch_details = []
        for link in pending_links:
            reg_no = link["rera_reg_no"]
            print(f"[+] Scraping details for RERA No: {reg_no}")

            try:
                # SIMULATION OF DETAIL PARSING (Replace with actual Playwright/EasyOCR parser)
                detail_record = {
                    "rera_reg_no": reg_no,
                    "project_name": link["project_name"],
                    "promoter_name": f"Promoter Group {district}",
                    "district": district,
                    "address": f"Plot No {reg_no[-4:]}, Sector 10, {district}",
                    "proposed_completion_date": "2028-12-31",
                    "project_status": "Ongoing",
                    "total_area": "4500 sq.m",
                    "raw_data": {"extracted_via": "local_pc_worker"},
                }
                batch_details.append(detail_record)
                processed_count += 1
                time.sleep(0.5)
            except Exception as e:
                print(f"[!] Failed to parse {reg_no}: {e}")
                failed_count += 1

        if batch_details:
            api_client.upload_projects_bulk(batch_details)

    # Mark completed
    api_client.update_job_progress(
        job_id,
        processed_items=processed_count,
        failed_items=failed_count,
        status="COMPLETED",
    )
    print(f"[✔] DATA_SCRAPER Finished. Processed: {processed_count}, Failed: {failed_count}")