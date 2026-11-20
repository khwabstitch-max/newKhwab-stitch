const detailsForAlterations = {
  scope: "Describe the fit, length or repair you need. The tailor confirms which changes your garment can support.",
  scopeHi: "फिटिंग, लंबाई या मरम्मत में क्या बदलाव चाहिए, यह बताएँ। दर्ज़ी कपड़ा देखकर तय करेंगे कि कौन-से बदलाव संभव हैं।",
  preparation: "Bring the garment to be altered and any matching fabric, trims or fasteners needed for the agreed work.",
  preparationHi: "जिस कपड़े में बदलाव चाहिए, वह दें। तय काम के लिए ज़रूरी मिलता-जुलता कपड़ा, सजावट या बटन/ज़िप भी साथ दें।",
  fitting: "Share your measurements, ask for guidance or send a well-fitting garment as a reference.",
  fittingHi: "अपना नाप दें, नाप लेने में मदद लें या सही फिटिंग वाला कपड़ा नमूने के तौर पर भेजें।",
  limitations: "Fabric condition, seam allowance, lining and construction determine which alterations are possible.",
  limitationsHi: "कपड़े की हालत, अंदर बचा कपड़ा, अस्तर और बनावट से तय होगा कि कौन-से बदलाव संभव हैं।",
  turnaround: "The price and completion date are confirmed after garment review.",
  turnaroundHi: "कपड़े की जाँच के बाद कीमत और काम पूरा होने की तारीख तय होगी।",
};
const garmentReview = {
  fabricRequirement: "Confirm fabric length, width, lining and trims with the tailor before cutting.",
  fabricRequirementHi: "कपड़ा काटने से पहले दर्ज़ी से कपड़े की लंबाई, चौड़ाई, अस्तर और ज़रूरी सामग्री की पुष्टि करें।",
  turnaround: "The completion date is confirmed after the design, measurements and fabric are reviewed.",
  turnaroundHi: "डिज़ाइन, नाप और कपड़े की जाँच के बाद काम पूरा होने की तारीख तय होगी।",
};
const missing = value => typeof value !== "string" || !value.trim();

// Supply service guidance, without inventing a garment's design or changing business data.
export function withProductionDesignDetails(design) {
  if (!design || typeof design !== "object") return design;
  const fallback = design.garment === "alteration" ? detailsForAlterations : garmentReview;
  const details = { ...(design.designDetails || {}) };
  let changed = false;
  for (const [key, value] of Object.entries(fallback)) {
    if (missing(details[key])) { details[key] = value; changed = true; }
  }
  if (!changed) return design;
  return { ...design, designDetails: details };
}
