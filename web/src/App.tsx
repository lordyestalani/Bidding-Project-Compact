import { useCallback, useEffect, useRef, useState } from "react";
import {
  currency,
  request,
  type FX,
  type Project,
  type ProjectRow,
} from "./api";
import { ProjectEditor } from "./ProjectEditor";
import { PortfolioDashboard, usePortfolio } from "./PortfolioDashboard";
import { Simulation } from "./Simulation";

const manilaDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Manila",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function observationAge(observed: string) {
  const { year, month, day } = Object.fromEntries(
    manilaDate
      .formatToParts(Date.now())
      .map(({ type, value }) => [type, value]),
  );
  return (
    (Date.parse(`${year}-${month}-${day}T00:00:00Z`) -
      Date.parse(`${observed}T00:00:00Z`)) /
    86_400_000
  );
}

export function App() {
  const [rows, setRows] = useState<ProjectRow[]>([]),
    [project, setProject] = useState<Project | null>(null),
    [workspaceFx, setWorkspaceFx] = useState<FX | null>(null);
  const [search, setSearch] = useState(""),
    [archived, setArchived] = useState(false),
    [name, setName] = useState(""),
    [creating, setCreating] = useState(false),
    [editing, setEditing] = useState(false);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  const [listVersion, setListVersion] = useState(0);
  const [portfolioRate, setPortfolioRate] = useState<string | null>(null);
  const [portfolioRevision, setPortfolioRevision] = useState(0);
  const portfolio = usePortfolio(!project, portfolioRate, portfolioRevision);
  const fx = project?.fx ?? {
    rate: portfolio.data?.reference_rate,
    observation_date: portfolio.data?.reference_date,
    source: portfolio.data?.reference_source,
  };
  const dirty = useRef(false),
    ticket = useRef(0),
    createKey = useRef(crypto.randomUUID());
  const onDirty = useCallback((value: boolean) => {
    dirty.current = value;
  }, []);
  const canLeave = () =>
    !dirty.current || window.confirm("Discard unsaved project changes?");
  useEffect(() => {
    let active = true;
    setLoading(true);
    request<ProjectRow[]>(`/projects?archived=${archived}`)
      .then((value) => {
        if (active) setRows(value);
      })
      .catch((reason) => {
        if (active) setError(reason.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [archived, listVersion]);
  useEffect(() => {
    let active = true;
    let pending = false;
    const controller = new AbortController();
    async function refreshFx(initial = false) {
      if (pending) return;
      pending = true;
      try {
        const value = await request<FX>("/fx", { signal: controller.signal });
        if (active) setWorkspaceFx(value);
      } catch (reason) {
        if (active && initial) setError((reason as Error).message);
      } finally {
        pending = false;
      }
    }
    void refreshFx(true);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        setPortfolioRevision((revision) => revision + 1);
        void refreshFx();
      }
    }, 60_000);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(timer);
    };
  }, []);
  async function open(id: string) {
    if (busy || !canLeave()) return;
    const current = ++ticket.current;
    setError("");
    setBusy(true);
    try {
      const value = await request<Project>(`/projects/${id}`);
      if (current === ticket.current) {
        setProject(value);
        setEditing(false);
        dirty.current = false;
      }
    } catch (reason) {
      if (current === ticket.current) setError((reason as Error).message);
    } finally {
      if (current === ticket.current) setBusy(false);
    }
  }
  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !canLeave()) return;
    setBusy(true);
    setError("");
    try {
      const value = await request<Project>("/projects", {
        method: "POST",
        body: JSON.stringify({ name, request_id: createKey.current }),
      });
      setProject(value);
      setName("");
      setCreating(false);
      createKey.current = crypto.randomUUID();
      dirty.current = false;
      setEditing(true);
      setListVersion((value) => value + 1);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function saved(value: Project) {
    setProject(value);
    setEditing(false);
    dirty.current = false;
    setListVersion((current) => current + 1);
  }
  async function archive() {
    if (!project || busy) return;
    setBusy(true);
    setError("");
    try {
      const { id, metrics, fx, ...body } = project;
      const value = await request<Project>(`/projects/${id}`, {
        method: "PUT",
        body: JSON.stringify({ ...body, archived: !project.archived }),
      });
      saved(value);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const rateAge = fx?.observation_date
    ? observationAge(fx.observation_date)
    : 0;
  const projectRun = project?.fx.last_run;
  const workspaceRun = workspaceFx?.last_run;
  const lastRun =
    workspaceRun &&
    (!projectRun || workspaceRun.started_at >= projectRun.started_at)
      ? workspaceRun
      : projectRun;
  const filtered = rows.filter((row) =>
    `${row.name} ${row.customer}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <a
          className="brand"
          href="/"
          aria-label="Bidding and FX home"
          onClick={(event) => {
            if (
              event.metaKey ||
              event.ctrlKey ||
              event.shiftKey ||
              event.altKey
            )
              return;
            event.preventDefault();
            if (busy || !canLeave()) return;
            setProject(null);
            setEditing(false);
            setError("");
            document.getElementById("main")?.focus();
          }}
        >
          <span className="brand-icon" aria-hidden="true">
            ↗
          </span>
          <span>
            Bidding <span className="brand-light">&</span> FX
          </span>
        </a>
        <span className="workspace-tag">
          <span className="dot" aria-hidden="true" /> Local workspace
        </span>
      </header>
      <div className="app-layout">
        <aside className="sidebar" aria-label="Projects">
          <div className="section-head">
            <h2>
              Projects <span className="count">{rows.length}</span>
            </h2>
            <button
              aria-label="Add project"
              className="add-icon"
              onClick={() => setCreating(!creating)}
            >
              +
            </button>
          </div>
          {creating && (
            <form className="create-form" onSubmit={create}>
              <label htmlFor="new-name">New project name</label>
              <input
                id="new-name"
                autoFocus
                required
                maxLength={200}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  createKey.current = crypto.randomUUID();
                }}
              />
              <button disabled={busy}>Create project</button>
            </form>
          )}
          <input
            className="search"
            aria-label="Search projects"
            placeholder="Search projects…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <label className="archive-filter">
            <input
              type="checkbox"
              checked={archived}
              onChange={(e) => setArchived(e.target.checked)}
            />{" "}
            Show archived projects
          </label>
          {loading ? (
            <p className="muted" role="status">
              Loading projects…
            </p>
          ) : (
            <div className="project-list">
              {filtered.map((row) => (
                <button
                  className={`project-row ${project?.id === row.id ? "selected" : ""}`}
                  key={row.id}
                  disabled={busy}
                  aria-current={project?.id === row.id ? "true" : undefined}
                  onClick={() => void open(row.id)}
                >
                  <span className="project-symbol" aria-hidden="true">
                    {row.name.match(/[\p{L}\p{N}]/u)?.[0].toUpperCase() ?? "•"}
                  </span>
                  <span>
                    <strong>{row.name}</strong>
                    {row.customer && <small>{row.customer}</small>}
                  </span>
                  <span className="row-arrow" aria-hidden="true">
                    ›
                  </span>
                </button>
              ))}
              {!filtered.length && (
                <p className="muted sidebar-empty">
                  {search
                    ? "No matching projects."
                    : archived
                      ? "No archived projects."
                      : "No projects yet."}
                </p>
              )}
            </div>
          )}
        </aside>
        <main id="main" className="main-content" tabIndex={-1}>
          <div className="page-heading">
            <h1>{project ? "Project workspace" : "Portfolio overview"}</h1>
          </div>
          <div className="source-strip">
            <span className="source-icon" aria-hidden="true">
              ↔
            </span>
            <div>
              <strong>
                {fx?.rate
                  ? `1 USD = ${Number(fx.rate).toFixed(4)} PHP`
                  : !project && !portfolio.data && !portfolio.error
                    ? "Loading reference rate…"
                    : "Reference rate not available yet"}
              </strong>
              <span>
                {fx?.observation_date
                  ? `Observed ${fx.observation_date} · ${fx.source}`
                  : "You can still add projects and try hypothetical rates."}
                {rateAge >= 4
                  ? ` · Reference rate is ${rateAge} days old.`
                  : ""}
                {lastRun?.status === "failed"
                  ? " · Latest update failed; last successful rate retained."
                  : ""}
              </span>
            </div>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => {
                setError("");
                if (project) void open(project.id);
                else {
                  setPortfolioRevision((revision) => revision + 1);
                  void request<FX>("/fx")
                    .then(setWorkspaceFx)
                    .catch((reason) => setError(reason.message));
                }
              }}
            >
              Refresh
            </button>
          </div>
          {error && (
            <div className="error error-box" role="alert">
              {error}
            </div>
          )}
          {busy && (
            <p role="status" className="muted">
              Loading…
            </p>
          )}
          {!project ? (
            <PortfolioDashboard
              portfolio={portfolio}
              rate={portfolioRate}
              onRateChange={setPortfolioRate}
              onOpenProject={open}
              onAddProject={() => setCreating(true)}
              busy={busy}
            />
          ) : (
            <>
              <div className="project-heading">
                <div>
                  {project.archived && <span className="pill">Archived</span>}
                  <h2>{project.name}</h2>
                  {project.customer && (
                    <p className="muted">{project.customer}</p>
                  )}
                </div>
                <div className="heading-actions">
                  {!editing && (
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() => setEditing(true)}
                    >
                      Edit project
                    </button>
                  )}
                  {!editing && (
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() => void archive()}
                    >
                      {project.archived ? "Restore project" : "Archive project"}
                    </button>
                  )}
                </div>
              </div>
              {editing ? (
                <ProjectEditor
                  key={project.id + ":" + project.version}
                  project={project}
                  busy={busy}
                  onSaved={saved}
                  onCancel={() => setEditing(false)}
                  onDirty={onDirty}
                  onSaving={setBusy}
                />
              ) : (
                <>
                  <div className="metrics-grid">
                    {(
                      [
                        ["Incoming", project.metrics.incoming_php, "↙"],
                        ["Outgoing", project.metrics.outgoing_php, "↗"],
                        ["Estimated profit", project.metrics.profit_php, "="],
                      ] as const
                    ).map(([label, value, icon], i) => (
                      <div
                        className={`metric-card ${i === 2 ? "profit-card" : ""} ${value?.startsWith("-") ? "is-loss" : ""}`}
                        key={label}
                      >
                        <span className="metric-label">
                          {label}
                          <span aria-hidden="true">{icon}</span>
                        </span>
                        <strong className="metric-value">
                          {value !== null && (
                            <span className="metric-unit">PHP </span>
                          )}
                          {currency(value, "").trim()}
                        </strong>
                      </div>
                    ))}
                  </div>
                  {!project.metrics.complete && (
                    <p className="notice">
                      {project.lines.length
                        ? "Some amounts are unknown. Complete your cash flows to see the full estimate."
                        : "Add incoming and outgoing cash flows to estimate this project."}
                    </p>
                  )}
                  {project.metrics.complete &&
                    project.metrics.profit_php === null && (
                      <p className="notice">
                        This project needs a reference FX rate. You can use the
                        simulation below while it is unavailable.
                      </p>
                    )}
                  <Simulation
                    key={project.id + ":" + project.version}
                    projectId={project.id}
                    version={project.version}
                    referenceRate={project.fx.rate}
                    referenceDate={project.fx.observation_date}
                    onReferenceChange={() => void open(project.id)}
                  />
                  <section className="panel flows">
                    <div className="section-head">
                      <h2>Cash flows</h2>
                      <span className="pill">
                        {project.lines.length}{" "}
                        {project.lines.length === 1 ? "entry" : "entries"}
                      </span>
                    </div>
                    {project.notes && <p className="muted">{project.notes}</p>}
                    {project.lines.length ? (
                      <div className="table-scroll">
                        <table>
                          <thead>
                            <tr>
                              <th>Description</th>
                              <th>Direction</th>
                              <th>Expected date</th>
                              <th className="align-right">Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {project.lines.map((line, i) => (
                              <tr key={i}>
                                <td>{line.label}</td>
                                <td>
                                  <span
                                    className={`direction ${line.direction}`}
                                  >
                                    {line.direction === "incoming"
                                      ? "↙ Incoming"
                                      : "↗ Outgoing"}
                                  </span>
                                </td>
                                <td className="muted">
                                  {line.expected_date ?? "—"}
                                </td>
                                <td className="align-right amount">
                                  {line.amount === null
                                    ? "Unknown"
                                    : currency(line.amount, line.currency)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="muted">
                        No cash flows yet. Edit this project to add them.
                      </p>
                    )}
                    <p className="fine-print">
                      Planned amounts, not recorded payments. All estimates are
                      reported in PHP.
                    </p>
                  </section>
                </>
              )}
            </>
          )}
          <footer>
            Reference rates are indicative. Your bank’s rate may differ.
          </footer>
        </main>
      </div>
    </>
  );
}
