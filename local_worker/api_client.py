import os
import socket
import requests
from dotenv import load_dotenv

load_dotenv()

SERVER_URL = os.getenv("SERVER_URL", "http://localhost:5000").rstrip("/")
WORKER_AUTH_TOKEN = os.getenv("WORKER_AUTH_TOKEN", "rera-local-worker-secret-key")
WORKER_ID = os.getenv("WORKER_ID", "windows-local-pc-01")
HOSTNAME = socket.gethostname()


class ScraperAPIClient:
    def __init__(self):
        self.headers = {
            "Content-Type": "application/json",
            "x-worker-auth-token": WORKER_AUTH_TOKEN,
        }

    def send_heartbeat(self, status="ONLINE", current_job_id=None):
        url = f"{SERVER_URL}/api/worker/heartbeat"
        payload = {
            "worker_id": WORKER_ID,
            "hostname": HOSTNAME,
            "status": status,
            "current_job_id": current_job_id,
        }
        try:
            res = requests.post(url, json=payload, headers=self.headers, timeout=10)
            return res.json().get("success", False)
        except Exception as e:
            print(f"[API Error] Heartbeat failed: {e}")
            return False

    def poll_job(self):
        url = f"{SERVER_URL}/api/worker/jobs/poll"
        params = {"worker_id": WORKER_ID}
        try:
            res = requests.get(
                url, params=params, headers=self.headers, timeout=10
            )
            data = res.json()
            if data.get("success"):
                return data.get("job")
            return None
        except Exception as e:
            print(f"[API Error] Job poll failed: {e}")
            return None

    def update_job_progress(
        self,
        job_id,
        processed_items=0,
        total_items=0,
        failed_items=0,
        status="RUNNING",
        error_message=None,
    ):
        url = f"{SERVER_URL}/api/worker/jobs/{job_id}/progress"
        payload = {
            "processed_items": processed_items,
            "total_items": total_items,
            "failed_items": failed_items,
            "status": status,
            "error_message": error_message,
        }
        try:
            res = requests.post(url, json=payload, headers=self.headers, timeout=10)
            data = res.json()
            return data.get("stop_requested", False)
        except Exception as e:
            print(f"[API Error] Progress update failed: {e}")
            return False

    def upload_links_bulk(self, links):
        url = f"{SERVER_URL}/api/worker/data/links/bulk"
        try:
            res = requests.post(
                url, json={"links": links}, headers=self.headers, timeout=30
            )
            return res.json().get("success", False)
        except Exception as e:
            print(f"[API Error] Links bulk upload failed: {e}")
            return False

    def upload_projects_bulk(self, projects):
        url = f"{SERVER_URL}/api/worker/data/projects/bulk"
        try:
            res = requests.post(
                url,
                json={"projects": projects},
                headers=self.headers,
                timeout=30,
            )
            return res.json().get("success", False)
        except Exception as e:
            print(f"[API Error] Projects bulk upload failed: {e}")
            return False

    def fetch_pending_links(self, district, limit=50):
        url = f"{SERVER_URL}/api/worker/data/links/pending"
        params = {"district": district, "limit": limit}
        try:
            res = requests.get(
                url, params=params, headers=self.headers, timeout=10
            )
            data = res.json()
            if data.get("success"):
                return data.get("links", [])
            return []
        except Exception as e:
            print(f"[API Error] Fetch pending links failed: {e}")
            return []