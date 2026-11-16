"""Check the components required to schedule and run the daily FX job."""

import json
from urllib.request import urlopen


if __name__ == "__main__":
    with urlopen("http://localhost:8080/api/v2/monitor/health", timeout=5) as response:
        health = json.load(response)
    for component in ("metadatabase", "scheduler", "dag_processor"):
        if (health.get(component) or {}).get("status") != "healthy":
            raise SystemExit(f"Airflow {component} is not healthy.")
