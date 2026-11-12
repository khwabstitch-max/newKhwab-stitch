import { expect, it } from "vitest";
import { amountInput, parseAmount, parsePercentage, businessDateInput, businessDateIso } from "../lib/admin-values";

it("converts rupee input to exact integer paise without floating point rounding", () => {
  expect(parseAmount("123.45")).toBe(12345);
  expect(parseAmount("0.29")).toBe(29);
  expect(parseAmount(".05")).toBe(5);
  expect(parseAmount("१२३.४५")).toBe(12345);
  expect(parseAmount("-12.34", { signed: true })).toBe(-1234);
  expect(parseAmount("", { optional: true })).toBeNull();
  expect(amountInput(-1234)).toBe("-12.34");
  expect(amountInput(1)).toBe("0.01");
  expect(amountInput(null)).toBe("");
  for (const invalid of ["-1", "1.001", "1e3", "Infinity", "90071992547409.92"]) {
    expect(() => parseAmount(invalid)).toThrow();
  }
});

it("converts percentage input to bounded basis points", () => {
  expect(parsePercentage("12.5")).toBe(1250);
  expect(parsePercentage("100")).toBe(10000);
  expect(() => parsePercentage("100.01")).toThrow();
  expect(() => parsePercentage("-1")).toThrow();
});

it("round-trips scheduled India time independently of the operator's browser timezone", () => {
  expect(businessDateInput("2026-11-12T04:30:00.000Z")).toBe("2026-11-12T10:00");
  expect(businessDateIso("2026-11-12T10:00")).toBe("2026-11-12T04:30:00.000Z");
  expect(businessDateIso("2026-01-01T00:15")).toBe("2025-12-31T18:45:00.000Z");
  expect(businessDateIso("")).toBeNull();
  expect(businessDateInput("invalid")).toBe("");
  for (const invalid of ["2026-02-30T10:00", "2026-11-12T24:00", "2026-11-12 10:00", "2026-13-01T10:00"]) {
    expect(() => businessDateIso(invalid)).toThrow();
  }
});
