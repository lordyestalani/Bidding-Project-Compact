# Verification

Run `./Test.ps1 -Browser` from the repository root with Docker and Node.js 24.
The script builds the current API and frontend images and runs Chromium against
the isolated `bidding_simple_test` database. [GitHub Actions](../.github/workflows/test.yml)
runs the same command and also audits production npm dependencies.

## Latest local run

| Check | Result on 2026-11-18 |
| --- | --- |
| Python, API, PostgreSQL and dbt tests | 45 passed |
| React component tests | 25 passed |
| TypeScript check and Vite production build | Passed |
| Chromium browser journeys | 2 passed |
| Nginx proxy after replacing the API container with a new IP | Recovered without reloading Nginx |
| Production npm audit | 0 vulnerabilities |

## Coverage

- API and dbt integration tests check project saves, reporting values, source
  validation, and atomic rate publication against PostgreSQL. A real dbt check
  rejects a candidate outside the requested dates.
- Pipeline tests cover an empty range falling back to the preceding observation,
  a valid range publishing without a fallback request, and the next run recovering
  an interrupted run without losing the previously published rate.
- Portfolio tests cover opposing USD exposure, exact sub-cent totals, and
  coverage when the reference rate is unavailable. Frontend tests check that the
  dashboard uses one FX snapshot, can retry after a failed load, and preserves
  custom scenario rates across refreshes.
- Browser tests cover creating and editing cash flows, moving the simulated line
  on the chart, archiving and restoring projects, and opening project details from
  the portfolio on mobile with the heading in view and focused.

## Development dependencies

The 2026-11-18 npm audit reported one high-severity `picomatch` advisory through
six development dependency entries. The latest published `picomatch` release
was `4.0.7`, which is affected. The Vite development server binds to loopback by
default. The deployed frontend is static files served by Nginx, and
`npm audit --omit=dev` reported zero vulnerabilities. [GitHub advisory](https://github.com/advisories/GHSA-fc5q-39xc-vjpf)

## Initial rebuild checks

On 2026-11-02, local verification also covered first startup, volume persistence
across stop and restart, idempotent sample loading, a live Frankfurter backfill,
and successful execution of the Airflow DAG. These were point-in-time checks.
