import React, { useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Download, FileJson, LogOut, Plus, ShieldCheck, Upload, AlertTriangle, CheckCircle2, Copy, Trash2 } from "lucide-react";
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

function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [property, setProperty] = useState<PropertyInfo>(defaultProperty);
  const [strata, setStrata] = useState<Stratum[]>([createStratum(1), { ...createStratum(2), id: crypto.randomUUID(), name: "Softwood inclusion", forestCoverTypeId: "saf-22", acres: 220, meanDbh: 10, basalArea: 110 }]);
  const [csvDraft, setCsvDraft] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const messages = useMemo(() => validateProject(property, strata), [property, strata]);
  const metrics = useMemo(() => syntheticMetrics(strata), [strata]);
  const totals = useMemo(() => reportTotals(property, strata, metrics), [property, strata, metrics]);

  if (!authenticated) {
    return <PinScreen onEnter={() => setAuthenticated(true)} />;
  }

  return (
    <main>
      <header className="masthead">
        <img src="/branding/woodwise-aac-masthead.png" alt="WoodWise Forestry AAC Calculator masthead" />
      </header>

      <nav className="topbar" aria-label="Application status">
        <div className="brand-lockup">
          <img src="/branding/woodwise-forestry-logo.png" alt="WoodWise Forestry logo" />
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
        <StatusPill tone="warn" label="Foundation build" />
        <span>Official Northeast FVS backend is not connected. Preview values are labeled and kept separate from real model output.</span>
      </section>

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
            <button onClick={() => setStrata([...strata, createStratum(strata.length + 1)])}><Plus size={18} /> Add</button>
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
                <th>Name</th>
                <th>Acres</th>
                <th>Forest cover type</th>
                <th>Site</th>
                <th>BA/ac</th>
                <th>Mean DBH</th>
                <th>Basis</th>
                <th>Operable %</th>
                <th>Structure</th>
                <th>Residual BA</th>
                <th aria-label="Actions"></th>
              </tr>
            </thead>
            <tbody>
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
                  <td><input type="number" value={stratum.residualBaFloor} onChange={(e) => updateStratum(stratum.id, { residualBaFloor: Number(e.target.value) }, strata, setStrata)} /></td>
                  <td className="icon-actions">
                    <button title="Duplicate row" aria-label="Duplicate row" onClick={() => setStrata([...strata, { ...stratum, id: crypto.randomUUID(), name: `${stratum.name} copy` }])}><Copy size={16} /></button>
                    <button title="Delete row" aria-label="Delete row" onClick={() => setStrata(strata.filter((item) => item.id !== stratum.id))}><Trash2 size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <details className="csv-import">
          <summary>Paste strata CSV</summary>
          <textarea value={csvDraft} onChange={(event) => setCsvDraft(event.target.value)} placeholder={strataToCsv(strata)} />
          <button onClick={() => setStrata(csvToStrata(csvDraft))}><Upload size={18} /> Import pasted CSV</button>
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

      <section className="report-section">
        <div className="report-header">
          <img src="/branding/woodwise-forestry-logo.png" alt="WoodWise Forestry logo" />
          <div>
            <h1>WoodWise Forestry Annual Allowable Cut Analysis</h1>
            <p>{property.propertyName} · Inventory {property.inventoryYear} · Analysis date {new Date().toLocaleDateString()}</p>
          </div>
        </div>
        <div className="metric-grid">
          <Metric label="Biological sawtimber AAC" value={`${number(totals.biologicalSawAac)} MBF/year`} />
          <Metric label="Biological green-ton AAC" value={`${number(totals.biologicalGreenAac)} green tons/year`} />
          <Metric label="Planning sawtimber preview" value={`${number(totals.planningSawAac)} MBF/year`} />
          <Metric label="Planning green-ton preview" value={`${number(totals.planningGreenAac)} green tons/year`} />
        </div>
        <div className="report-copy">
          <p>Sawtimber uses International 1/4-inch rule language in the report. Roundwood, pulpwood, and firewood are tracked as green short tons with bark included. The two products are presented as a paired result and are never added together.</p>
          <p>Sustainable repeated-harvest AAC and binding constraints require official Northeast FVS output. This build keeps those fields out of the recommendation until the backend smoke test proves the runtime is official.</p>
        </div>
      </section>

      <section className="panel diagnostics">
        <SectionHeader title="Diagnostics" kicker="No secrets shown" />
        <dl>
          <div><dt>Frontend version</dt><dd>0.1.0 foundation</dd></div>
          <div><dt>API URL</dt><dd>Not configured</dd></div>
          <div><dt>Health status</dt><dd>Backend pending</dd></div>
          <div><dt>FVS variant</dt><dd>NE required</dd></div>
          <div><dt>FVS runtime</dt><dd>Unavailable in browser-only build</dd></div>
          <div><dt>Configuration</dt><dd>Forest types 1.0; site crosswalk 0.1 unvalidated</dd></div>
        </dl>
      </section>
    </main>
  );
}

const defaultFrontPinHash = "37ba3881108bf3e48180350246c5959b9481633d0cb1d8694fb141dc74e5fe79";
const frontPinHash = import.meta.env.VITE_AAC_FRONT_PIN_HASH || defaultFrontPinHash;

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
      <img className="pin-masthead" src="/branding/woodwise-aac-masthead.png" alt="WoodWise Forestry AAC Calculator masthead" />
      <section className="pin-panel">
        <img src="/branding/woodwise-forestry-logo.png" alt="WoodWise Forestry logo" />
        <h1>WoodWise Forestry AAC Calculator</h1>
        <p>Enter the shared WoodWise access PIN to open the calculator.</p>
        <label className="field">
          <span>Shared PIN</span>
          <input type="password" value={pin} onChange={(event) => setPin(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void submitPin(); }} />
        </label>
        {error && <p className="pin-error" role="alert">{error}</p>}
        <button disabled={!pin || checking} onClick={() => void submitPin()}><ShieldCheck size={18} /> {checking ? "Checking" : "Enter calculator"}</button>
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

async function loadProjectFile(event: React.ChangeEvent<HTMLInputElement>, setProperty: (property: PropertyInfo) => void, setStrata: (strata: Stratum[]) => void) {
  const file = event.target.files?.[0];
  if (!file) return;
  const parsed = JSON.parse(await file.text()) as { property: PropertyInfo; strata: Stratum[] };
  setProperty(parsed.property);
  setStrata(parsed.strata);
  event.target.value = "";
}

function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function number(value: number) {
  return Math.round(value).toLocaleString();
}

createRoot(document.getElementById("root")!).render(<App />);
