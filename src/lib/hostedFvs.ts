import type { PropertyInfo, Stratum } from "../types/project";

export interface FvsAggregateRow {
  year: number;
  acres: number;
  treesPerAcre: number;
  basalAreaFt2PerAcre: number;
  totalVolumeCuFt: number;
  merchantableVolumeCuFt: number;
  totalVolumeCuFtPerAcre: number;
  merchantableVolumeCuFtPerAcre: number;
}

export interface HostedFvsRunResult {
  run_id: string;
  status: "complete" | "failed";
  message: string;
  aggregate: FvsAggregateRow[];
  strata: Array<{
    stratum: string;
    acres: number;
    status: "complete" | "failed";
    exitCode?: number;
    initial?: FvsPoint;
    final?: FvsPoint;
    outputFiles: string[];
    error?: string;
  }>;
}

interface FvsBridgeResponse {
  ok: boolean;
  code?: number;
  error?: string;
  stderr?: string;
  files?: Record<string, string>;
}

interface FvsPoint {
  year: number;
  age: number;
  treesPerAcre: number;
  basalAreaFt2PerAcre: number;
  totalVolumeCuFtPerAcre: number;
  merchantableVolumeCuFtPerAcre: number;
  removedTreesPerAcre: number;
  removedTotalVolumeCuFtPerAcre: number;
  removedMerchantableVolumeCuFtPerAcre: number;
  afterTreatmentBasalAreaFt2PerAcre: number;
}

export async function runHostedFvsProject(apiBaseUrl: string, property: PropertyInfo, strata: Stratum[]): Promise<HostedFvsRunResult> {
  const runId = crypto.randomUUID();
  const endpoint = `${apiBaseUrl.replace(/\/$/, "")}/run`;
  const stratumResults = [];

  for (let index = 0; index < strata.length; index += 1) {
    const stratum = strata[index];
    const bridge = await runHostedStratum(endpoint, property, stratum, index + 1);
    const files = bridge.files ?? {};
    const series = uniquePointsByYear(parseFvsOutput([files["input.sum"], files["input.out"]].filter(Boolean).join("\n")));
    const complete = bridge.ok && series.length > 0;

    stratumResults.push({
      stratum: stratum.name,
      acres: Number(stratum.acres || 0),
      status: complete ? "complete" as const : "failed" as const,
      exitCode: bridge.code,
      initial: series[0],
      final: series[series.length - 1],
      series,
      outputFiles: Object.keys(files),
      error: bridge.error || bridge.stderr
    });
  }

  const failed = stratumResults.filter((item) => item.status !== "complete");
  return {
    run_id: runId,
    status: failed.length ? "failed" : "complete",
    message: failed.length
      ? `${failed.length} stratum FVS run(s) failed at the hosted FVS API.`
      : "Official Northeast FVS completed for every stratum at the hosted FVS API.",
    aggregate: aggregateStrata(stratumResults),
    strata: stratumResults.map(({ series: _series, ...item }) => item)
  };
}

async function runHostedStratum(endpoint: string, property: PropertyInfo, stratum: Stratum, index: number): Promise<FvsBridgeResponse> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      variant: "NE",
      scenarioId: sanitizeFileName(stratum.name || `stratum-${index}`),
      keywordFile: writeKeywordFile(property, stratum),
      treeFile: writeTreeFile(stratum)
    })
  });

  const result = await response.json() as FvsBridgeResponse;
  if (!response.ok) {
    return { ...result, ok: false, error: result.error || `Hosted FVS API returned ${response.status}` };
  }
  return result;
}

function writeKeywordFile(property: PropertyInfo, stratum: Stratum): string {
  const cycleYears = 10;
  const cycles = 5;
  return [
    "SCREEN",
    "NOAUTOES",
    "STATS",
    "STDIDENT",
    fixedText(stratum.name || property.propertyName || "WoodWise", 8, 72),
    "* WoodWise hosted FVS run",
    "DESIGN        -15.0       0.0",
    `STDINFO    ${numberField(922, 10, 0)}                60.0     315.0      30.0      20.0`,
    `SITECODE    ${numberField(siteSpeciesCode(stratum), 8, 0)}${numberField(siteIndex(stratum), 10, 0)}`,
    `INVYEAR       ${Number(property.inventoryYear || new Date().getFullYear()).toFixed(1)}`,
    `NUMCYCLE        ${cycles.toFixed(1)}`,
    `TIMEINT         0.0       ${cycleYears.toFixed(1)}`,
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

function writeTreeFile(stratum: Stratum): string {
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

function speciesMixForStratum(stratum: Stratum) {
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

function writeTreeRecord(record: { plotNumber: number; treeId: number; species: string; dbh: number; tpa: number; height: number; crownRatio: number }): string {
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

function parseFvsOutput(text: string): FvsPoint[] {
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
    .filter((point): point is FvsPoint => Boolean(point));
}

function aggregateStrata(stratumResults: Array<{ acres: number; series: FvsPoint[] }>): FvsAggregateRow[] {
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

function weightedAverage(rows: Array<{ point: FvsPoint; acres: number }>, key: keyof FvsPoint) {
  const acres = rows.reduce((sum, row) => sum + row.acres, 0);
  if (!acres) return 0;
  return rows.reduce((sum, row) => sum + Number(row.point[key] || 0) * row.acres, 0) / acres;
}

function uniquePointsByYear(points: FvsPoint[]) {
  const byYear = new Map<number, FvsPoint>();
  for (const point of points) {
    if (!byYear.has(point.year)) byYear.set(point.year, point);
  }
  return [...byYear.values()];
}

function siteSpeciesCode(stratum: Stratum) {
  const id = String(stratum.forestCoverTypeId || "").toLowerCase();
  if (id.includes("plantation") || id.includes("white-pine") || id === "saf-22") return 9;
  return 27;
}

function siteIndex(stratum: Stratum) {
  if (stratum.siteClass === "1") return 70;
  if (stratum.siteClass === "3") return 45;
  return 56;
}

function sanitizeFileName(value: string) {
  return String(value).replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "stratum";
}

function fixedText(value: string, firstColumn: number, width: number) {
  return `${" ".repeat(Math.max(0, firstColumn - 1))}${String(value).slice(0, width)}`;
}

function textField(value: string, width: number) {
  return String(value).slice(0, width).padEnd(width, " ");
}

function intField(value: number, width: number) {
  return Math.round(Number(value) || 0).toString().padStart(width, " ");
}

function numberField(value: number, width: number, decimals: number) {
  return (Number(value) || 0).toFixed(decimals).padStart(width, " ");
}
