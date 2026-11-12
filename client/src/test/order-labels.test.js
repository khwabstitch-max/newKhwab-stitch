import { afterEach, expect, it } from "vitest";
import { setLanguage } from "../i18n/core";
import { estimateLineLabel } from "../lib/order-labels";

afterEach(() => setLanguage("en", false));
it("localizes authoritative estimate labels and option snapshots without changing money, codes or authored text", () => {
  const estimate = {
    components: { sleeve: { optionId: "s1", name: "Puff", nameHi: "फूली आस्तीन" } },
    addons: [{ optionId: "a1", name: "Owner's own lace", nameHi: "मालिक का अपना लेस विकल्प" }],
    lineItems: [
      { code: "stitching", label: "Base stitching · Own design", amountPaise: 30000 },
      { code: "sleeve:s1", label: "Sleeve design adjustment · Puff", amountPaise: 5000 },
      { code: "sleeveLength:length1", label: "Sleeve length — no additional charge", amountPaise: 0 },
      { code: "transport:inbound", label: "inbound: customer pays their courier directly", amountPaise: 0 },
      { code: "extra:a1", label: "Owner's own lace", amountPaise: 1000 },
    ],
  };
  const before = JSON.stringify(estimate);
  setLanguage("hi", false);
  const labels = estimate.lineItems.map(line => estimateLineLabel(line, estimate, { title: "Own design", titleHi: "अपना डिज़ाइन" }));
  expect(labels[0]).toBe("मूल सिलाई · अपना डिज़ाइन");
  expect(labels[1]).toContain("फूली आस्तीन");
  expect(labels[2]).toContain("कोई अतिरिक्त शुल्क नहीं");
  expect(labels[3]).toContain("आपका चुना हुआ कुरियर");
  expect(labels[4]).toBe("मालिक का अपना लेस विकल्प");
  expect(JSON.stringify(estimate)).toBe(before);
  expect(estimateLineLabel({ code: "manual", label: "My exact original quote wording" })).toBe("My exact original quote wording");
});
it("shows included components once and keeps unquoted custom work distinct from configured adjustments", () => {
  const estimate = { components: { neck: { name: "Boat", nameHi: "नाव गला" } } };
  setLanguage("en", false);
  expect(estimateLineLabel({ code: "neck:included", label: "Front neck design · Boat · included" }, estimate)).toBe("Front neck design · Boat · included");
  setLanguage("hi", false);
  expect(estimateLineLabel({ code: "neck:reference", label: "Front neck design" })).toBe("आगे के गले का डिज़ाइन");
  expect(estimateLineLabel({ code: "transport:outbound", label: "outbound transport · Owner area" })).toContain("Owner area");
});
