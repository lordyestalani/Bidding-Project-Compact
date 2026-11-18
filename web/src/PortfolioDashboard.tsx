import { useEffect, useState } from "react";
import { currency, request } from "./api";
import "./portfolio.css";

type Values = {
  reference_php: string | null;
  scenario_php: string | null;
  difference_php: string | null;
};

type Portfolio = {
  reference_rate: string | null;
  reference_date: string | null;
  reference_source: string | null;
  scenario_rate: string;
  incomplete_count: number;
  totals: Record<keyof Values, { php: string | null; projects: number }>;
  projects: (Values & {
    id: string;
    name: string;
    complete: boolean;
    net_usd: string | null;
  })[];
};

const summary = [
  ["reference_php", "Profit at reference rate"],
  ["scenario_php", "Profit at scenario rate"],
  ["difference_php", "Total FX impact"],
] as const;

function impact(value: string | null) {
  if (value === null) return "—";
  const display = currency(value);
  return Number(value) > 0 && display !== "PHP 0.00"
    ? display.replace("PHP ", "PHP +")
    : display;
}

export function usePortfolio(enabled: boolean, rate: string | null, revision: number) {
  const [data, setData] = useState<Portfolio | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const valid =
    rate === null ||
    (/^[0-9]{1,12}(\.[0-9]{1,8})?$/.test(rate) && Number(rate) > 0);

  useEffect(() => {
    if (!enabled || !valid) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const timer = setTimeout(
      async () => {
        try {
          const query =
            rate === null ? "" : `?rate=${encodeURIComponent(rate)}`;
          const value = await request<Portfolio>(`/portfolio${query}`, {
            signal: controller.signal,
          });
          if (!Array.isArray(value?.projects))
            throw new Error(
              "The server returned an unexpected portfolio response.",
            );
          if (!controller.signal.aborted) setData(value);
        } catch (reason) {
          if (!controller.signal.aborted) setError((reason as Error).message);
        } finally {
          if (!controller.signal.aborted) setLoading(false);
        }
      },
      rate === null ? 0 : 150,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [enabled, rate, valid, revision]);

  return { data, loading, error, valid };
}

export function PortfolioDashboard({
  portfolio: { data, loading, error, valid },
  rate,
  onRateChange,
  onOpenProject,
  onAddProject,
  onRetry,
  busy,
}: {
  portfolio: ReturnType<typeof usePortfolio>;
  rate: string | null;
  onRateChange: (rate: string | null) => void;
  onOpenProject: (id: string) => void;
  onAddProject: () => void;
  onRetry: () => void;
  busy: boolean;
}) {
  const loadError = error && (
    <div className="notice portfolio-error">
      <span role="status">
        {error}
        {data && " Showing the last available results."}
      </span>
      <button className="secondary" onClick={onRetry} disabled={!valid || loading}>
        Retry portfolio
      </button>
    </div>
  );
  if (!data) {
    return (
      loadError || <p className="muted" role="status">Loading portfolio…</p>
    );
  }
  if (!data.projects.length) {
    return (
      <>
        {loadError}
        <section className="panel empty-state">
          <h2>No active projects</h2>
          <p>Add a project with planned cash flows to see its FX impact here.</p>
          <button disabled={busy} onClick={onAddProject}>
            Add a project
          </button>
        </section>
      </>
    );
  }

  const base = Number(data.reference_rate ?? 55);
  const current = rate ?? data.scenario_rate;
  const sliderLimit = 999_999_999_999;
  const sliderRate = valid ? Math.min(Number(current), sliderLimit) : base;
  const min = Math.max(0.00000001, Math.min(base * 0.7, sliderRate));
  const max = Math.min(
    sliderLimit,
    Math.max(base * 1.3, sliderRate, min + 0.00000001),
  );
  const maxExposure = data.projects.reduce(
    (largest, project) => Math.max(largest, Math.abs(Number(project.net_usd))),
    0,
  );
  const scale = maxExposure * Math.max(base - min, max - base);

  return (
    <div className="portfolio">
      <section className="metrics-grid" aria-label="Portfolio totals">
        {summary.map(([key, label]) => (
          <div
            className={`metric-card ${key === "difference_php" ? "profit-card" : ""} ${data.totals[key].php?.startsWith("-") ? "is-loss" : ""}`}
            key={key}
          >
            <span className="metric-label">{label}</span>
            <strong className="metric-value">
              {key === "difference_php"
                ? impact(data.totals[key].php)
                : currency(data.totals[key].php)}
            </strong>
            <small>
              {data.totals[key].projects} of {data.projects.length} projects
            </small>
          </div>
        ))}
      </section>
      {data.totals.scenario_php.projects > data.totals.reference_php.projects && (
        <p className="notice">
          The scenario total includes more projects because their USD cash flows
          need a published reference rate. Total FX impact includes only projects
          valued at both rates.
        </p>
      )}
      <section
        className="panel portfolio-impact"
        aria-labelledby="portfolio-chart"
      >
        <h2 id="portfolio-chart">FX impact by project</h2>
        <p className="muted portfolio-caption">
          Change in estimated profit from the published reference rate.
          {data.reference_date && ` Observation: ${data.reference_date}.`}
        </p>
        <div className="portfolio-controls">
          <div className="rate-control">
            <div>
              <label htmlFor="portfolio-rate">Portfolio scenario rate</label>
              <div className="rate-input">
                <input
                  id="portfolio-rate"
                  inputMode="decimal"
                  value={current}
                  aria-invalid={!valid}
                  onChange={(event) => onRateChange(event.target.value)}
                />
                <span>PHP / USD</span>
              </div>
            </div>
            <button className="secondary" onClick={() => onRateChange(null)}>
              Reset
            </button>
          </div>
          <input
            aria-label="Portfolio exchange rate slider"
            className="slider"
            type="range"
            min={min}
            max={max}
            step="any"
            value={sliderRate}
            onChange={(event) =>
              onRateChange(Number(event.target.value).toFixed(8))
            }
          />
          <div className="slider-labels">
            <span>Weaker USD · {min.toFixed(2)}</span>
            <span>Stronger USD · {max.toFixed(2)}</span>
          </div>
        </div>
        {!data.reference_rate && (
          <p className="notice">
            No published reference rate is available. USD projects can still be
            valued at the scenario rate.
          </p>
        )}
        {!valid && (
          <p className="error" role="status">
            Enter a positive rate with up to 12 digits before and 8 after the
            decimal.
          </p>
        )}
        {loadError}
        <p className="portfolio-results-rate muted">
          Results at {data.scenario_rate} PHP/USD
          {valid && loading && <span role="status"> · Updating…</span>}
        </p>
        {data.reference_rate &&
          Number(data.scenario_rate) === base &&
          maxExposure > 0 && (
            <p className="fine-print portfolio-baseline">
              Move the slider to see which projects gain or lose estimated
              profit.
            </p>
          )}
        <div className="portfolio-axis" aria-hidden="true">
          <span>Lower profit</span>
          <span>Zero</span>
          <span>Higher profit</span>
        </div>
        <ul
          className="portfolio-bars"
          aria-label="Estimated profit changes by project"
        >
          {data.projects.map((project) => {
            const change = Number(project.difference_php);
            const width = scale
              ? Math.min(50, (Math.abs(change) / scale) * 50)
              : 0;
            return (
              <li key={project.id}>
                <button
                  className="portfolio-row"
                  disabled={busy}
                  onClick={() => onOpenProject(project.id)}
                >
                  <span className="portfolio-name">{project.name}</span>
                  <span className="portfolio-track" aria-hidden="true">
                    {change !== 0 && (
                      <span
                        className={change < 0 ? "loss-bar" : "gain-bar"}
                        style={{ width: `${width}%` }}
                      />
                    )}
                  </span>
                  <span
                    className={
                      change < 0
                        ? "negative"
                        : change > 0
                          ? "portfolio-gain"
                          : "muted"
                    }
                  >
                    {project.complete
                      ? project.difference_php === null
                        ? "No comparison"
                        : impact(project.difference_php)
                      : "Incomplete"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {data.incomplete_count > 0 && (
          <p className="fine-print">
            {data.incomplete_count}{" "}
            {data.incomplete_count === 1 ? "project is" : "projects are"}{" "}
            missing cash flows or amounts and excluded from the totals.
          </p>
        )}
      </section>
    </div>
  );
}
