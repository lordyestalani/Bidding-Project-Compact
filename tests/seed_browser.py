"""Seed an explicitly isolated browser test DB; never publish fake app rates."""

import os
from datetime import datetime, timedelta
from urllib.parse import urlparse
from uuid import uuid4
from zoneinfo import ZoneInfo

import psycopg
from pipeline.run import ROOT, dbt

url = os.environ["TEST_DATABASE_URL"]
if urlparse(url).path != "/bidding_simple_test":
    raise RuntimeError("Browser seed only supports bidding_simple_test.")
last_day = datetime.now(ZoneInfo("Asia/Manila")).date() - timedelta(days=1)
first_day = last_day - timedelta(days=2)
with psycopg.connect(url) as conn:
    conn.execute((ROOT / "db/schema.sql").read_text())
    run_id, response_id = uuid4(), uuid4()
    conn.execute(
        "INSERT INTO ops.runs(id,start_date,end_date,status) VALUES(%s,%s,%s,'success')",
        (run_id, first_day, last_day),
    )
    conn.execute(
        "INSERT INTO raw.responses(id,run_id,url,fetched_at,status_code,checksum,body) VALUES(%s,%s,'OFFLINE SYNTHETIC BROWSER TEST',now(),200,'synthetic','synthetic')",
        (response_id, run_id),
    )
    for observed, rate in [
        (first_day, "45"),
        (last_day - timedelta(days=1), "58"),
        (last_day, "55"),
    ]:
        conn.execute(
            "INSERT INTO analytics.fx_rates(observation_date,rate,run_id,response_id,fetched_at,source) VALUES(%s,%s,%s,%s,now(),'OFFLINE SYNTHETIC BROWSER TEST') ON CONFLICT(observation_date) DO UPDATE SET rate=excluded.rate,source='OFFLINE SYNTHETIC BROWSER TEST'",
            (observed, rate, run_id, response_id),
        )
dbt(["run", "--select", "project_totals", "project_estimates"], url)
