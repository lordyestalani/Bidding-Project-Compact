from datetime import date, datetime, timedelta, timezone

from pipeline.schedule import daily_fx_window


def test_schedule_refills_90_completed_manila_days_after_downtime():
    _, last_before_downtime = daily_fx_window(
        datetime(2026, 10, 31, 20, 0, tzinfo=timezone.utc)
    )
    start, end = daily_fx_window(datetime(2026, 11, 16, 0, 0, tzinfo=timezone.utc))

    assert last_before_downtime == date(2026, 10, 31)
    assert end == date(2026, 11, 15)
    assert (end - start).days == 89
    assert start <= last_before_downtime + timedelta(days=1) <= end
