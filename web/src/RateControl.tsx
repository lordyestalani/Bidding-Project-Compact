export const DEFAULT_SCENARIO_RATE = "55";
const MAX_SLIDER_RATE = 999_999_999_999;
const MIN_SLIDER_RATE = 0.00000001;

export function isValidRate(rate: string) {
  return /^[0-9]{1,12}(\.[0-9]{1,8})?$/.test(rate) && Number(rate) > 0;
}

export function rateSlider(rate: string, referenceRate: string | null) {
  const anchor = Number(referenceRate ?? DEFAULT_SCENARIO_RATE);
  const valid = isValidRate(rate);
  const value = valid ? Math.min(Number(rate), MAX_SLIDER_RATE) : anchor;
  const min = Math.max(MIN_SLIDER_RATE, Math.min(anchor * 0.7, value));
  const max = Math.min(
    MAX_SLIDER_RATE,
    Math.max(anchor * 1.3, value, min + MIN_SLIDER_RATE),
  );
  return { anchor, valid, value, min, max };
}

export function RateControl({
  rate,
  slider,
  onChange,
  portfolio = false,
}: {
  rate: string;
  slider: ReturnType<typeof rateSlider>;
  onChange: (rate: string | null) => void;
  portfolio?: boolean;
}) {
  const id = portfolio ? "portfolio-rate" : "scenario-rate";
  return (
    <>
      <div className="rate-control">
        <div>
          <label htmlFor={id}>
            {portfolio ? "Portfolio scenario rate" : "Scenario rate"}
          </label>
          <div className="rate-input">
            <input
              id={id}
              inputMode="decimal"
              value={rate}
              aria-invalid={!slider.valid}
              onChange={(event) => onChange(event.target.value)}
            />
            <span>PHP / USD</span>
          </div>
        </div>
        <button className="secondary" onClick={() => onChange(null)}>
          Reset
        </button>
      </div>
      <input
        className="slider"
        type="range"
        aria-label={portfolio ? "Portfolio exchange rate slider" : "Exchange rate slider"}
        min={slider.min}
        max={slider.max}
        step="any"
        value={slider.value}
        onChange={(event) => onChange(Number(event.target.value).toFixed(8))}
      />
      <div className="slider-labels">
        <span>Weaker USD · {slider.min.toFixed(2)}</span>
        <span>Stronger USD · {slider.max.toFixed(2)}</span>
      </div>
    </>
  );
}
