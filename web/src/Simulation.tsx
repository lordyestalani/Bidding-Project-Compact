import { useEffect, useState } from "react";
import { currency, request, type ScenarioResult } from "./api";
import { ProfitChart } from "./ProfitChart";
import { DEFAULT_SCENARIO_RATE, RateControl, rateSlider } from "./RateControl";

export function Simulation({
  projectId,
  version,
  referenceRate,
  referenceDate,
  onReferenceChange,
}: {
  projectId: string;
  version: number;
  referenceRate: string | null;
  referenceDate?: string | null;
  onReferenceChange?: () => void;
}) {
  const initial = referenceRate ?? DEFAULT_SCENARIO_RATE;
  const [customRate, setCustomRate] = useState<string | null>(null);
  const rate = customRate ?? initial;
  const [result, setResult] = useState<ScenarioResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const slider = rateSlider(rate, referenceRate);
  const { valid } = slider;

  function updateRate(nextRate: string | null) {
    if ((nextRate ?? initial) !== rate) setResult(null);
    setCustomRate(nextRate);
  }

  useEffect(() => {
    const controller = new AbortController();
    setResult(null);
    setError("");
    setLoading(valid);
    if (!valid) return () => controller.abort();
    const timer = setTimeout(() => {
      request<ScenarioResult>(`/projects/${projectId}/scenario`, {
        method: "POST",
        body: JSON.stringify({ rate_php_per_usd: rate }),
        signal: controller.signal,
      })
        .then((value) => {
          if (!controller.signal.aborted) {
            if (value.project_version !== version)
              throw new Error(
                "Project changed. Reload it to simulate the saved cash flows.",
              );
            setResult(value);
          }
        })
        .catch((reason) => {
          if (!controller.signal.aborted) setError(reason.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [rate, projectId, version, valid, referenceRate]);

  return (
    <>
      <ProfitChart
        projectId={projectId}
        version={version}
        referenceRate={referenceRate}
        referenceDate={referenceDate}
        onReferenceChange={onReferenceChange}
        scenarioProfit={valid && result ? result.metrics.profit_php : null}
      />
      <section className="simulation" aria-labelledby="simulation-title">
        <div className="section-head">
          <h2 id="simulation-title">Exchange rate scenario</h2>
        </div>
        <RateControl rate={rate} slider={slider} onChange={updateRate} />
        {!referenceRate && (
          <p className="notice">
            No reference rate is available yet. This is a hypothetical rate you
            can change.
          </p>
        )}
        {!valid && (
          <p className="error" role="alert">
            Enter a positive rate with up to 8 decimal places.
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {valid && loading && (
          <p className="muted" role="status">
            Calculating scenario…
          </p>
        )}
        {valid && result && (
          <div className="scenario-results" aria-live="polite">
            <div>
              <span>Incoming at this rate</span>
              <strong>{currency(result.metrics.incoming_php)}</strong>
            </div>
            <div>
              <span>Outgoing at this rate</span>
              <strong>{currency(result.metrics.outgoing_php)}</strong>
            </div>
            <div>
              <span>Estimated profit</span>
              <strong
                data-testid="scenario-profit"
                className={
                  result.metrics.profit_php?.startsWith("-") ? "negative" : ""
                }
              >
                {currency(result.metrics.profit_php)}
              </strong>
            </div>
            <p className="scenario-difference">
              {result.difference_php === null
                ? "Reference comparison unavailable"
                : `${currency(result.difference_php)} change from the reference rate`}
              {!result.metrics.complete
                ? " · Add the missing amounts to complete this estimate."
                : ""}
            </p>
          </div>
        )}
        <p className="fine-print">
          Saved cash flows stay the same. Only the hypothetical exchange rate
          changes.
        </p>
      </section>
    </>
  );
}
