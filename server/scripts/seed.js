import { connect } from "./runtime.js";

const hindiTitles = {
  "Everyday cotton kurti": "रोज़मर्रा की सूती कुर्ती",
  "Classic suit silhouette": "सादगी वाला क्लासिक सूट",
  "Celebration blouse": "खास मौकों के लिए ब्लाउज़",
  "A better fit": "बेहतर फिटिंग",
};

const allSeedOptions = [
  // 8 Neck Front designs
  { name: "Round neck", kind: "neck", nameHi: "गोल गला", code: "KS-FN-01", priceMode: "included", amountPaise: 0, displayOrder: 10, description: "Classic circular curved neckline offering timeless elegance and comfort." },
  { name: "V-neck", kind: "neck", nameHi: "वी गला", code: "KS-FN-02", priceMode: "included", amountPaise: 0, displayOrder: 20, description: "Flattering angled V-cut that elongates the neck and frame beautifully." },
  { name: "Boat neck", kind: "neck", nameHi: "नाव गला", code: "KS-FN-03", priceMode: "additional", amountPaise: 5000, displayOrder: 30, description: "Wide horizontal neckline running close to the collarbone with royal modern grace." },
  { name: "Collar neck", kind: "neck", nameHi: "कॉलर वाला", code: "KS-FN-04", priceMode: "additional", amountPaise: 8000, displayOrder: 40, description: "Crisp structured shirt-style collar delivering a poised, professional silhouette." },
  { name: "Square neck", kind: "neck", nameHi: "चोकोर गला", code: "KS-FN-05", priceMode: "additional", amountPaise: 5000, displayOrder: 50, description: "Geometric sharp square cutout framing the collarbone and jewelry exquisitely." },
  { name: "Sweetheart neck", kind: "neck", nameHi: "दिल वाला गला", code: "KS-FN-06", priceMode: "additional", amountPaise: 8000, displayOrder: 60, description: "Romantic curved heart-shaped neckline accentuating graceful feminine contour." },
  { name: "High neck", kind: "neck", nameHi: "बंद गला", code: "KS-FN-07", priceMode: "additional", amountPaise: 9000, displayOrder: 70, description: "Majestic closed high collar neckline popular for royalty and winter weddings." },
  { name: "Mandarin collar", kind: "neck", nameHi: "चाइनीज गला", code: "KS-FN-08", priceMode: "additional", amountPaise: 8000, displayOrder: 80, description: "Sleek standing band collar with a subtle front slit, modern and chic." },

  // 8 Back Neck designs
  { name: "Simple back", kind: "back", nameHi: "सीधा बैक", code: "KS-BN-01", priceMode: "included", amountPaise: 0, displayOrder: 10, description: "Clean, modest, straight-cut back with high collar or minimal neckline." },
  { name: "Round back", kind: "back", nameHi: "गोल बैक", code: "KS-BN-02", priceMode: "included", amountPaise: 0, displayOrder: 20, description: "Classic smooth curved U/round back neckline offering versatile comfort." },
  { name: "V-back", kind: "back", nameHi: "वी बैक", code: "KS-BN-03", priceMode: "included", amountPaise: 0, displayOrder: 30, description: "Graceful angled V-line opening accentuating the posture and shoulder contour." },
  { name: "Square back", kind: "back", nameHi: "चौकोर बैक", code: "KS-BN-04", priceMode: "additional", amountPaise: 5000, displayOrder: 40, description: "Crisp geometric square opening with structured tailoring corners." },
  { name: "Deep back", kind: "back", nameHi: "गहरा बैक", code: "KS-BN-05", priceMode: "additional", amountPaise: 8000, displayOrder: 50, description: "Plunging glamorous back cut with optional stylish dori and latkan accents." },
  { name: "Button back", kind: "back", nameHi: "बटन वाला", code: "KS-BN-06", priceMode: "additional", amountPaise: 10000, displayOrder: 60, description: "Tailored back featuring a delicate vertical row of fabric potli buttons." },
  { name: "Cut-out back", kind: "back", nameHi: "जाली वाला", code: "KS-BN-07", priceMode: "additional", amountPaise: 12000, displayOrder: 70, description: "Designer diamond or keyhole cut-out window edged with refined piping." },
  { name: "As per photo", kind: "back", nameHi: "फोटो जैसा", code: "KS-BN-08", priceMode: "pending", amountPaise: 0, displayOrder: 80, description: "Custom back design tailored strictly to match your uploaded reference image." },

  // 11 Sleeve designs
  { name: "Straight plain sleeve", kind: "sleeve", nameHi: "सीधी बाजू", code: "KS-SD-01", priceMode: "included", amountPaise: 0, displayOrder: 10, compatibleLengthStyles: ["short", "elbow", "three_quarter", "full", "custom"], description: "Classic straight-cut sleeve delivering clean lines, modesty and supreme comfort." },
  { name: "Puff sleeve", kind: "sleeve", nameHi: "फूली बाजू", code: "KS-SD-02", priceMode: "additional", amountPaise: 8000, displayOrder: 20, compatibleLengthStyles: ["short", "elbow", "three_quarter", "full", "custom"], description: "Gathers gathered at shoulder forming a soft feminine volume puff." },
  { name: "Bell sleeve", kind: "sleeve", nameHi: "घंटी बाजू", code: "KS-SD-03", priceMode: "additional", amountPaise: 10000, displayOrder: 30, compatibleLengthStyles: ["short", "elbow", "three_quarter", "full", "custom"], description: "Flared silhouette opening wide from elbow to wrist like an elegant bell." },
  { name: "Ruffle sleeve", kind: "sleeve", nameHi: "झालर बाजू", code: "KS-SD-04", priceMode: "additional", amountPaise: 12000, displayOrder: 40, compatibleLengthStyles: ["short", "elbow", "three_quarter", "full", "custom"], description: "Layered frills along cuffs creating dramatic playful movement and volume." },
  { name: "Cap sleeve", kind: "sleeve", nameHi: "छोटी टोपी", code: "KS-SD-05", priceMode: "additional", amountPaise: 6000, displayOrder: 50, compatibleLengthStyles: ["short", "elbow", "three_quarter", "full", "custom"], description: "Short dainty sleeve just covering the shoulder point, light and breezy." },
  { name: "Bishop balloon sleeve", kind: "sleeve", nameHi: "गुब्बारे जैसी बाजू", code: "KS-SD-06", priceMode: "additional", amountPaise: 12000, displayOrder: 60, compatibleLengthStyles: ["short", "elbow", "three_quarter", "full", "custom"], description: "Full dramatic volume through the arm gathered into a fitted buttoned cuff." },
  { name: "Butterfly sleeve", kind: "sleeve", nameHi: "तितली बाजू", code: "KS-SD-07", priceMode: "additional", amountPaise: 10000, displayOrder: 70, compatibleLengthStyles: ["short", "elbow", "three_quarter", "full", "custom"], description: "Delicate wing-like drapery flaring freely from shoulder with romantic grace." },
  { name: "Cold shoulder sleeve", kind: "sleeve", nameHi: "कंधा खुला", code: "KS-SD-08", priceMode: "additional", amountPaise: 10000, displayOrder: 80, compatibleLengthStyles: ["short", "elbow", "three_quarter", "full", "custom"], description: "Modern cutout at the shoulder joint offering a trendy chic ethnic fusion." },
  { name: "Flutter sleeve", kind: "sleeve", nameHi: "लहर बाजू", code: "KS-SD-09", priceMode: "additional", amountPaise: 9000, displayOrder: 90, compatibleLengthStyles: ["short", "elbow", "three_quarter", "full", "custom"], description: "Cascading tiered ripples creating soft breezy motion and delicate elegance." },
  { name: "Bell-cuff sleeve", kind: "sleeve", nameHi: "कफ वाली घंटी", code: "KS-SD-10", priceMode: "additional", amountPaise: 13000, displayOrder: 100, compatibleLengthStyles: ["short", "elbow", "three_quarter", "full", "custom"], description: "Straight sleeve fitted through the arm, terminating in an embroidered flare bell." },
  { name: "Pleated sleeve", kind: "sleeve", nameHi: "चुनट वाली", code: "KS-SD-11", priceMode: "additional", amountPaise: 11000, displayOrder: 110, compatibleLengthStyles: ["short", "elbow", "three_quarter", "full", "custom"], description: "Fine knife pleats running along the cuff border adding bespoke couture detail." },

  // 5 Sleeve Length options
  { name: "Sleeveless", kind: "sleeveLength", lengthStyle: "sleeveless", nameHi: "बिना बाजू", code: "KS-SL-01", priceMode: "included", amountPaise: 0, displayOrder: 10, description: "Modern, clean armhole finish without sleeves for optimal summer comfort." },
  { name: "1/4 sleeve", kind: "sleeveLength", lengthStyle: "short", nameHi: "चौथाई बाजू (1/4)", code: "KS-SL-02", priceMode: "included", amountPaise: 0, displayOrder: 20, description: "Petite short length ending just past the shoulder cap, youthful and easygoing." },
  { name: "1/2 sleeve", kind: "sleeveLength", lengthStyle: "elbow", nameHi: "आधी बाजू (1/2)", code: "KS-SL-03", priceMode: "included", amountPaise: 0, displayOrder: 30, description: "Classic mid-arm length ending just above the elbow, versatile and modest." },
  { name: "3/4 sleeve", kind: "sleeveLength", lengthStyle: "three_quarter", nameHi: "तीन चौथाई बाजू (3/4)", code: "KS-SL-04", priceMode: "included", amountPaise: 0, displayOrder: 40, description: "Most popular universal length ending mid-forearm, extremely flattering." },
  { name: "Full sleeve", kind: "sleeveLength", lengthStyle: "full", nameHi: "पूरी बाजू", code: "KS-SL-05", priceMode: "included", amountPaise: 0, displayOrder: 50, description: "Graceful wrist-length coverage lending royal elegance and formal sophistication." },

  // Fit option
  { name: "Comfort fit", kind: "fit", nameHi: "आरामदायक फिटिंग", code: "KS-FT-01", priceMode: "included", amountPaise: 0, displayOrder: 10, description: "Easy-breathing relaxed cut with comfortable movement allowance." },
];

const ctx = await connect();
try {
  if (ctx.config.NODE_ENV === "production")
    throw new Error("Development seed is disabled in production.");
  const examples = [
    ["Everyday cotton kurti", "DEMO-K01", "demo-cotton-kurti", "kurti", 65000],
    [
      "Classic suit silhouette",
      "DEMO-S01",
      "demo-classic-suit",
      "suit",
      120000,
    ],
    [
      "Celebration blouse",
      "DEMO-B01",
      "demo-celebration-blouse",
      "blouse",
      85000,
    ],
    ["A better fit", "DEMO-A01", "demo-alteration", "alteration", 15000],
  ];
  for (const [title, code, slug, garment, price] of examples)
    await ctx.models.Design.updateOne(
      { code },
      {
        $setOnInsert: {
          title: "Demo · " + title,
          titleHi: "उदाहरण · " + (hindiTitles[title] || title),
          descriptionHi:
            "विकास के लिए सिलाई सेवा का उदाहरण। कपड़ा ग्राहक देते हैं। अंतिम कीमत स्टूडियो की समीक्षा के बाद तय होती है।",
          code,
          slug,
          garment,
          startingPricePaise: price,
          description:
            "Illustrative stitching service for development. Fabric is provided by the customer. Final price follows atelier review.",
          status: "published",
          mediaIds: [],
        },
      },
      { upsert: true },
    );

  // 1. Remove uncoded legacy duplicates
  await ctx.models.DesignOption.deleteMany({ code: { $in: [null, undefined, "undefined"] } });

  // 2. Publish and activate all 33 options with applicable garments
  for (const opt of allSeedOptions) {
    await ctx.models.DesignOption.updateOne(
      { code: opt.code },
      {
        $set: {
          name: opt.name,
          nameHi: opt.nameHi,
          kind: opt.kind,
          code: opt.code,
          garments: ["kurti", "suit", "blouse", "alteration"],
          active: true,
          status: "published",
          priceMode: opt.priceMode,
          amountPaise: opt.amountPaise,
          displayOrder: opt.displayOrder,
          description: opt.description,
          imageMediaId: null,
          imageMediaIds: [],
          ...(opt.lengthStyle ? { lengthStyle: opt.lengthStyle } : {}),
          ...(opt.compatibleLengthStyles ? { compatibleLengthStyles: opt.compatibleLengthStyles } : {}),
        },
      },
      { upsert: true },
    );
  }

  const publishedCount = await ctx.models.DesignOption.countDocuments({ active: true, status: "published" });
  console.log(
    `Successfully published and activated ${publishedCount} design options across neck, back, sleeve, length & fit!`,
  );
} finally {
  await ctx.disconnect();
}
