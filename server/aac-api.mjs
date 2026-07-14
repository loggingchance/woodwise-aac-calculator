import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createServer } from "node:http";

const port = Number(process.env.AAC_PORT || 8787);
const allowedOrigins = (process.env.AAC_ALLOWED_ORIGINS || "*").split(",").map((item) => item.trim());
const tempDir = resolve(process.env.AAC_TEMP_DIR || ".aac-runs");
const fvsPath = process.env.AAC_FVS_NE_PATH || "";

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
      sendJson(response, 200, { valid: validateProject(project).errors.length === 0, ...validateProject(project) });
      return;
    }

    if (request.method === "POST" && request.url === "/runs") {
      const project = await readJson(request);
      const validation = validateProject(project);
      if (validation.errors.length > 0) {
        sendJson(response, 400, { status: "rejected", message: "Project validation failed.", validation });
        return;
      }

      if (!officialFvsAvailable()) {
        const runId = persistRunRequest(project, "fvs-unavailable");
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

      const runId = persistRunRequest(project, "queued");
      sendJson(response, 202, {
        run_id: runId,
        status: "queued",
        message: "Run accepted. FVS execution worker implementation is the next backend step.",
        validation,
        health: healthPayload()
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
    version: "0.1.0"
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
    fvs_runtime: officialFvsAvailable() ? "official" : "unavailable"
  };
  const runDir = join(tempDir, runId);
  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(runDir, "project.json"), payload);
  writeFileSync(join(runDir, "run-manifest.json"), JSON.stringify(manifest, null, 2));
  return runId;
}
