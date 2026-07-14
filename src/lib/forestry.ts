import forestTypesConfig from "../config/forest-cover-types.json";
import type { PropertyInfo, Stratum, SyntheticMetric, ValidationMessage } from "../types/project";

export const forestTypeGroups = forestTypesConfig.groups;
export const forestTypes = forestTypeGroups.flatMap((group) =>
  group.types.map((type) => ({ ...type, group: group.name }))
);

export function formatForestType(id: string): string {
  const type = forestTypes.find((item) => item.id === id);
  if (!type) return "Unknown forest type";
  return "safNumber" in type && type.safNumber
    ? `Type ${type.safNumber} - ${type.name}`
    : type.name;
}

export function createStratum(index = 1): Stratum {
  return {
    id: crypto.randomUUID(),
    name: `Stratum ${index}`,
    acres: 100,
    forestCoverTypeId: "saf-25",
    siteClass: "2",
    basalArea: 90,
    meanDbh: 12,
    meanDbhBasis: "unknown",
    operablePercent: 90,
    structure: "mixed/unknown",
    notes: ""
  };
}

export const defaultProperty: PropertyInfo = {
  propertyName: "WoodWise demonstration tract",
  inventoryYear: new Date().getFullYear(),
  county: "New York / Northeast FVS location pending",
  totalOwnershipAcres: 1000,
  reservedAcres: 0,
  inventoryConfidenceDeduction: 0,
  harvestLossDeduction: 0,
  desiredInventoryBuildup: 0,
  analystName: "",
  clientName: "",
  notes: ""
};

export function validateProject(property: PropertyInfo, strata: Stratum[]): ValidationMessage[] {
  const messages: ValidationMessage[] = [];
  if (!property.propertyName.trim()) messages.push({ level: "error", text: "Property name is required." });
  if (!Number.isInteger(property.inventoryYear) || property.inventoryYear < 1900 || property.inventoryYear > 2100) {
    messages.push({ level: "error", text: "Inventory year must be a four-digit year." });
  }
  if (property.totalOwnershipAcres <= 0) messages.push({ level: "error", text: "Total ownership acres must be greater than zero." });
  if (property.reservedAcres < 0) messages.push({ level: "error", text: "Reserved acres cannot be negative." });

  const modeledAcres = strata.reduce((sum, stratum) => sum + Number(stratum.acres || 0), 0);
  if (modeledAcres > property.totalOwnershipAcres) {
    messages.push({ level: "warning", text: "Modeled stratum acres exceed total ownership acres. Production runs should require explicit confirmation." });
  }
  if (strata.length === 0) messages.push({ level: "error", text: "At least one forest stratum is required." });

  strata.forEach((stratum, index) => {
    const label = stratum.name || `Stratum ${index + 1}`;
    if (!stratum.name.trim()) messages.push({ level: "error", text: `${label}: stratum name is required.`, target: stratum.id });
    if (stratum.acres <= 0) messages.push({ level: "error", text: `${label}: acres must be greater than zero.`, target: stratum.id });
    if (!forestTypes.some((type) => type.id === stratum.forestCoverTypeId)) {
      messages.push({ level: "error", text: `${label}: forest cover type is not recognized.`, target: stratum.id });
    }
    if (!["1", "2", "3"].includes(stratum.siteClass)) messages.push({ level: "error", text: `${label}: site class must be 1, 2, or 3.`, target: stratum.id });
    if (stratum.basalArea <= 0) messages.push({ level: "error", text: `${label}: basal area must be greater than zero.`, target: stratum.id });
    if (stratum.meanDbh <= 0) messages.push({ level: "error", text: `${label}: mean DBH must be greater than zero.`, target: stratum.id });
    if (stratum.operablePercent < 0 || stratum.operablePercent > 100) {
      messages.push({ level: "error", text: `${label}: operable percent must be between 0 and 100.`, target: stratum.id });
    }
    if (!stratum.currentSawtimberMbfPerAcre && !stratum.currentGreenTonsPerAcre) {
      messages.push({ level: "warning", text: `${label}: no current volume calibration values supplied.`, target: stratum.id });
    }
    if (stratum.operablePercent < 15) messages.push({ level: "warning", text: `${label}: stratum is nearly inoperable.`, target: stratum.id });
  });

  messages.push({
    level: "info",
    text: "Official Northeast FVS is not connected in this foundation build; synthetic inventory previews are audit checks only."
  });
  return messages;
}

export function syntheticMetrics(strata: Stratum[]): SyntheticMetric[] {
  return strata.map((stratum) => {
    const qmd = stratum.meanDbhBasis === "arithmetic" ? stratum.meanDbh * 1.04 : stratum.meanDbh;
    const treesPerAcre = stratum.basalArea / (0.005454 * qmd ** 2);
    const siteMultiplier = stratum.siteClass === "1" ? 1.12 : stratum.siteClass === "3" ? 0.88 : 1;
    const sawFactor = qmd >= 14 ? 0.075 : qmd >= 11 ? 0.035 : 0.012;
    const greenFactor = qmd >= 8 ? 0.62 : 0.38;
    return {
      stratumId: stratum.id,
      generatedBasalArea: round(stratum.basalArea),
      generatedMeanDbh: round(qmd),
      treesPerAcre: round(treesPerAcre),
      sawtimberMbfPerAcre: round(stratum.basalArea * sawFactor * siteMultiplier),
      greenTonsPerAcre: round(stratum.basalArea * greenFactor * siteMultiplier),
      warning: stratum.meanDbhBasis === "unknown" ? "Management-plan mean DBH treated as QMD for this preview." : undefined
    };
  });
}

export function reportTotals(property: PropertyInfo, strata: Stratum[], metrics: SyntheticMetric[]) {
  const modeledAcres = strata.reduce((sum, item) => sum + item.acres, 0);
  const operableAcres = strata.reduce((sum, item) => sum + item.acres * (item.operablePercent / 100), 0);
  const sawInventory = strata.reduce((sum, item) => {
    const metric = metrics.find((entry) => entry.stratumId === item.id);
    return sum + item.acres * (metric?.sawtimberMbfPerAcre ?? 0);
  }, 0);
  const greenInventory = strata.reduce((sum, item) => {
    const metric = metrics.find((entry) => entry.stratumId === item.id);
    return sum + item.acres * (metric?.greenTonsPerAcre ?? 0);
  }, 0);
  const deductions =
    (property.inventoryConfidenceDeduction + property.harvestLossDeduction + property.desiredInventoryBuildup) / 100;
  return {
    modeledAcres,
    operableAcres,
    sawInventory,
    greenInventory,
    biologicalSawAac: sawInventory / 40,
    biologicalGreenAac: greenInventory / 40,
    planningSawAac: (sawInventory / 40) * Math.max(0, 1 - deductions),
    planningGreenAac: (greenInventory / 40) * Math.max(0, 1 - deductions)
  };
}

export function strataToCsv(strata: Stratum[]): string {
  const fields = ["name", "acres", "forestCoverTypeId", "siteClass", "basalArea", "meanDbh", "meanDbhBasis", "operablePercent", "structure", "currentSawtimberMbfPerAcre", "currentGreenTonsPerAcre", "notes"];
  const header = ["stratumOrStand", "acres", "forestCoverTypeId", "siteClass", "basalArea", "meanDbh", "meanDbhBasis", "operablePercent", "structure", "currentSawtimberMbfPerAcre", "currentGreenTonsPerAcre", "notes"];
  const rows = strata.map((item) => fields.map((key) => csvCell(String(item[key as keyof Stratum] ?? ""))).join(","));
  return [header.join(","), ...rows].join("\n");
}

export function csvToStrata(csv: string): Stratum[] {
  const text = csv.trim().replace(/^\uFEFF/, "");
  if (!text) return [];

  const [headerLine, ...lines] = text.split(/\r?\n/);
  const delimiter = detectDelimiter(headerLine);
  const headers = parseDelimitedLine(headerLine, delimiter).map(normalizeHeader);

  return lines.filter((line) => line.trim()).map((line, index) => {
    const cells = parseDelimitedLine(line, delimiter);
    const record = Object.fromEntries(headers.map((header, i) => [header, cells[i]?.trim() ?? ""]));
    return {
      ...createStratum(index + 1),
      name: record.name || `Imported stratum ${index + 1}`,
      acres: parseNumber(record.acres),
      forestCoverTypeId: normalizeForestType(record.forestCoverTypeId || record.forestCoverType || record.forestType),
      siteClass: normalizeSiteClass(record.siteClass),
      basalArea: parseNumber(record.basalArea),
      meanDbh: parseNumber(record.meanDbh),
      meanDbhBasis: normalizeDbhBasis(record.meanDbhBasis),
      operablePercent: parseNumber(record.operablePercent),
      structure: (record.structure || "mixed/unknown") as Stratum["structure"],
      currentSawtimberMbfPerAcre: parseOptionalNumber(record.currentSawtimberMbfPerAcre),
      currentGreenTonsPerAcre: parseOptionalNumber(record.currentGreenTonsPerAcre),
      notes: record.notes || ""
    };
  });
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function detectDelimiter(headerLine: string): "," | "\t" {
  return headerLine.includes("\t") && headerLine.split("\t").length >= headerLine.split(",").length ? "\t" : ",";
}

function parseDelimitedLine(line: string, delimiter: "," | "\t"): string[] {
  if (delimiter === "\t") return line.split("\t").map(unquoteCell);

  const cells: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += char;
    }
  }

  cells.push(cell.trim());
  return cells.map(unquoteCell);
}

function unquoteCell(value: string): string {
  return value.trim().replace(/^"|"$/g, "").replaceAll('""', '"');
}

function normalizeHeader(header: string): string {
  const key = header.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const aliases: Record<string, string> = {
    stratum: "name",
    stratumorstand: "name",
    stratumname: "name",
    stand: "name",
    standname: "name",
    name: "name",
    acres: "acres",
    acre: "acres",
    forestcovertypeid: "forestCoverTypeId",
    forestcovertype: "forestCoverType",
    foresttype: "forestType",
    covertype: "forestCoverType",
    saf: "forestCoverType",
    site: "siteClass",
    siteclass: "siteClass",
    basalarea: "basalArea",
    basalareaac: "basalArea",
    ba: "basalArea",
    baac: "basalArea",
    meandbh: "meanDbh",
    dbh: "meanDbh",
    basis: "meanDbhBasis",
    meandbhbasis: "meanDbhBasis",
    operable: "operablePercent",
    operablepercent: "operablePercent",
    operablepct: "operablePercent",
    structure: "structure",
    standstructure: "structure",
    currentsawtimbermbfperacre: "currentSawtimberMbfPerAcre",
    sawtimbermbfperacre: "currentSawtimberMbfPerAcre",
    sawtimbermbfac: "currentSawtimberMbfPerAcre",
    mbfperacre: "currentSawtimberMbfPerAcre",
    mbfac: "currentSawtimberMbfPerAcre",
    currentgreentonsperacre: "currentGreenTonsPerAcre",
    greentonsperacre: "currentGreenTonsPerAcre",
    greentonsac: "currentGreenTonsPerAcre",
    tonsperacre: "currentGreenTonsPerAcre",
    tonsac: "currentGreenTonsPerAcre",
    notes: "notes",
    note: "notes"
  };
  return aliases[key] || key;
}

function normalizeForestType(value?: string): string {
  const raw = (value || "").trim();
  if (!raw) return "saf-25";
  if (forestTypes.some((type) => type.id === raw)) return raw;

  const safMatch = raw.match(/\b(?:type\s*)?(\d{1,3})\b/i);
  if (safMatch) {
    const id = `saf-${safMatch[1]}`;
    if (forestTypes.some((type) => type.id === id)) return id;
  }

  const normalized = raw.toLowerCase().replace(/^type\s+\d+\s*[-—–]\s*/, "").replace(/[—–]/g, "-");
  const match = forestTypes.find((type) => type.name.toLowerCase() === normalized);
  return match?.id || raw || "saf-25";
}

function normalizeSiteClass(value?: string): Stratum["siteClass"] {
  const match = String(value || "2").match(/[123]/);
  return (match?.[0] || "2") as Stratum["siteClass"];
}

function normalizeDbhBasis(value?: string): Stratum["meanDbhBasis"] {
  const normalized = String(value || "unknown").trim().toLowerCase();
  if (normalized.includes("qmd") || normalized.includes("quadratic")) return "qmd";
  if (normalized.includes("arith")) return "arithmetic";
  return "unknown";
}

function parseNumber(value?: string): number {
  const cleaned = String(value || "").replace(/,/g, "").replace(/%/g, "").trim();
  return Number(cleaned || 0);
}

function parseOptionalNumber(value?: string): number | undefined {
  const cleaned = String(value || "").replace(/,/g, "").replace(/%/g, "").trim();
  return cleaned ? Number(cleaned) : undefined;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
