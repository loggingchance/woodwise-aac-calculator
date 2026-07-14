import { describe, expect, it } from "vitest";
import { createStratum, csvToStrata, forestTypes, strataToCsv, syntheticMetrics, validateProject, defaultProperty } from "../lib/forestry";

describe("WoodWise foundation forestry utilities", () => {
  it("loads all selected natural and plantation cover types", () => {
    expect(forestTypes).toHaveLength(44);
    expect(forestTypes.some((type) => type.id === "saf-25")).toBe(true);
    expect(forestTypes.some((type) => type.id === "plantation-norway-spruce")).toBe(true);
  });

  it("calculates trees per acre from basal area and QMD", () => {
    const stratum = { ...createStratum(), basalArea: 100, meanDbh: 10, meanDbhBasis: "qmd" as const };
    const [metric] = syntheticMetrics([stratum]);
    expect(metric.treesPerAcre).toBeCloseTo(183.4, 1);
  });

  it("validates hard errors for impossible strata", () => {
    const bad = { ...createStratum(), acres: 0, basalArea: -1, meanDbh: 0, operablePercent: 125 };
    const errors = validateProject(defaultProperty, [bad]).filter((message) => message.level === "error");
    expect(errors.length).toBeGreaterThanOrEqual(4);
  });

  it("round trips strata CSV", () => {
    const strata = [createStratum()];
    const imported = csvToStrata(strataToCsv(strata));
    expect(imported[0].name).toBe(strata[0].name);
    expect(imported[0].basalArea).toBe(strata[0].basalArea);
  });
});
