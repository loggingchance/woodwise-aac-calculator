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
    residualBaFloor: 55,
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
  const header = ["name", "acres", "forestCoverTypeId", "siteClass", "basalArea", "meanDbh", "meanDbhBasis", "operablePercent", "structure", "residualBaFloor", "notes"];
  const rows = strata.map((item) => header.map((key) => csvCell(String(item[key as keyof Stratum] ?? ""))).join(","));
  return [header.join(","), ...rows].join("\n");
}

export function csvToStrata(csv: string): Stratum[] {
  const [headerLine, ...lines] = csv.trim().split(/\r?\n/);
  const headers = headerLine.split(",").map((header) => header.trim());
  return lines.filter(Boolean).map((line, index) => {
    const cells = line.split(",").map((cell) => cell.trim().replace(/^"|"$/g, ""));
    const record = Object.fromEntries(headers.map((header, i) => [header, cells[i] ?? ""]));
    return {
      ...createStratum(index + 1),
      name: record.name || `Imported stratum ${index + 1}`,
      acres: Number(record.acres || 0),
      forestCoverTypeId: record.forestCoverTypeId || "saf-25",
      siteClass: (record.siteClass || "2") as Stratum["siteClass"],
      basalArea: Number(record.basalArea || 0),
      meanDbh: Number(record.meanDbh || 0),
      meanDbhBasis: (record.meanDbhBasis || "unknown") as Stratum["meanDbhBasis"],
      operablePercent: Number(record.operablePercent || 0),
      structure: (record.structure || "mixed/unknown") as Stratum["structure"],
      residualBaFloor: Number(record.residualBaFloor || 55),
      notes: record.notes || ""
    };
  });
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
