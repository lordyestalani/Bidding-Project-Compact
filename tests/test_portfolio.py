from uuid import uuid4

from tests.test_profit_history import seed_rates


def create_project(client, name, lines, archived=False):
    project = client.post(
        "/api/projects", json={"name": name, "request_id": str(uuid4())}
    ).json()
    saved = client.put(
        f"/api/projects/{project['id']}",
        json={"name": name, "version": 1, "archived": archived, "lines": lines},
    )
    assert saved.status_code == 200, saved.text
    return saved.json()


def line(direction, currency, amount):
    return {
        "label": direction,
        "direction": direction,
        "currency": currency,
        "amount": amount,
    }


def test_portfolio_uses_opposite_fx_exposures_and_excludes_incomplete_projects(
    client, database
):
    today = seed_rates(database)
    income = create_project(client, "USD revenue", [line("incoming", "USD", "100")])
    cost = create_project(client, "USD expense", [line("outgoing", "USD", "40")])
    php = create_project(client, "PHP project", [line("incoming", "PHP", "700")])
    unknown = create_project(
        client, "Incomplete", [line("incoming", "USD", None)]
    )
    create_project(client, "Archived", [line("incoming", "PHP", "100")], archived=True)

    response = client.get("/api/portfolio", params={"rate": "60"})
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["reference_rate"] == "58.00000000"
    assert result["reference_date"] == today.isoformat()
    assert result["reference_source"] == income["fx"]["source"]
    assert result["incomplete_count"] == 1
    assert result["totals"] == {
        "reference_php": {"php": "4180.0000", "projects": 3},
        "scenario_php": {"php": "4300.0000", "projects": 3},
        "difference_php": {"php": "120.0000", "projects": 3},
    }
    assert {row["id"]: row["difference_php"] for row in result["projects"]} == {
        income["id"]: "200.0000",
        cost["id"]: "-80.0000",
        php["id"]: "0.0000",
        unknown["id"]: None,
    }
    assert client.get(f"/api/projects/{income['id']}").json() == income
    baseline = client.get("/api/portfolio").json()
    assert baseline["totals"]["difference_php"]["php"] == "0.0000"


def test_no_reference_rate_preserves_portfolio_coverage(client):
    create_project(client, "USD project", [line("incoming", "USD", "2")])
    create_project(client, "PHP project", [line("incoming", "PHP", "3")])
    result = client.get("/api/portfolio").json()
    assert result["reference_rate"] is None
    assert result["scenario_rate"] == "55"
    assert result["totals"] == {
        "reference_php": {"php": "3.0000", "projects": 1},
        "scenario_php": {"php": "113.0000", "projects": 2},
        "difference_php": {"php": "0.0000", "projects": 1},
    }
    assert client.get("/api/portfolio", params={"rate": "0"}).status_code == 422
