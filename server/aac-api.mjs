import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { join, resolve } from "node:path";
import { createServer } from "node:http";

const port = Number(process.env.AAC_PORT || 8787);
const allowedOrigins = (process.env.AAC_ALLOWED_ORIGINS || "*").split(",").map((item) => item.trim());
const tempDir = resolve(process.env.AAC_TEMP_DIR || ".aac-runs");
const discoveredFvsPath = "C:\\Users\\steve\\Documents\\Codex\\2026-05-30\\files-mentioned-by-the-user-carbine\\fvs-src\\ForestVegetationSimulator-main\\bin\\FVSne.exe";
const fvsPath = process.env.AAC_FVS_NE_PATH || (existsSync(discoveredFvsPath) ? discoveredFvsPath : "");

mkdirSync(tempDir, { recursive: true });

const server = createServer(async (request, response) => {
  const origin = request.headers.origin || "";
  setCors(response, origin);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  try {
    if (request.method === "GET" && request.url === "/health") {
      sendJson(response, 200, healthPayload());
      return;
    }

    if (request.method === "POST" && request.url === "/projects/validate") {
      const project = await readJson(request);
      const validation = validateProject(project);
      sendJson(response, 200, { valid: validation.errors.length === 0, ...validation });
      return;
    }

    if (request.method === "POST" && request.url === "/runs") {
      const project = await readJson(request);
      const validation = validateProject(project);
      if (validation.errors.length > 0) {
        sendJson(response, 400, { status: "rejected", message: "Project validation failed.", validation });
        return;
      }

      const { runId, runDir } = persistRunRequest(project, officialFvsAvailable() ? "running" : "fvs-unavailable");

      if (!officialFvsAvailable()) {
        sendJson(response, 503, {
          run_id: runId,
          status: "fvs_unavailable",
          message: "The official USDA Forest Service Northeast FVS executable is not configured on this server.",
          required_env: "AAC_FVS_NE_PATH",
          validation,
          health: healthPayload()
        });
        return;
      }

      const result = await executeOfficialFvsRun(project, runDir);
      writeFileSync(join(runDir, "run-result.json"), JSON.stringify(result, null, 2));
      sendJson(response, result.status === "complete" ? 200 : 500, {
        run_id: runId,
        validation,
        health: healthPayload(),
        ...result
      });
      return;
    }

    sendJson(response, 404, { message: "Not found" });
  } catch (error) {
    sendJson(response, 500, {
      message: "The AAC API could not complete the request.",
      detail: error instanceof Error ? error.message : String(error)
    });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`WoodWise AAC API listening at http://127.0.0.1:${port}`);
  console.log(officialFvsAvailable() ? `Using official Northeast FVS at ${fvsPath}` : "Official Northeast FVS is not configured.");
});

function setCors(response, origin) {
  const allowOrigin = allowedOrigins.includes("*") || allowedOrigins.includes(origin) ? origin || "*" : allowedOrigins[0] || "*";
  response.setHeader("Access-Control-Allow-Origin", allowOrigin);
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload, null, 2));
}

function readJson(request) {
  return new Promise((resolveRead, rejectRead) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        rejectRead(new Error("Request body is too large."));
        request.destroy();
      }
    });
    request.on("end", () => resolveRead(body ? JSON.parse(body) : {}));
    request.on("error", rejectRead);
  });
}

function officialFvsAvailable() {
  return Boolean(fvsPath && existsSync(fvsPath));
}

function healthPayload() {
  return {
    reachable: true,
    ready: officialFvsAvailable(),
    variant: "NE",
    fvsRuntime: officialFvsAvailable() ? "official" : "unavailable",
    fvsPathConfigured: Boolean(fvsPath),
    fvsPath: officialFvsAvailable() ? fvsPath : undefined,
    version: "0.2.0"
  };
}

function validateProject(project) {
  const errors = [];
  const warnings = [];
  const property = project.property || {};
  const strata = Array.isArray(project.strata) ? project.strata : [];

  if (!String(property.propertyName || "").trim()) errors.push("Property name is required.");
  if (!Number.isFinite(Number(property.inventoryYear))) errors.push("Inventory year is required.");
  if (Number(property.totalOwnershipAcres) <= 0) errors.push("Total ownership acres must be greater than zero.");
  if (strata.length === 0) errors.push("At least one forest stratum is required.");

  const modeledAcres = strata.reduce((sum, stratum) => sum + Number(stratum.acres || 0), 0);
  if (modeledAcres > Number(property.totalOwnershipAcres || 0)) warnings.push("Modeled acres exceed total ownership acres.");

  strata.forEach((stratum, index) => {
    const label = stratum.name || `Stratum ${index + 1}`;
    if (Number(stratum.acres) <= 0) errors.push(`${label}: acres must be greater than zero.`);
    if (!["1", "2", "3"].includes(String(stratum.siteClass))) errors.push(`${label}: site class must be 1, 2, or 3.`);
    if (Number(stratum.basalArea) <= 0) errors.push(`${label}: basal area must be greater than zero.`);
    if (Number(stratum.meanDbh) <= 0) errors.push(`${label}: mean DBH must be greater than zero.`);
    if (Number(stratum.operablePercent) < 0 || Number(stratum.operablePercent) > 100) errors.push(`${label}: operable percent must be between 0 and 100.`);
  });

  if (!officialFvsAvailable()) warnings.push("Official Northeast FVS is not configured; set AAC_FVS_NE_PATH before production runs.");
  return { errors, warnings };
}

function persistRunRequest(project, status) {
  const runId = randomUUID();
  const payload = JSON.stringify(project, null, 2);
  const manifest = {
    run_id: runId,
    status,
    received_at: new Date().toISOString(),
    variant: "NE",
    input_sha256: createHash("sha256").update(payload).digest("hex"),
    fvs_runtime: officialFvsAvailable() ? "official" : "unavailable",
    fvs_path: officialFvsAvailable() ? fvsPath : undefined
  };
  const runDir = join(tempDir, runId);
  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(runDir, "project.json"), payload);
  writeFileSync(join(runDir, "run-manifest.json"), JSON.stringify(manifest, null, 2));
  return { runId, runDir };
}

async function executeOfficialFvsRun(project, runDir) {
  const property = project.property || {};
  const strata = project.strata || [];
  const projection = project.projection || {};
  const cycleYears = Number(projection.cycleYears || 10);
  const projectionYears = Number(projection.years || 40);
  const cycles = Math.max(2, Math.ceil(projectionYears / cycleYears) + 1);
  const stratumResults = [];

  for (let index = 0; index < strata.length; index += 1) {
    const stratum = strata[index];
    const standId = sanitizeFileName(stratum.name || `stratum-${index + 1}`);
    const stratumDir = join(runDir, `${String(index + 1).padStart(2, "0")}-${standId}`);
    mkdirSync(stratumDir, { recursive: true });

    const keywordFile = writeKeywordFile(property, stratum, cycles, cycleYears);
    const treeFile = writeTreeFile(stratum);
    writeFileSync(join(stratumDir, "input.key"), keywordFile);
    writeFileSync(join(stratumDir, "input.tre"), treeFile);

    const run = await runFvs(join(stratumDir, "input.key"), stratumDir);
    const files = collectTextFiles(stratumDir);
    const parsed = uniquePointsByYear(parseFvsOutput(files["input.sum"] || files["input.out"] || ""));

    stratumResults.push({
      stratum: stratum.name,
      acres: Number(stratum.acres || 0),
      status: run.code === 0 || Boolean(files["input.sum"]) ? "complete" : "failed",
      exitCode: run.code,
      stdout: run.stdout,
      stderr: run.stderr,
      outputFiles: Object.keys(files),
      initial: parsed[0],
      final: parsed[parsed.length - 1],
      series: parsed
    });
  }

  const failed = stratumResults.filter((item) => item.status !== "complete");
  const aggregate = aggregateStrata(stratumResults);
  const report = {
    status: failed.length ? "failed" : "complete",
    message: failed.length
      ? `${failed.length} stratum FVS run(s) failed. Raw files were saved under ${runDir}.`
      : "Official Northeast FVS completed for every stratum in the submitted property.",
    run_package_path: runDir,
    model_level: "strata-level representative stands",
    caveat: "This is an official FVS runtime smoke test from summarized strata inputs. Production-grade AAC still needs plot/tree-list fitting, treatment alternatives, and forestry review.",
    aggregate,
    strata: stratumResults
  };

  writeFileSync(join(runDir, "aac-report.json"), JSON.stringify(report, null, 2));
  writeFileSync(join(runDir, "aac-report.csv"), aggregateToCsv(aggregate));
  return report;
}

function writeKeywordFile(property, stratum, cycles, cycleYears) {
  return [
    "SCREEN",
    "NOAUTOES",
    "STATS",
    "STDIDENT",
    fixedText(stratum.name || property.propertyName || "WoodWise", 8, 72),
    "* WoodWise strata-level official FVS smoke run",
    "DESIGN        -15.0       0.0",
    `STDINFO    ${numberField(922, 10, 0)}                60.0     315.0      30.0      20.0`,
    `SITECODE    ${numberField(siteSpeciesCode(stratum), 8, 0)}${numberField(siteIndex(stratum), 10, 0)}`,
    `INVYEAR       ${Number(property.inventoryYear || new Date().getFullYear()).toFixed(1)}`,
    `NUMCYCLE        ${Number(cycles).toFixed(1)}`,
    `TIMEINT         0.0       ${Number(cycleYears).toFixed(1)}`,
    "TREEFMT",
    "(I4,I8,F8.4,I2,A8,F8.2,F8.2,F8.2,F8.2,F8.2,I4,6I4,I4,I4,5I4,F8.0)",
    "",
    "TREEDATA",
    "ECHOSUM",
    "FMIN",
    "CARBCALC         0         0",
    "CARBREPT",
    "END",
    "PROCESS",
    "STOP"
  ].join("\n") + "\n";
}

function writeTreeFile(stratum) {
  const qmd = Number(stratum.meanDbh || 0) * (stratum.meanDbhBasis === "arithmetic" ? 1.04 : 1);
  const basalArea = Number(stratum.basalArea || 0);
  const totalTpa = basalArea / (0.005454 * qmd ** 2);
  const speciesMix = speciesMixForStratum(stratum);
  const rows = speciesMix.map((entry, index) => {
    const dbh = Math.max(1, qmd * entry.dbhFactor);
    const tpa = totalTpa * entry.share;
    const fvsExpansion = tpa * speciesMix.length / 15;
    const height = Math.min(110, Math.max(25, dbh * 4.8 + siteIndex(stratum) * 0.35));
    return writeTreeRecord({
      plotNumber: index + 1,
      treeId: index + 1,
      species: entry.species,
      dbh,
      tpa: fvsExpansion,
      height,
      crownRatio: entry.crownRatio
    });
  });
  return `${[...rows, "-999"].join("\n")}\n`;
}

function speciesMixForStratum(stratum) {
  const id = String(stratum.forestCoverTypeId || "").toLowerCase();
  if (id.includes("plantation") || id.includes("white-pine")) {
    return [
      { species: "WP", share: 0.9, dbhFactor: 1, crownRatio: 42 },
      { species: "RM", share: 0.1, dbhFactor: 0.85, crownRatio: 35 }
    ];
  }
  if (id === "saf-22" || id.includes("hemlock") || id.includes("softwood")) {
    return [
      { species: "WP", share: 0.35, dbhFactor: 1.08, crownRatio: 42 },
      { species: "EH", share: 0.3, dbhFactor: 0.92, crownRatio: 46 },
      { species: "RM", share: 0.2, dbhFactor: 0.95, crownRatio: 36 },
      { species: "SM", share: 0.15, dbhFactor: 0.9, crownRatio: 34 }
    ];
  }
  if (id === "saf-108") {
    return [
      { species: "RM", share: 0.45, dbhFactor: 1, crownRatio: 36 },
      { species: "SM", share: 0.3, dbhFactor: 0.95, crownRatio: 35 },
      { species: "AB", share: 0.15, dbhFactor: 0.9, crownRatio: 34 },
      { species: "YB", share: 0.1, dbhFactor: 1.05, crownRatio: 35 }
    ];
  }
  return [
    { species: "SM", share: 0.35, dbhFactor: 1, crownRatio: 36 },
    { species: "RM", share: 0.25, dbhFactor: 0.95, crownRatio: 35 },
    { species: "AB", share: 0.15, dbhFactor: 0.9, crownRatio: 34 },
    { species: "YB", share: 0.15, dbhFactor: 1.05, crownRatio: 36 },
    { species: "BC", share: 0.1, dbhFactor: 1.1, crownRatio: 34 }
  ];
}

function writeTreeRecord(record) {
  return [
    intField(record.plotNumber, 4),
    intField(record.treeId, 8),
    numberField(record.tpa, 8, 4),
    intField(1, 2),
    textField(record.species, 8),
    numberField(record.dbh, 8, 2),
    numberField(0, 8, 2),
    numberField(record.height, 8, 2),
    numberField(0, 8, 2),
    numberField(0, 8, 2),
    intField(record.crownRatio, 4),
    intField(0, 4),
    intField(0, 4),
    intField(0, 4),
    intField(0, 4),
    intField(0, 4),
    intField(0, 4),
    intField(1, 4),
    intField(0, 4),
    intField(0, 4),
    intField(0, 4),
    intField(0, 4),
    intField(0, 4),
    numberField(0, 8, 0)
  ].join("");
}

function runFvs(keywordPath, cwd) {
  return new Promise((resolveRun) => {
    const child = spawn(fvsPath, [`--keywordfile=${keywordPath}`], { cwd, windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      resolveRun({ code: -1, stdout, stderr: `${stderr}\n${error.message}` });
    });
    child.on("close", (code) => {
      resolveRun({ code, stdout, stderr });
    });
  });
}

function collectTextFiles(folder) {
  const files = {};
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (!/\.(out|txt|key|csv|err|log|sum|tre)$/i.test(entry.name)) continue;
    files[entry.name] = readFileSync(join(folder, entry.name), "utf8");
  }
  return files;
}

function parseFvsOutput(text) {
  return text
    .split(/\r?\n/)
    .map((line) => {
      if (!/^\d{4}\s+/.test(line)) return undefined;
      const fields = line.trim().split(/\s+/);
      if (fields.length < 18) return undefined;
      const values = fields.map(Number);
      if (![values[0], values[2], values[3], values[8], values[9]].every(Number.isFinite)) return undefined;
      return {
        year: values[0],
        age: values[1],
        treesPerAcre: values[2],
        basalAreaFt2PerAcre: values[3],
        totalVolumeCuFtPerAcre: values[8],
        merchantableVolumeCuFtPerAcre: values[9],
        removedTreesPerAcre: values[12],
        removedTotalVolumeCuFtPerAcre: values[13],
        removedMerchantableVolumeCuFtPerAcre: values[14],
        afterTreatmentBasalAreaFt2PerAcre: values[17]
      };
    })
    .filter(Boolean);
}

function aggregateStrata(stratumResults) {
  const years = [...new Set(stratumResults.flatMap((stratum) => stratum.series.map((point) => point.year)))].sort((left, right) => left - right);
  return years.map((year) => {
    const rows = stratumResults.flatMap((stratum) => {
      const point = stratum.series.find((candidate) => candidate.year === year);
      return point ? [{ point, acres: stratum.acres }] : [];
    });
    const acres = rows.reduce((sum, row) => sum + row.acres, 0);
    return {
      year,
      acres,
      treesPerAcre: weightedAverage(rows, "treesPerAcre"),
      basalAreaFt2PerAcre: weightedAverage(rows, "basalAreaFt2PerAcre"),
      totalVolumeCuFt: rows.reduce((sum, row) => sum + row.point.totalVolumeCuFtPerAcre * row.acres, 0),
      merchantableVolumeCuFt: rows.reduce((sum, row) => sum + row.point.merchantableVolumeCuFtPerAcre * row.acres, 0),
      totalVolumeCuFtPerAcre: weightedAverage(rows, "totalVolumeCuFtPerAcre"),
      merchantableVolumeCuFtPerAcre: weightedAverage(rows, "merchantableVolumeCuFtPerAcre")
    };
  });
}

function weightedAverage(rows, key) {
  const acres = rows.reduce((sum, row) => sum + row.acres, 0);
  if (!acres) return 0;
  return rows.reduce((sum, row) => sum + Number(row.point[key] || 0) * row.acres, 0) / acres;
}

function aggregateToCsv(rows) {
  const headers = ["year", "acres", "treesPerAcre", "basalAreaFt2PerAcre", "totalVolumeCuFt", "merchantableVolumeCuFt", "totalVolumeCuFtPerAcre", "merchantableVolumeCuFtPerAcre"];
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => Number.isFinite(row[header]) ? round(row[header]) : row[header]).join(","))
  ].join("\n") + "\n";
}

function siteSpeciesCode(stratum) {
  const id = String(stratum.forestCoverTypeId || "").toLowerCase();
  if (id.includes("plantation") || id.includes("white-pine") || id === "saf-22") return 9;
  return 27;
}

function siteIndex(stratum) {
  if (stratum.siteClass === "1") return 70;
  if (stratum.siteClass === "3") return 45;
  return 56;
}

function sanitizeFileName(value) {
  return String(value).replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "stratum";
}

function uniquePointsByYear(points) {
  const byYear = new Map();
  for (const point of points) {
    if (!byYear.has(point.year)) byYear.set(point.year, point);
  }
  return [...byYear.values()];
}

function fixedText(value, firstColumn, width) {
  return `${" ".repeat(Math.max(0, firstColumn - 1))}${String(value).slice(0, width)}`;
}

function textField(value, width) {
  return String(value).slice(0, width).padEnd(width, " ");
}

function intField(value, width) {
  return Math.round(Number(value) || 0).toString().padStart(width, " ");
}

function numberField(value, width, decimals) {
  return (Number(value) || 0).toFixed(decimals).padStart(width, " ");
}

function round(value) {
  return Math.round(Number(value) * 100) / 100;
}
