from datetime import date, datetime, timezone

import psycopg
import pytest

from pipeline.run import run
from pipeline.source import SourceResponse


def response(rate="58", body=None):
    return SourceResponse(
        "https://api.frankfurter.dev/v2/providers/ecb/rates",
        (
            body
            if body is not None
            else (
                '[{"date":"2026-10-30","base":"USD","quote":"PHP","rate":' + rate + "}]"
            ).encode()
        ),
        datetime.now(timezone.utc),
        200,
    )


def test_duplicate_runs_and_corrections_preserve_raw_provenance(database):
    fetch = lambda start, end: [response()]
    first = run(date(2026, 10, 30), date(2026, 11, 1), database, fetch=fetch)
    repeat = run(date(2026, 10, 30), date(2026, 11, 1), database, fetch=fetch)
    with psycopg.connect(database) as conn:
        assert (
            conn.execute("SELECT count(*) FROM analytics.fx_rates").fetchone()[0] == 1
        )
        assert conn.execute("SELECT count(*) FROM raw.responses").fetchone()[0] == 2
        assert str(conn.execute("SELECT run_id FROM analytics.fx_rates").fetchone()[0]) == first
        assert conn.execute(
            "SELECT published_count FROM ops.runs WHERE id=%s", (repeat,)
        ).fetchone()[0] == 0
    correction = run(
        date(2026, 10, 30),
        date(2026, 11, 1),
        database,
        fetch=lambda s, e: [response("59")],
    )
    with psycopg.connect(database) as conn:
        assert conn.execute("SELECT rate FROM analytics.fx_rates").fetchone()[0] == 59
        assert (
            str(conn.execute("SELECT run_id FROM analytics.fx_rates").fetchone()[0])
            == correction
        )
        assert (
            conn.execute(
                "SELECT count(*) FROM raw.observations WHERE run_id=%s", (first,)
            ).fetchone()[0]
            == 1
        )


def test_failed_check_keeps_last_published_rate(database):
    run(
        date(2026, 10, 30), date(2026, 11, 1), database, fetch=lambda s, e: [response()]
    )

    def fail(_):
        raise RuntimeError("simulated dbt failure")

    with pytest.raises(RuntimeError):
        run(
            date(2026, 10, 30),
            date(2026, 11, 1),
            database,
            fetch=lambda s, e: [response("60")],
            check=fail,
        )
    with psycopg.connect(database) as conn:
        assert conn.execute("SELECT rate FROM analytics.fx_rates").fetchone()[0] == 58
        assert (
            conn.execute(
                "SELECT count(*) FROM ops.runs WHERE status='failed'"
            ).fetchone()[0]
            == 1
        )


def test_invalid_source_body_is_retained(database):
    with pytest.raises(ValueError):
        run(
            date(2026, 10, 30),
            date(2026, 11, 1),
            database,
            fetch=lambda s, e: [response(body=b"broken")],
        )
    with psycopg.connect(database) as conn:
        assert (
            bytes(conn.execute("SELECT body FROM raw.responses").fetchone()[0])
            == b"broken"
        )
        assert (
            conn.execute("SELECT count(*) FROM analytics.fx_rates").fetchone()[0] == 0
        )


def test_dbt_rejects_candidate_after_requested_window(database, monkeypatch):
    monkeypatch.setattr(
        "pipeline.run.parse_rates",
        lambda *args, **kwargs: [(date(2026, 10, 30), 58), (date(2026, 11, 2), 59)],
    )
    with pytest.raises(RuntimeError, match="dbt checks failed"):
        run(date(2026, 10, 30), date(2026, 11, 1), database, fetch=lambda *args: [response()])
    with psycopg.connect(database) as conn:
        assert conn.execute("SELECT count(*) FROM analytics.fx_rates").fetchone()[0] == 0
