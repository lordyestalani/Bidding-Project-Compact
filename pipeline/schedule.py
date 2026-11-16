from datetime import datetime, timedelta
from zoneinfo import ZoneInfo


def daily_fx_window(interval_end: datetime):
    end = interval_end.astimezone(ZoneInfo("Asia/Manila")).date() - timedelta(days=1)
    return end - timedelta(days=89), end
