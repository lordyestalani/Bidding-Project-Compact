"""Revalue today's budget at published historical rates; never reconstruct facts."""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from api import store
from api.valuation import metrics


def profit_history(conn, project_id, days: int):
    version, totals = store.version_and_totals(conn, project_id)
    reference = store.latest_rate(conn)
    today = datetime.now(ZoneInfo("Asia/Manila")).date()
    start = today - timedelta(days=days - 1)
    rates = (
        conn.execute(
            "SELECT observation_date,rate FROM analytics.fx_rates WHERE observation_date BETWEEN %s AND %s ORDER BY observation_date",
            (start, today),
        ).fetchall()
        if totals["complete"]
        else []
    )
    return {
        "project_version": version,
        "basis": "current_cash_flows",
        "complete": totals["complete"],
        "from_date": start,
        "to_date": today,
        "reference_rate": format(reference["rate"], ".8f") if reference else None,
        "reference_date": reference["observation_date"] if reference else None,
        "points": [
            {
                "observation_date": row["observation_date"],
                "rate": format(row["rate"], ".8f"),
                "profit_php": metrics(**totals, rate=row["rate"])["profit_php"],
            }
            for row in rates
        ],
    }
