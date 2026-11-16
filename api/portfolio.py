"""Read active projects from the existing cash-flow rollup."""

from decimal import Decimal, localcontext

from api import store
from api.valuation import metrics, money


def portfolio(conn, rate: Decimal | None):
    reference = store.latest_rate(conn)
    reference_rate = reference["rate"] if reference else None
    scenario_rate = rate or reference_rate or Decimal("55")
    budgets = conn.execute(
        """SELECT p.id, p.name, t.complete, t.in_php, t.in_usd, t.out_php, t.out_usd
           FROM analytics.project_totals t JOIN app.projects p ON p.id = t.project_id
           WHERE NOT p.archived ORDER BY p.created_at DESC, p.id"""
    ).fetchall()

    totals = {
        "reference_php": Decimal(0),
        "scenario_php": Decimal(0),
        "difference_php": Decimal(0),
    }
    counts = dict.fromkeys(totals, 0)
    projects = []
    with localcontext() as context:
        context.prec = 50
        for budget in budgets:
            project_id, name = budget.pop("id"), budget.pop("name")
            baseline = metrics(**budget, rate=reference_rate)["profit_php"]
            scenario_values = metrics(**budget, rate=scenario_rate)
            scenario = scenario_values["profit_php"]
            difference = (
                money(Decimal(scenario) - Decimal(baseline))
                if baseline is not None and scenario is not None
                else None
            )
            values = {
                "reference_php": baseline,
                "scenario_php": scenario,
                "difference_php": difference,
            }
            for key, value in values.items():
                if value is not None:
                    totals[key] += Decimal(value)
                    counts[key] += 1
            projects.append(
                {
                    "id": project_id,
                    "name": name,
                    "complete": budget["complete"],
                    "net_usd": scenario_values["net_usd"],
                    **values,
                }
            )

    return {
        "reference_rate": format(reference_rate, ".8f") if reference else None,
        "reference_date": reference["observation_date"] if reference else None,
        "scenario_rate": format(scenario_rate, "f"),
        "incomplete_count": sum(not project["complete"] for project in projects),
        "totals": {
            key: {"php": money(total) if counts[key] else None, "projects": counts[key]}
            for key, total in totals.items()
        },
        "projects": projects,
    }
