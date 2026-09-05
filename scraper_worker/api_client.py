import os
import time
import requests

API_BASE_URL = os.getenv("API_BASE_URL", "").rstrip("/")
WORKER_TOKEN = os.getenv("WORKER_TOKEN", "")

_session = requests.Session()
_session.headers.update({
    "Authorization": f"Bearer {WORKER_TOKEN}",
    "Content-Type": "application/json",
})


def _request(method, path, **kwargs):
    url = f"{API_BASE_URL}{path}"
    for attempt in range(1, 4):
        try:
            resp = _session.request(method, url, timeout=30, **kwargs)
            resp.raise_for_status()
            return resp.json()
        except Exception as e:
            if attempt == 3:
                raise
            print(f"[api_client] {method} {path} failed (attempt {attempt}): {e}. Retrying...")
            time.sleep(3 * attempt)


def heartbeat():
    return _request("POST", "/api/worker/heartbeat")


def get_next_job(job_type=None):
    params = {"type": job_type} if job_type else None
    data = _request("GET", "/api/worker/jobs/next", params=params)
    return data.get("data")


def get_job(job_id):
    data = _request("GET", f"/api/worker/jobs/{job_id}")
    return data.get("data")


def post_progress(job_id, processed=None, total=None, found=None, failed=None):
    payload = {"processed": processed, "total": total, "found": found, "failed": failed}
    return _request("POST", f"/api/worker/jobs/{job_id}/progress", json=payload)


def post_complete(job_id, status, error=None):
    return _request("POST", f"/api/worker/jobs/{job_id}/complete", json={"status": status, "error": error})


def post_links(district, rows, batch_size=500):
    total_inserted = 0
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i + batch_size]
        data = _request("POST", "/api/worker/links", json={"district": district, "rows": batch})
        total_inserted += data.get("data", {}).get("inserted", 0)
    return total_inserted


def get_links_for_district(district):
    data = _request("GET", "/api/worker/links", params={"district": district})
    return data.get("data", [])


def post_basic_data(rows, batch_size=200):
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i + batch_size]
        _request("POST", "/api/worker/basic-data", json={"rows": batch})


def post_certificate(district, rera_id, pdf_base64=None, status=None):
    payload = {"district": district, "reraId": rera_id}
    if pdf_base64:
        payload["pdfBase64"] = pdf_base64
    else:
        payload["status"] = status or "FAILED"
    return _request("POST", "/api/worker/certificates", json=payload)