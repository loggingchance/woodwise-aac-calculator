import React, { useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Download, FileJson, FileText, LogOut, Play, Plus, RotateCw, ShieldCheck, Upload, AlertTriangle, CheckCircle2, Copy, Trash2 } from "lucide-react";
import "./styles.css";
import {
  createStratum,
  csvToStrata,
  defaultProperty,
  forestTypeGroups,
  formatForestType,
  reportTotals,
  strataToCsv,
  syntheticMetrics,
  validateProject
} from "./lib/forestry";
import type { PropertyInfo, Stratum } from "./types/project";
import sampleStrataCsv from "../samples/northern-hardwood-sample-strata.csv?raw";
import allWoodWiseStrataCsv from "../samples/woodwise-all-strata-52374-acres.csv?raw";

const assetPath = (path: string) => `${import.meta.env.BASE_URL}${path.replace(/^\//, "")}`;
const defaultApiBaseUrl = "https://woodwise.bicksapp.com";
const unusableApiBaseUrls = new Set(["http://34.122.158.209:8788", "https://wwf.bicksapp.com", "https://loggingchance.github.io"]);
const configuredApiUrl = import.meta.env.VITE_AAC_API_URL?.replace(/\/$/, "") || "";
const configuredApiBaseUrl = configuredApiUrl && !unusableApiBaseUrls.has(configuredApiUrl) ? configuredApiUrl : defaultApiBaseUrl;
const healthCheckTimeoutMs = 15000;
const runTimeoutMs = 180000;

interface FvsAggregateRow {
  year: number;
  acres: number;
  treesPerAcre: number;
  basalAreaFt2PerAcre: number;
  totalVolumeCuFt: number;
  merchantableVolumeCuFt: number;
  totalVolumeCuFtPerAcre: number;
  merchantableVolumeCuFtPerAcre: number;
}

interface FvsDisplayResult {
  run_id?: string;
  id?: string;
  status?: string;
  message?: string;
  run_package_path?: string;
  model_level?: string;
  caveat?: string;
  aggregate?: FvsAggregateRow[];
}

interface FvsHealth {
  reachable?: boolean;
  ready?: boolean;
  fvsRuntime?: string;
  adminRestartConfigured?: boolean;
  message?: string;
}

function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [property, setProperty] = useState<PropertyInfo>(defaultProperty);
  const [strata, setStrata] = useState<Stratum[]>([]);
  const [csvDraft, setCsvDraft] = useState("");
  const [apiUrl, setApiUrl] = useState(() => {
    const savedUrl = localStorage.getItem("woodwise-aac-api-url")?.replace(/\/$/, "") || "";
    return unusableApiBaseUrls.has(savedUrl) ? configuredApiBaseUrl : savedUrl || configuredApiBaseUrl;
  });
  const [runState, setRunState] = useState<"idle" | "submitting" | "submitted" | "blocked" | "error">("idle");
  const [runMessage, setRunMessage] = useState("");
  const [runResult, setRunResult] = useState<FvsDisplayResult | null>(null);
  const [healthStatus, setHealthStatus] = useState("Not checked");
  const [adminState, setAdminState] = useState<"idle" | "checking" | "restarting" | "submitted" | "error">("idle");
  const [adminMessage, setAdminMessage] = useState("");
  const [completedRunSignature, setCompletedRunSignature] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const messages = useMemo(() => validateProject(property, strata), [property, strata]);
  const metrics = useMemo(() => syntheticMetrics(strata), [strata]);
  const totals = useMemo(() => reportTotals(property, strata, metrics), [property, strata, metrics]);
  const inputSignature = useMemo(() => JSON.stringify({ property, strata }), [property, strata]);
  const hasCurrentFvsResult = Boolean(runResult?.aggregate?.length && completedRunSignature === inputSignature);
  const hardErrorCount = messages.filter((message) => message.level === "error").length;

  async function runFvsAnalysis() {
    if (hardErrorCount > 0) {
      setRunState("blocked");
      setRunMessage("Fix validation errors before submitting an FVS run.");
      setRunResult(null);
      return;
    }

    const runApiUrl = apiUrl.trim().replace(/\/$/, "");

    if (!runApiUrl) {
      setRunState("blocked");
      setRunMessage("No online Northeast FVS API URL is configured. Set VITE_AAC_API_URL to the hosted WoodWise FVS API address, then redeploy the GitHub page.");
      setRunResult(null);
      return;
    }

    if (unusableApiBaseUrls.has(runApiUrl)) {
      setRunState("blocked");
      setRunMessage(`${runApiUrl} serves the browser app, not the WoodWise FVS API. Use the hosted API URL, currently expected to be ${defaultApiBaseUrl}.`);
      setRunResult(null);
      return;
    }

    localStorage.setItem("woodwise-aac-api-url", runApiUrl);
    setRunState("submitting");
    setRunMessage("Checking the Northeast FVS service...");
    setRunResult(null);
    setCompletedRunSignature("");

    try {
      const healthResponse = await fetchWithTimeout(`${runApiUrl}/health`, { method: "GET" }, healthCheckTimeoutMs);
      const health = (await readJsonResponse(healthResponse)) as FvsHealth;
      setHealthStatus(health.ready ? "Ready" : health.message || "Reachable, FVS not ready");

      if (!healthResponse.ok || health.ready === false) {
        throw new Error(health.message || `WoodWise FVS API health check returned ${healthResponse.status}.`);
      }

      setRunMessage("Submitting project to the Northeast FVS service...");
      const response = await fetchWithTimeout(`${runApiUrl}/runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          property,
          strata,
          projection: { variant: "NE", years: 40, cycleYears: 10 },
          requestedOutputs: ["screen-report", "run-package"]
        })
      }, runTimeoutMs);

      const result = (await readJsonResponse(response)) as FvsDisplayResult & { detail?: string };

      if (!response.ok || result.status === "failed") {
        throw new Error(result.message || result.detail || `WoodWise FVS API returned ${response.status}`);
      }

      const runId = result.run_id || result.id || "submitted";
      setRunState("submitted");
      setRunResult(result);
      setCompletedRunSignature(inputSignature);
      setRunMessage(result.message || `Run ${runId} complete. Status: ${result.status || "complete"}.`);
    } catch (error) {
      setRunState("error");
      setRunResult(null);
      setCompletedRunSignature("");
      const message = error instanceof Error ? error.message : "The online FVS API did not return results.";
      setHealthStatus("Not reachable");
      setRunMessage(formatRunError(message, runApiUrl));
    }
  }

  async function checkFvsHealth() {
    const runApiUrl = apiUrl.trim().replace(/\/$/, "");
    if (!runApiUrl) {
      setAdminState("error");
      setAdminMessage("No online FVS API URL is configured.");
      return;
    }

    setAdminState("checking");
    setAdminMessage("Checking service health...");
    try {
      const response = await fetchWithTimeout(`${runApiUrl}/health`, { method: "GET" }, healthCheckTimeoutMs);
      const health = (await readJsonResponse(response)) as FvsHealth;
      setHealthStatus(health.ready ? "Ready" : health.message || "Reachable, FVS not ready");
      setAdminState(response.ok ? "idle" : "error");
      setAdminMessage(
        response.ok
          ? `Health check complete. Restart control is ${health.adminRestartConfigured ? "configured" : "not configured on the API host"}.`
          : health.message || `Health check returned ${response.status}.`
      );
    } catch (error) {
      setHealthStatus("Not reachable");
      setAdminState("error");
      const message = error instanceof Error ? error.message : "The online FVS API did not return health.";
      setAdminMessage(formatRunError(message, runApiUrl));
    }
  }

  async function restartFvsService() {
    const runApiUrl = apiUrl.trim().replace(/\/$/, "");
    if (!runApiUrl) {
      setAdminState("error");
      setAdminMessage("No online FVS API URL is configured.");
      return;
    }

    let adminToken = localStorage.getItem(adminRestartTokenStorageKey) || "";
    if (!adminToken) {
      adminToken = window.prompt("Admin restart token - paste it once on this computer")?.trim() || "";
    }

    if (!adminToken) {
      setAdminState("idle");
      setAdminMessage("Restart cancelled.");
      return;
    }

    localStorage.setItem(adminRestartTokenStorageKey, adminToken);
    setAdminState("restarting");
    setAdminMessage("Requesting service restart...");

    try {
      const response = await fetchWithTimeout(`${runApiUrl}/admin/restart-service`, {
        method: "POST",
        headers: { Authorization: `Bearer ${adminToken}` }
      }, healthCheckTimeoutMs);
      const result = (await readJsonResponse(response)) as { message?: string; detail?: string };

      if (!response.ok) {
        if (response.status === 401) localStorage.removeItem(adminRestartTokenStorageKey);
        throw new Error(result.message || result.detail || `Restart request returned ${response.status}.`);
      }

      setAdminState("submitted");
      setHealthStatus("Restart scheduled");
      setAdminMessage(result.message || "Restart accepted. Wait about 30 seconds, then check health.");
    } catch (error) {
      setAdminState("error");
      const message = error instanceof Error ? error.message : "The restart request failed.";
      setAdminMessage(formatRunError(message, runApiUrl));
    }
  }

  function loadStarterSample() {
    const sampleStrata = csvToStrata(sampleStrataCsv);
    const sampleAcres = sampleStrata.reduce((sum, item) => sum + item.acres, 0);
    setProperty({
      ...defaultProperty,
      propertyName: "WoodWise starter sample",
      county: "Northeast FVS sample area",
      totalOwnershipAcres: sampleAcres
    });
    setStrata(sampleStrata);
    setRunResult(null);
    setCompletedRunSignature("");
    setRunState("idle");
    setRunMessage("");
  }

  function replaceStrata(nextStrata: Stratum[]) {
    setStrata(nextStrata);
    setRunResult(null);
    setCompletedRunSignature("");
    setRunState("idle");
    setRunMessage("");
  }

  function loadAllWoodWiseStrata() {
    const allStrata = csvToStrata(allWoodWiseStrataCsv).map(addEstimatedCurrentVolumes);
    setProperty({
      ...property,
      propertyName: property.propertyName || "WoodWise 52,374-acre ownership",
      totalOwnershipAcres: allStrata.reduce((sum, item) => sum + item.acres, 0)
    });
    replaceStrata(allStrata);
  }

  if (!authenticated) {
    return <PinScreen onEnter={() => setAuthenticated(true)} />;
  }

  return (
    <main>
      <header className="masthead">
        <img src={assetPath("branding/woodwise-aac-masthead.png")} alt="WoodWise Forestry AAC Calculator masthead" />
      </header>

      <nav className="topbar" aria-label="Application status">
        <div className="brand-lockup">
          <img src={assetPath("branding/woodwise-forestry-logo.png")} alt="WoodWise Forestry logo" />
          <div>
            <strong>WoodWise AAC App</strong>
            <span>Modeling engine: USDA Forest Service Forest Vegetation Simulator, Northeast variant</span>
          </div>
        </div>
        <button className="ghost-button" onClick={() => setAuthenticated(false)}>
          <LogOut size={18} /> Logout
        </button>
      </nav>

      <section className="status-band">
        <StatusPill tone={configuredApiBaseUrl ? "ok" : "warn"} label={configuredApiBaseUrl ? "Online FVS configured" : "Online FVS API needed"} />
        <span>{configuredApiBaseUrl ? "Runs are sent to the configured hosted Northeast FVS API." : "Set the hosted WoodWise FVS API URL in GitHub before this public page can run official FVS."}</span>
      </section>

      <section className="run-panel" aria-label="Run FVS analysis">
        <div>
          <h2>Run Northeast FVS Analysis</h2>
          <p>
            Submit the current property and strata to the hosted official Northeast FVS API, then return the FVS report results.
          </p>
          <span className={`run-status ${apiUrl.trim() ? "ready" : "blocked"}`}>
            {apiUrl.trim() ? "Online FVS API URL ready" : "Online FVS API URL needed"}
          </span>
        </div>
        <div className="run-actions">
          <label className="api-url-field">
            <span>Online FVS API URL</span>
            <input value={apiUrl} onChange={(event) => setApiUrl(event.target.value)} placeholder={defaultApiBaseUrl} />
          </label>
          <button disabled={runState === "submitting"} onClick={() => void runFvsAnalysis()}>
            <Play size={18} /> {runState === "submitting" ? "Submitting" : "Run FVS analysis"}
          </button>
          {hasCurrentFvsResult && <a className="result-link" href="#aac-report">View FVS results</a>}
          {runMessage && <p className={`run-message ${runState}`}>{runMessage}</p>}
        </div>
      </section>

      {hasCurrentFvsResult && runResult?.aggregate?.length ? (
        <section className="panel fvs-results" id="fvs-results">
          <SectionHeader title="Official FVS Results" kicker={`Run ${runResult.run_id || runResult.id || ""}`} />
          <div className="metric-grid">
            <Metric label="Initial merchantable volume" value={`${number(runResult.aggregate[0].merchantableVolumeCuFtPerAcre)} cu ft/ac`} />
            <Metric label="Initial basal area" value={`${number(runResult.aggregate[0].basalAreaFt2PerAcre)} sq ft/ac`} />
            <Metric label="Final merchantable volume" value={`${number(runResult.aggregate[runResult.aggregate.length - 1].merchantableVolumeCuFtPerAcre)} cu ft/ac`} />
            <Metric label="Final basal area" value={`${number(runResult.aggregate[runResult.aggregate.length - 1].basalAreaFt2PerAcre)} sq ft/ac`} />
          </div>
          <table>
            <thead>
              <tr>
                <th>Year</th>
                <th>Acres</th>
                <th>TPA</th>
                <th>BA/ac</th>
                <th>Total cu ft/ac</th>
                <th>Merch cu ft/ac</th>
                <th>Total cu ft</th>
                <th>Merch cu ft</th>
              </tr>
            </thead>
            <tbody>
              {runResult.aggregate.map((row) => (
                <tr key={row.year}>
                  <td>{row.year}</td>
                  <td>{number(row.acres)}</td>
                  <td>{number(row.treesPerAcre)}</td>
                  <td>{number(row.basalAreaFt2PerAcre)}</td>
                  <td>{number(row.totalVolumeCuFtPerAcre)}</td>
                  <td>{number(row.merchantableVolumeCuFtPerAcre)}</td>
                  <td>{number(row.totalVolumeCuFt)}</td>
                  <td>{number(row.merchantableVolumeCuFt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {runResult.run_package_path && <p className="run-package-path">Run package: {runResult.run_package_path}</p>}
        </section>
      ) : null}

      <div className="layout">
        <section className="panel property-panel">
          <SectionHeader title="Property" kicker="40-year projection, 10-year cycles" />
          <div className="form-grid">
            <TextInput label="Property name" value={property.propertyName} onChange={(value) => setProperty({ ...property, propertyName: value })} />
            <NumberInput label="Inventory year" value={property.inventoryYear} onChange={(value) => setProperty({ ...property, inventoryYear: value })} />
            <TextInput label="County or FVS location area" value={property.county} onChange={(value) => setProperty({ ...property, county: value })} />
            <NumberInput label="Total ownership acres" value={property.totalOwnershipAcres} onChange={(value) => setProperty({ ...property, totalOwnershipAcres: value })} />
            <NumberInput label="Reserved acres" value={property.reservedAcres} onChange={(value) => setProperty({ ...property, reservedAcres: value })} />
            <NumberInput label="Inventory confidence deduction %" value={property.inventoryConfidenceDeduction} onChange={(value) => setProperty({ ...property, inventoryConfidenceDeduction: value })} />
            <NumberInput label="Harvest-loss deduction %" value={property.harvestLossDeduction} onChange={(value) => setProperty({ ...property, harvestLossDeduction: value })} />
            <NumberInput label="Desired inventory buildup %" value={property.desiredInventoryBuildup} onChange={(value) => setProperty({ ...property, desiredInventoryBuildup: value })} />
            <TextInput label="Analyst name" value={property.analystName} onChange={(value) => setProperty({ ...property, analystName: value })} />
            <TextInput label="Client or ownership name" value={property.clientName} onChange={(value) => setProperty({ ...property, clientName: value })} />
          </div>
          <label className="field field-wide">
            <span>Notes</span>
            <textarea value={property.notes} onChange={(event) => setProperty({ ...property, notes: event.target.value })} />
          </label>
        </section>

        <aside className="panel summary-panel">
          <SectionHeader title="Validation" kicker={`${messages.filter((m) => m.level === "error").length} errors, ${messages.filter((m) => m.level === "warning").length} warnings`} />
          <div className="message-list">
            {messages.map((message, index) => (
              <div className={`message ${message.level}`} key={`${message.text}-${index}`}>
                {message.level === "error" || message.level === "warning" ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
                <span>{message.text}</span>
              </div>
            ))}
          </div>
        </aside>
      </div>

      <section className="panel">
        <div className="toolbar">
          <SectionHeader title="Forest Strata" kicker={`${strata.length} strata, ${totals.modeledAcres.toLocaleString()} modeled acres`} />
          <div className="button-row">
            <button onClick={() => setStrata([...strata, createStratum(strata.length + 1)])}><Plus size={18} /> Add stratum row</button>
            <button onClick={loadStarterSample}><Upload size={18} /> Load sample</button>
            <button onClick={loadAllWoodWiseStrata}><Upload size={18} /> Load all WoodWise Strata</button>
            <button onClick={() => download("woodwise-strata.csv", strataToCsv(strata), "text/csv")}><Download size={18} /> CSV</button>
            <button onClick={() => download("woodwise-project.json", JSON.stringify({ property, strata }, null, 2), "application/json")}><FileJson size={18} /> JSON</button>
            <button onClick={() => fileRef.current?.click()}><Upload size={18} /> Upload JSON</button>
            <input ref={fileRef} hidden type="file" accept="application/json" onChange={(event) => void loadProjectFile(event, setProperty, setStrata)} />
          </div>
        </div>

        <div className="strata-table-wrap">
          <table className="strata-table">
            <thead>
              <tr>
                <th>Stratum or stand</th>
                <th>Acres</th>
                <th>Forest cover type</th>
                <th>Site</th>
                <th>BA/ac</th>
                <th>Mean DBH</th>
                <th>Basis</th>
                <th>Operable %</th>
                <th>Structure</th>
                <th aria-label="Actions"></th>
              </tr>
            </thead>
            <tbody>
              {strata.length === 0 && (
                <tr>
                  <td className="empty-strata" colSpan={10}>
                    <strong>No forest strata entered yet.</strong>
                    <span>Add a row, load the sample data, or paste rows from a spreadsheet below.</span>
                    <button onClick={() => setStrata([createStratum(1)])}><Plus size={18} /> Add first stratum row</button>
                  </td>
                </tr>
              )}
              {strata.map((stratum) => (
                <tr key={stratum.id}>
                  <td><input value={stratum.name} onChange={(e) => updateStratum(stratum.id, { name: e.target.value }, strata, setStrata)} /></td>
                  <td><input type="number" value={stratum.acres} onChange={(e) => updateStratum(stratum.id, { acres: Number(e.target.value) }, strata, setStrata)} /></td>
                  <td>
                    <select value={stratum.forestCoverTypeId} onChange={(e) => updateStratum(stratum.id, { forestCoverTypeId: e.target.value }, strata, setStrata)}>
                      {forestTypeGroups.map((group) => (
                        <optgroup key={group.name} label={group.name}>
                          {group.types.map((type) => (
                            <option key={type.id} value={type.id}>{formatForestType(type.id)}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </td>
                  <td><select value={stratum.siteClass} onChange={(e) => updateStratum(stratum.id, { siteClass: e.target.value as Stratum["siteClass"] }, strata, setStrata)}><option value="1">1 best</option><option value="2">2 intermediate</option><option value="3">3 poorest</option></select></td>
                  <td><input type="number" value={stratum.basalArea} onChange={(e) => updateStratum(stratum.id, { basalArea: Number(e.target.value) }, strata, setStrata)} /></td>
                  <td><input type="number" value={stratum.meanDbh} onChange={(e) => updateStratum(stratum.id, { meanDbh: Number(e.target.value) }, strata, setStrata)} /></td>
                  <td><select value={stratum.meanDbhBasis} onChange={(e) => updateStratum(stratum.id, { meanDbhBasis: e.target.value as Stratum["meanDbhBasis"] }, strata, setStrata)}><option value="unknown">unknown</option><option value="qmd">QMD</option><option value="arithmetic">arithmetic</option></select></td>
                  <td><input type="number" value={stratum.operablePercent} onChange={(e) => updateStratum(stratum.id, { operablePercent: Number(e.target.value) }, strata, setStrata)} /></td>
                  <td><select value={stratum.structure} onChange={(e) => updateStratum(stratum.id, { structure: e.target.value as Stratum["structure"] }, strata, setStrata)}><option>mixed/unknown</option><option>even-aged</option><option>uneven-aged</option><option>two-aged</option></select></td>
                  <td className="icon-actions">
                    <button title="Duplicate row" aria-label="Duplicate row" onClick={() => setStrata([...strata, { ...stratum, id: crypto.randomUUID(), name: `${stratum.name} copy` }])}><Copy size={16} /></button>
                    <button title="Delete row" aria-label="Delete row" onClick={() => setStrata(strata.filter((item) => item.id !== stratum.id))}><Trash2 size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {strata.length > 0 && (
          <div className="table-footer-actions">
            <button onClick={() => setStrata([...strata, createStratum(strata.length + 1)])}><Plus size={18} /> Add another stratum row</button>
          </div>
        )}

        <details className="csv-import">
          <summary>Paste strata CSV</summary>
          <p>Paste rows copied from Excel or a CSV file. Importing replaces the current strata table.</p>
          <textarea value={csvDraft} onChange={(event) => setCsvDraft(event.target.value)} placeholder="Paste strata rows here" />
          <div className="button-row">
            <button disabled={!csvDraft.trim()} onClick={() => { replaceStrata(csvToStrata(csvDraft)); setCsvDraft(""); }}><Upload size={18} /> Import pasted CSV</button>
            <button className="ghost-button" disabled={!csvDraft} onClick={() => setCsvDraft("")}>Clear paste box</button>
          </div>
        </details>
      </section>

      <section className="panel">
        <SectionHeader title="Synthetic Inventory Audit" kicker="Preview checks before official FVS integration" />
        <table>
          <thead><tr><th>Stratum</th><th>User BA/ac</th><th>Generated BA/ac</th><th>User DBH</th><th>Generated DBH</th><th>TPA</th><th>Sawtimber MBF/ac</th><th>Green tons/ac</th><th>Notes</th></tr></thead>
          <tbody>
            {strata.map((stratum) => {
              const metric = metrics.find((item) => item.stratumId === stratum.id);
              return <tr key={stratum.id}><td>{stratum.name}</td><td>{stratum.basalArea}</td><td>{metric?.generatedBasalArea}</td><td>{stratum.meanDbh}</td><td>{metric?.generatedMeanDbh}</td><td>{metric?.treesPerAcre}</td><td>{metric?.sawtimberMbfPerAcre}</td><td>{metric?.greenTonsPerAcre}</td><td>{metric?.warning ?? "Ready for detailed template fitting"}</td></tr>;
            })}
          </tbody>
        </table>
      </section>

      {hasCurrentFvsResult ? (
        <section className="report-section" id="aac-report">
          <div className="report-header">
            <img src={assetPath("branding/woodwise-forestry-logo.png")} alt="WoodWise Forestry logo" />
            <div>
              <h1>WoodWise Forestry Annual Allowable Cut Analysis</h1>
              <p>{property.propertyName} - Inventory {property.inventoryYear} - Analysis date {new Date().toLocaleDateString()}</p>
            </div>
          </div>
          {runResult ? (
            <div className="report-actions">
              <button onClick={() => downloadReport(property, strata, totals, runResult)}>
                <FileText size={18} /> Download PDF report
              </button>
            </div>
          ) : null}
          <div className="metric-grid">
            <Metric label="Biological sawtimber AAC" value={`${number(totals.biologicalSawAac)} MBF/year`} />
            <Metric label="Biological green-ton AAC" value={`${number(totals.biologicalGreenAac)} green tons/year`} />
            <Metric label="Planning sawtimber preview" value={`${number(totals.planningSawAac)} MBF/year`} />
            <Metric label="Planning green-ton preview" value={`${number(totals.planningGreenAac)} green tons/year`} />
          </div>
          <div className="report-copy">
            <p>Sawtimber is reported in MBF using International 1/4-inch rule language. Green tons are a separate non-sawtimber product stream for roundwood, pulpwood, and firewood, reported as green short tons with bark included. Sawtimber MBF and green tons are paired outputs and are never added together.</p>
            <p>Sustainable repeated-harvest AAC and binding constraints require official Northeast FVS output from the hosted WoodWise FVS API.</p>
          </div>
        </section>
      ) : (
        <section className="panel pending-report">
          <SectionHeader title="AAC report not generated yet" kicker="Run FVS first" />
          <p>Load or edit strata, then click <strong>Run FVS analysis</strong>. The AAC report will appear only after the hosted Northeast FVS run returns results for the current inputs.</p>
        </section>
      )}

      <section className="panel diagnostics">
        <SectionHeader title="Diagnostics" kicker="No secrets shown" />
        <dl>
          <div><dt>Frontend version</dt><dd>0.1.0 foundation</dd></div>
          <div><dt>API URL</dt><dd>{apiUrl || "Not configured"}</dd></div>
          <div><dt>Health status</dt><dd>{healthStatus}</dd></div>
          <div><dt>FVS variant</dt><dd>NE required</dd></div>
          <div><dt>FVS runtime</dt><dd>Unavailable in browser-only build</dd></div>
          <div><dt>Configuration</dt><dd>Forest types 1.0; site crosswalk 0.1 unvalidated</dd></div>
        </dl>
        <details className="admin-service">
          <summary>Service admin</summary>
          <div className="admin-actions">
            <button disabled={adminState === "checking" || adminState === "restarting"} onClick={() => void checkFvsHealth()}>
              <ShieldCheck size={18} /> Check health
            </button>
            <button disabled={adminState === "checking" || adminState === "restarting"} onClick={() => void restartFvsService()}>
              <RotateCw size={18} /> Restart FVS API
            </button>
          </div>
          {adminMessage && <p className={`admin-message ${adminState}`}>{adminMessage}</p>}
        </details>
      </section>
    </main>
  );
}

const defaultFrontPinHash = "37ba3881108bf3e48180350246c5959b9481633d0cb1d8694fb141dc74e5fe79";
const frontPinHash = import.meta.env.VITE_AAC_FRONT_PIN_HASH || defaultFrontPinHash;
const adminRestartTokenStorageKey = "woodwise-aac-admin-restart-token";

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function PinScreen({ onEnter }: { onEnter: () => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  async function submitPin() {
    if (!pin || checking) return;
    setChecking(true);
    setError("");
    const enteredHash = await sha256Hex(pin.trim());
    if (enteredHash === frontPinHash) {
      onEnter();
    } else {
      setError("That PIN did not match. Check the code and try again.");
    }
    setChecking(false);
  }

  return (
    <main className="pin-screen">
      <section className="pin-hero" aria-label="WoodWise Forestry AAC Calculator">
        <img src={assetPath("branding/woodwise-aac-masthead.png")} alt="WoodWise Forestry AAC Calculator masthead" />
      </section>
      <section className="pin-access" aria-label="Calculator access">
        <div className="pin-panel">
          <div className="pin-lockup">
            <img src={assetPath("branding/woodwise-forestry-logo.png")} alt="WoodWise Forestry logo" />
            <div>
              <h1>Secure access</h1>
              <p>Enter the shared WoodWise PIN to open the calculator.</p>
            </div>
          </div>
          <label className="field">
            <span>Security code</span>
            <input type="password" inputMode="numeric" autoComplete="current-password" value={pin} onChange={(event) => setPin(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void submitPin(); }} />
          </label>
          {error && <p className="pin-error" role="alert">{error}</p>}
          <button disabled={!pin || checking} onClick={() => void submitPin()}><ShieldCheck size={18} /> {checking ? "Checking" : "Enter calculator"}</button>
        </div>
      </section>
    </main>
  );
}

function SectionHeader({ title, kicker }: { title: string; kicker?: string }) {
  return <div className="section-header"><h2>{title}</h2>{kicker && <p>{kicker}</p>}</div>;
}

function TextInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="field"><span>{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function NumberInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label className="field"><span>{label}</span><input type="number" value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>;
}

function StatusPill({ tone, label }: { tone: "warn" | "ok"; label: string }) {
  return <strong className={`status-pill ${tone}`}>{label}</strong>;
}

function updateStratum(id: string, patch: Partial<Stratum>, strata: Stratum[], setStrata: (strata: Stratum[]) => void) {
  setStrata(strata.map((stratum) => (stratum.id === id ? { ...stratum, ...patch } : stratum)));
}

function addEstimatedCurrentVolumes(stratum: Stratum): Stratum {
  const qmd = stratum.meanDbhBasis === "arithmetic" ? stratum.meanDbh * 1.04 : stratum.meanDbh;
  const siteMultiplier = stratum.siteClass === "1" ? 1.12 : stratum.siteClass === "3" ? 0.88 : 1;
  const sawFactor = qmd >= 14 ? 0.075 : qmd >= 11 ? 0.035 : 0.012;
  const greenFactor = qmd >= 8 ? 0.62 : 0.38;
  return {
    ...stratum,
    currentSawtimberMbfPerAcre: stratum.currentSawtimberMbfPerAcre ?? roundTenth(stratum.basalArea * sawFactor * siteMultiplier),
    currentGreenTonsPerAcre: stratum.currentGreenTonsPerAcre ?? roundTenth(stratum.basalArea * greenFactor * siteMultiplier)
  };
}

async function loadProjectFile(event: React.ChangeEvent<HTMLInputElement>, setProperty: (property: PropertyInfo) => void, setStrata: (strata: Stratum[]) => void) {
  const file = event.target.files?.[0];
  if (!file) return;
  const parsed = JSON.parse(await file.text()) as { property: PropertyInfo; strata: Stratum[] };
  setProperty(parsed.property);
  setStrata(parsed.strata);
  event.target.value = "";
}

function download(filename: string, content: BlobPart, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadReport(
  property: PropertyInfo,
  strata: Stratum[],
  totals: ReturnType<typeof reportTotals>,
  runResult: FvsDisplayResult
) {
  const filename = `${safeFilename(property.propertyName || "woodwise")}-aac-report.pdf`;
  download(filename, buildReportPdf(property, strata, totals, runResult), "application/pdf");
}

function buildReportPdf(
  property: PropertyInfo,
  strata: Stratum[],
  totals: ReturnType<typeof reportTotals>,
  runResult: FvsDisplayResult
) {
  const analysisDate = new Date().toLocaleDateString();
  const runId = runResult.run_id || runResult.id || "not reported";
  const aggregate = runResult.aggregate || [];
  const initial = aggregate[0];
  const final = aggregate[aggregate.length - 1];
  const lines = [
    "WoodWise Forestry Annual Allowable Cut Analysis",
    `${property.propertyName || "Unnamed property"} | Inventory ${property.inventoryYear} | ${analysisDate}`,
    "",
    `FVS run ID: ${runId}`,
    `FVS status: ${runResult.status || "complete"}`,
    `Modeled acres: ${number(totals.modeledAcres)}`,
    `Operable acres: ${number(totals.operableAcres)}`,
    "",
    "AAC Planning Summary",
    `Biological sawtimber AAC: ${number(totals.biologicalSawAac)} MBF/year`,
    `Biological green-ton AAC: ${number(totals.biologicalGreenAac)} green tons/year`,
    `Planning sawtimber preview: ${number(totals.planningSawAac)} MBF/year`,
    `Planning green-ton preview: ${number(totals.planningGreenAac)} green tons/year`,
    "",
    "Official FVS Results",
    `Initial merch volume: ${initial ? `${number(initial.merchantableVolumeCuFtPerAcre)} cu ft/ac` : "n/a"}`,
    `Final merch volume: ${final ? `${number(final.merchantableVolumeCuFtPerAcre)} cu ft/ac` : "n/a"}`,
    `Initial basal area: ${initial ? `${number(initial.basalAreaFt2PerAcre)} sq ft/ac` : "n/a"}`,
    `Final basal area: ${final ? `${number(final.basalAreaFt2PerAcre)} sq ft/ac` : "n/a"}`,
    "",
    "FVS Aggregate Rows",
    "Year | Acres | TPA | BA/ac | Total cu ft/ac | Merch cu ft/ac",
    ...aggregate.map((row) =>
      `${row.year} | ${number(row.acres)} | ${number(row.treesPerAcre)} | ${number(row.basalAreaFt2PerAcre)} | ${number(row.totalVolumeCuFtPerAcre)} | ${number(row.merchantableVolumeCuFtPerAcre)}`
    ),
    "",
    "Forest Strata Submitted",
    ...strata.map((stratum) =>
      `${stratum.name} | ${number(stratum.acres)} ac | ${formatForestType(stratum.forestCoverTypeId)} | BA ${number(stratum.basalArea)} | DBH ${number(stratum.meanDbh)}`
    ),
    "",
    "Model Notes",
    runResult.model_level || "Strata-level representative stands",
    runResult.caveat || "Production-grade AAC should be reviewed against plot/tree-list fitting, treatment alternatives, merchantability assumptions, and forestry judgment before use in binding documents.",
    runResult.run_package_path ? `Run package: ${runResult.run_package_path}` : ""
  ];
  return createPdf(lines);
}

function buildReportHtml(
  property: PropertyInfo,
  strata: Stratum[],
  totals: ReturnType<typeof reportTotals>,
  runResult: FvsDisplayResult
) {
  const analysisDate = new Date().toLocaleDateString();
  const runId = runResult.run_id || runResult.id || "not reported";
  const aggregate = runResult.aggregate || [];
  const initial = aggregate[0];
  const final = aggregate[aggregate.length - 1];
  const logoUrl = new URL(assetPath("branding/woodwise-forestry-logo.png"), window.location.origin).href;
  const mastheadUrl = new URL(assetPath("branding/woodwise-aac-masthead.png"), window.location.origin).href;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(property.propertyName || "WoodWise")} AAC Report</title>
  <style>
    :root {
      --forest: #083f2d;
      --deep: #05291f;
      --gold: #b7954a;
      --paper: #fffaf0;
      --ink: #1d2a23;
      --muted: #5f6d64;
      --line: #d7cfb9;
    }
    * { box-sizing: border-box; }
    body {
      background: #f3f1e9;
      color: var(--ink);
      font-family: Arial, Helvetica, sans-serif;
      line-height: 1.45;
      margin: 0;
    }
    main {
      background: var(--paper);
      margin: 0 auto;
      max-width: 1080px;
      min-height: 100vh;
    }
    .masthead img {
      display: block;
      height: 170px;
      object-fit: cover;
      width: 100%;
    }
    .report-title {
      align-items: center;
      border-bottom: 3px solid var(--gold);
      display: grid;
      gap: 18px;
      grid-template-columns: 84px 1fr;
      padding: 24px 32px;
    }
    .report-title img { width: 84px; }
    h1, h2 {
      color: var(--forest);
      font-family: Georgia, "Times New Roman", serif;
      line-height: 1.12;
      margin: 0;
    }
    h1 { font-size: 34px; }
    h2 {
      border-bottom: 1px solid var(--line);
      font-size: 22px;
      margin-bottom: 14px;
      padding-bottom: 8px;
    }
    .subtitle {
      color: var(--muted);
      margin: 6px 0 0;
    }
    section { padding: 22px 32px; }
    .summary-grid, .metric-grid {
      display: grid;
      gap: 12px;
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
    .summary-card, .metric {
      background: white;
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 12px;
    }
    .summary-card span, .metric span {
      color: var(--muted);
      display: block;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .summary-card strong, .metric strong {
      color: var(--forest);
      display: block;
      font-size: 20px;
      margin-top: 5px;
    }
    table {
      border-collapse: collapse;
      font-size: 13px;
      width: 100%;
    }
    th {
      background: #ebe4d2;
      color: #273b30;
      font-size: 11px;
      text-align: left;
      text-transform: uppercase;
    }
    th, td {
      border: 1px solid var(--line);
      padding: 7px;
      vertical-align: top;
    }
    .note {
      background: #fff5d9;
      border-left: 4px solid var(--gold);
      color: #493b1c;
      margin: 12px 0 0;
      padding: 10px 12px;
    }
    .footer {
      border-top: 2px solid var(--gold);
      color: var(--muted);
      font-size: 12px;
      padding: 18px 32px 28px;
    }
    @media print {
      body { background: white; }
      main { max-width: none; }
      section { break-inside: avoid; }
      .masthead img { height: 120px; }
    }
  </style>
</head>
<body>
  <main>
    <div class="masthead"><img src="${mastheadUrl}" alt="WoodWise Forestry AAC Calculator masthead" /></div>
    <header class="report-title">
      <img src="${logoUrl}" alt="WoodWise Forestry logo" />
      <div>
        <h1>WoodWise Forestry Annual Allowable Cut Analysis</h1>
        <p class="subtitle">${escapeHtml(property.propertyName || "Unnamed property")} - Inventory ${escapeHtml(String(property.inventoryYear))} - Analysis date ${escapeHtml(analysisDate)}</p>
      </div>
    </header>

    <section>
      <h2>Run Summary</h2>
      <div class="summary-grid">
        ${summaryCard("FVS run ID", runId)}
        ${summaryCard("FVS status", runResult.status || "complete")}
        ${summaryCard("Modeled acres", number(totals.modeledAcres))}
        ${summaryCard("Operable acres", number(totals.operableAcres))}
      </div>
      <p class="note">This report was generated after a hosted official Northeast FVS run returned results for the current WoodWise project inputs.</p>
    </section>

    <section>
      <h2>AAC Planning Summary</h2>
      <div class="metric-grid">
        ${summaryCard("Biological sawtimber AAC", `${number(totals.biologicalSawAac)} MBF/year`)}
        ${summaryCard("Biological green-ton AAC", `${number(totals.biologicalGreenAac)} green tons/year`)}
        ${summaryCard("Planning sawtimber preview", `${number(totals.planningSawAac)} MBF/year`)}
        ${summaryCard("Planning green-ton preview", `${number(totals.planningGreenAac)} green tons/year`)}
      </div>
    </section>

    <section>
      <h2>Official FVS Results</h2>
      <div class="summary-grid">
        ${summaryCard("Initial merch volume", initial ? `${number(initial.merchantableVolumeCuFtPerAcre)} cu ft/ac` : "n/a")}
        ${summaryCard("Final merch volume", final ? `${number(final.merchantableVolumeCuFtPerAcre)} cu ft/ac` : "n/a")}
        ${summaryCard("Initial basal area", initial ? `${number(initial.basalAreaFt2PerAcre)} sq ft/ac` : "n/a")}
        ${summaryCard("Final basal area", final ? `${number(final.basalAreaFt2PerAcre)} sq ft/ac` : "n/a")}
      </div>
      ${aggregateTable(aggregate)}
    </section>

    <section>
      <h2>Property Inputs</h2>
      <table>
        <tbody>
          ${propertyRow("Client or ownership", property.clientName)}
          ${propertyRow("Analyst", property.analystName)}
          ${propertyRow("County or FVS location area", property.county)}
          ${propertyRow("Total ownership acres", number(property.totalOwnershipAcres))}
          ${propertyRow("Reserved acres", number(property.reservedAcres))}
          ${propertyRow("Inventory confidence deduction", `${number(property.inventoryConfidenceDeduction)}%`)}
          ${propertyRow("Harvest-loss deduction", `${number(property.harvestLossDeduction)}%`)}
          ${propertyRow("Desired inventory buildup", `${number(property.desiredInventoryBuildup)}%`)}
          ${propertyRow("Notes", property.notes)}
        </tbody>
      </table>
    </section>

    <section>
      <h2>Forest Strata Submitted</h2>
      ${strataTable(strata)}
    </section>

    <section>
      <h2>Model Notes</h2>
      <p>${escapeHtml(runResult.model_level || "Strata-level representative stands")}</p>
      <p>${escapeHtml(runResult.caveat || "Production-grade AAC should be reviewed against plot/tree-list fitting, treatment alternatives, merchantability assumptions, and forestry judgment before use in binding documents.")}</p>
      ${runResult.run_package_path ? `<p class="note">Run package: ${escapeHtml(runResult.run_package_path)}</p>` : ""}
    </section>

    <footer class="footer">
      Prepared using the WoodWise Forestry AAC Calculator and the USDA Forest Service Northeast Forest Vegetation Simulator. This is not an official USDA Forest Service product and does not imply USDA endorsement.
    </footer>
  </main>
</body>
</html>`;
}

function summaryCard(label: string, value: string) {
  return `<div class="summary-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function propertyRow(label: string, value: string | number) {
  return `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value === "" ? "n/a" : String(value))}</td></tr>`;
}

function aggregateTable(rows: FvsAggregateRow[]) {
  if (!rows.length) return `<p class="note">No aggregate FVS rows were returned.</p>`;
  return `<table>
    <thead>
      <tr>
        <th>Year</th>
        <th>Acres</th>
        <th>TPA</th>
        <th>BA/ac</th>
        <th>Total cu ft/ac</th>
        <th>Merch cu ft/ac</th>
        <th>Total cu ft</th>
        <th>Merch cu ft</th>
      </tr>
    </thead>
    <tbody>
      ${rows.map((row) => `<tr>
        <td>${escapeHtml(String(row.year))}</td>
        <td>${number(row.acres)}</td>
        <td>${number(row.treesPerAcre)}</td>
        <td>${number(row.basalAreaFt2PerAcre)}</td>
        <td>${number(row.totalVolumeCuFtPerAcre)}</td>
        <td>${number(row.merchantableVolumeCuFtPerAcre)}</td>
        <td>${number(row.totalVolumeCuFt)}</td>
        <td>${number(row.merchantableVolumeCuFt)}</td>
      </tr>`).join("")}
    </tbody>
  </table>`;
}

function strataTable(strata: Stratum[]) {
  if (!strata.length) return `<p class="note">No strata were submitted.</p>`;
  return `<table>
    <thead>
      <tr>
        <th>Stratum</th>
        <th>Acres</th>
        <th>Forest cover type</th>
        <th>Site</th>
        <th>BA/ac</th>
        <th>Mean DBH</th>
        <th>Basis</th>
        <th>Operable %</th>
        <th>Structure</th>
      </tr>
    </thead>
    <tbody>
      ${strata.map((stratum) => `<tr>
        <td>${escapeHtml(stratum.name)}</td>
        <td>${number(stratum.acres)}</td>
        <td>${escapeHtml(formatForestType(stratum.forestCoverTypeId))}</td>
        <td>${escapeHtml(stratum.siteClass)}</td>
        <td>${number(stratum.basalArea)}</td>
        <td>${number(stratum.meanDbh)}</td>
        <td>${escapeHtml(stratum.meanDbhBasis)}</td>
        <td>${number(stratum.operablePercent)}</td>
        <td>${escapeHtml(stratum.structure)}</td>
      </tr>`).join("")}
    </tbody>
  </table>`;
}

function safeFilename(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64) || "woodwise";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
  }
}

async function readJsonResponse(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: `WoodWise FVS API returned ${response.status} but did not return JSON.` };
  }
}

function formatRunError(message: string, runApiUrl: string) {
  if (message === "Failed to fetch") {
    return `Could not reach the WoodWise FVS API at ${runApiUrl}. The API host is down, blocked by CORS, or not routed to the FVS service.`;
  }
  if (message === "The operation was aborted.") {
    return `The WoodWise FVS API at ${runApiUrl} did not respond before the timeout. Check whether the API service is running and whether the FVS run is hanging.`;
  }
  return message;
}

function createPdf(lines: string[]) {
  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 48;
  const lineHeight = 13;
  const linesPerPage = Math.floor((pageHeight - margin * 2) / lineHeight);
  const wrapped = lines.flatMap((line) => wrapPdfLine(line, 92));
  const pages: string[][] = [];
  for (let i = 0; i < wrapped.length; i += linesPerPage) {
    pages.push(wrapped.slice(i, i + linesPerPage));
  }

  const objects: string[] = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push(`<< /Type /Pages /Kids [${pages.map((_, index) => `${3 + index * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`);

  pages.forEach((pageLines, index) => {
    const pageObjectNumber = 3 + index * 2;
    const contentObjectNumber = pageObjectNumber + 1;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> /F2 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> >> >> /Contents ${contentObjectNumber} 0 R >>`);
    const content = pdfPageContent(pageLines, margin, pageHeight - margin, lineHeight, index + 1, pages.length);
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  });

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return pdf;
}

function pdfPageContent(lines: string[], x: number, startY: number, lineHeight: number, page: number, pageCount: number) {
  const commands = ["BT"];
  lines.forEach((line, index) => {
    const isTitle = index === 0 && page === 1;
    commands.push(`/${isTitle ? "F2" : "F1"} ${isTitle ? 16 : 10} Tf`);
    commands.push(`${x} ${startY - index * lineHeight} Td (${escapePdfText(line)}) Tj`);
    commands.push(`${-x} ${-(startY - index * lineHeight)} Td`);
  });
  commands.push("/F1 9 Tf");
  commands.push(`${x} 28 Td (Page ${page} of ${pageCount}) Tj`);
  commands.push("ET");
  return commands.join("\n");
}

function wrapPdfLine(line: string, maxLength: number) {
  const clean = pdfSafeText(line);
  if (clean.length <= maxLength) return [clean];
  const words = clean.split(/\s+/);
  const output: string[] = [];
  let current = "";
  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxLength) {
      if (current) output.push(current);
      current = word;
    } else {
      current = next;
    }
  });
  if (current) output.push(current);
  return output;
}

function pdfSafeText(value: string) {
  return value
    .replace(/[\u2014\u2013]/g, "-")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "");
}

function escapePdfText(value: string) {
  return pdfSafeText(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function number(value: number) {
  return Math.round(value).toLocaleString();
}

function roundTenth(value: number) {
  return Math.round(value * 10) / 10;
}

createRoot(document.getElementById("root")!).render(<App />);
