export type SiteClass = "1" | "2" | "3";

export type StandStructure = "even-aged" | "uneven-aged" | "two-aged" | "mixed/unknown";

export interface PropertyInfo {
  propertyName: string;
  inventoryYear: number;
  county: string;
  totalOwnershipAcres: number;
  reservedAcres: number;
  inventoryConfidenceDeduction: number;
  harvestLossDeduction: number;
  desiredInventoryBuildup: number;
  analystName: string;
  clientName: string;
  notes: string;
}

export interface Stratum {
  id: string;
  name: string;
  acres: number;
  forestCoverTypeId: string;
  siteClass: SiteClass;
  basalArea: number;
  meanDbh: number;
  meanDbhBasis: "qmd" | "arithmetic" | "unknown";
  operablePercent: number;
  structure: StandStructure;
  currentSawtimberMbfPerAcre?: number;
  currentGreenTonsPerAcre?: number;
  residualBaFloor: number;
  notes: string;
}

export interface ValidationMessage {
  level: "error" | "warning" | "info";
  text: string;
  target?: string;
}

export interface SyntheticMetric {
  stratumId: string;
  generatedBasalArea: number;
  generatedMeanDbh: number;
  treesPerAcre: number;
  sawtimberMbfPerAcre: number;
  greenTonsPerAcre: number;
  warning?: string;
}
