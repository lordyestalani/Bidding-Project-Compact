from datetime import date, datetime, timezone
from io import BytesIO
from unittest.mock import MagicMock
from urllib.error import HTTPError

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
    fetch = lambda start, end: response()
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
        fetch=lambda s, e: response("59"),
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
        date(2026, 10, 30), date(2026, 11, 1), database, fetch=lambda s, e: response()
    )

    def fail(_):
        raise RuntimeError("simulated dbt failure")

    with pytest.raises(RuntimeError):
        run(
            date(2026, 10, 30),
            date(2026, 11, 1),
            database,
            fetch=lambda s, e: response("60"),
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
            fetch=lambda s, e: response(body=b"broken"),
        )
    with psycopg.connect(database) as conn:
        assert (
            bytes(conn.execute("SELECT body FROM raw.responses").fetchone()[0])
            == b"broken"
        )
        assert (
            conn.execute("SELECT count(*) FROM analytics.fx_rates").fetchone()[0] == 0
        )


@pytest.mark.parametrize("range_has_rate", [False, True])
def test_ingestion_requests_anchor_only_for_an_empty_range(database, monkeypatch, range_has_rate):
    start, end = date(2026, 10, 29), date(2026, 11, 1)
    requests = []

    def open_source(request, timeout):
        url = request.full_url
        requests.append(url)
        if "/rate/" in url and range_has_rate:
            raise HTTPError(url, 503, "Unavailable", {}, BytesIO(b"source unavailable"))
        if "/rate/" in url:
            body = b'{"date":"2026-10-28","base":"USD","quote":"PHP","rate":58}'
        else:
            body = response().body if range_has_rate else b"[]"
        connection = MagicMock()
        connection.__enter__.return_value.status = 200
        connection.__enter__.return_value.read.return_value = body
        return connection

    monkeypatch.setattr("pipeline.source.urlopen", open_source)
    run(start, end, database, check=lambda _: None)
    with psycopg.connect(database) as conn:
        observation = conn.execute("SELECT observation_date FROM analytics.fx_rates").fetchone()[0]
        retained = conn.execute("SELECT count(*) FROM raw.responses").fetchone()[0]
    assert observation == date(2026, 10, 30 if range_has_rate else 28)
    assert retained == len(requests) == (1 if range_has_rate else 2)


def test_dbt_rejects_candidate_after_requested_window(database, monkeypatch):
    monkeypatch.setattr(
        "pipeline.run.parse_rates",
        lambda *args, **kwargs: [(date(2026, 10, 30), 58), (date(2026, 11, 2), 59)],
    )
    with pytest.raises(RuntimeError, match="dbt checks failed"):
        run(date(2026, 10, 30), date(2026, 11, 1), database, fetch=lambda *args: response())
    with psycopg.connect(database) as conn:
        assert conn.execute("SELECT count(*) FROM analytics.fx_rates").fetchone()[0] == 0
