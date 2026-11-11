import http from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  calculateEstimate,
  estimateInput,
  isPublishedOption,
  isSupportedAddon,
} from "../server/src/pricing.js";

const id = (index) => index.toString(16).padStart(24, "0");
const ids = {
  design: id(500),
  plain: id(1),
  puff: id(2),
  round: id(3),
  v: id(4),
  closed: id(5),
  deep: id(6),
  square: id(7),
  pocket: id(8),
  lace: id(9),
  future: id(10),
  sleeveless: id(101),
  short: id(102),
  elbow: id(103),
  three_quarter: id(104),
  full: id(105),
  custom: id(106),
};
const option = (fields) => ({
  garments: ["kurti"],
  active: true,
  status: "published",
  revision: 1,
  priceMode: "included",
  amountPaise: 0,
  measurementFields: [],
  displayOrder: 0,
  description: "A deterministic illustration for this browser verification.",
  compatibleLengthStyles: [],
  incompatibleOptionIds: [],
  sleevePricingMode: "separate",
  combinedLengthPrices: [],
  materialCoverage: "labor_only",
  materialNotes: "",
  serviceType: "stitching",
  ...fields,
});
const lengths = [
  ["sleeveless", "Sleeveless", "बिना आस्तीन"],
  ["short", "Short", "छोटी आस्तीन"],
  ["elbow", "Elbow length", "कोहनी तक"],
  ["three_quarter", "Three-quarter", "तीन चौथाई"],
  ["full", "Full length", "पूरी लंबाई"],
  ["custom", "Custom length", "अपनी पसंद की लंबाई"],
];
const compatibleLengths = lengths
  .map(([style]) => style)
  .filter((style) => style !== "sleeveless");

function illustration(optionRecord) {
  const back = optionRecord.kind === "back",
    sleeve = optionRecord.kind === "sleeve";
  const neckline =
    optionRecord._id === ids.v || optionRecord._id === ids.deep
      ? "M88 38L120 86L152 38"
      : optionRecord._id === ids.square
        ? "M88 38V70H152V38"
        : "M88 38Q120 76 152 38";
  const shoulders =
    sleeve && optionRecord._id === ids.puff
      ? "M83 38Q34 25 30 76L61 89L78 63M157 38Q206 25 210 76L179 89L162 63"
      : "M83 38L53 49L32 115L61 126L80 73M157 38L187 49L208 115L179 126L160 73";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 250"><rect width="240" height="250" rx="18" fill="#faf3e8"/><path d="M83 38L78 73V207H162V73L157 38" fill="#b6d1c9" stroke="#24564d" stroke-width="3"/><path d="${shoulders}" fill="#c9dfd7" stroke="#24564d" stroke-width="3"/><path d="${neckline}" fill="none" stroke="#713e29" stroke-width="4"/><text x="120" y="232" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#502c1f">${back ? "Back view" : sleeve ? "Sleeve design" : "Front view"}</text></svg>`;
}

export async function startCustomizationFixture() {
  const options = [
    option({
      _id: ids.plain,
      kind: "sleeve",
      name: "Plain sleeve",
      nameHi: "सादी आस्तीन",
      sleeveStyle: "full",
      compatibleLengthStyles: compatibleLengths,
    }),
    option({
      _id: ids.puff,
      kind: "sleeve",
      name: "Puff sleeve",
      nameHi: "पफ आस्तीन",
      sleeveStyle: "full",
      compatibleLengthStyles: compatibleLengths,
      priceMode: "additional",
      amountPaise: 15000,
      measurementFields: ["sleeveLength", "armhole", "sleeveOpening"],
    }),
    option({
      _id: ids.round,
      kind: "neck",
      name: "Round front",
      nameHi: "गोल सामने का गला",
    }),
    option({
      _id: ids.v,
      kind: "neck",
      name: "V front",
      nameHi: "वी सामने का गला",
      priceMode: "additional",
      amountPaise: 10000,
      measurementFields: ["frontNeckDepth", "frontNeckWidth"],
      incompatibleOptionIds: [ids.deep],
    }),
    option({
      _id: ids.closed,
      kind: "back",
      name: "Closed back",
      nameHi: "बंद पीछे का गला",
    }),
    option({
      _id: ids.deep,
      kind: "back",
      name: "Deep back",
      nameHi: "गहरा पीछे का गला",
      priceMode: "additional",
      amountPaise: 8000,
      incompatibleOptionIds: [ids.v],
    }),
    option({
      _id: ids.square,
      kind: "back",
      name: "Square back",
      nameHi: "चौकोर पीछे का गला",
      priceMode: "additional",
      amountPaise: 6000,
      measurementFields: ["backNeckDepth", "backNeckWidth"],
    }),
    option({
      _id: ids.pocket,
      kind: "extra",
      name: "Pocket finishing",
      nameHi: "जेब की सिलाई",
      priceMode: "additional",
      amountPaise: 8000,
      materialCoverage: "labor_only",
      materialNotes: "The customer supplies matching pocket fabric.",
    }),
    option({
      _id: ids.lace,
      kind: "extra",
      name: "Lace finishing",
      nameHi: "लेस की सिलाई",
      priceMode: "additional",
      amountPaise: 4000,
      materialCoverage: "labor_and_materials",
      materialNotes:
        "Includes the listed plain lace after confirming its color.",
    }),
    option({
      _id: ids.future,
      kind: "extra",
      name: "Unavailable embroidery",
      serviceType: "embroidery",
      priceMode: "additional",
      amountPaise: 25000,
    }),
    ...lengths.map(([lengthStyle, name, nameHi], displayOrder) =>
      option({
        _id: ids[lengthStyle],
        kind: "sleeveLength",
        lengthStyle,
        name,
        nameHi,
        amountPaise: 0,
        priceMode: "included",
        displayOrder,
      }),
    ),
  ];
  const design = {
    _id: ids.design,
    title: "Customization verification kurti",
    titleHi: "कस्टम सिलाई जाँच कुर्ती",
    code: "CUSTOM-QA",
    garment: "kurti",
    status: "published",
    revision: 1,
    startingPricePaise: 65000,
    defaultComponents: {
      sleeve: ids.plain,
      sleeveLength: ids.full,
      neck: ids.round,
      back: ids.closed,
    },
    includedAddonIds: [ids.pocket],
    designDetails: {},
  };
  const settings = {
    revision: 1,
    serviceAreas: [
      {
        name: "Fixture PIN area",
        enabled: true,
        pinPrefixes: ["411"],
        inboundPaise: 5000,
        outboundPaise: 7000,
      },
    ],
  };
  const pricingCalls = [],
    requests = [];
  const list = (data, query) => {
    const page = Number(query.get("page") || 1),
      limit = Number(query.get("limit") || 12);
    return {
      data: data.slice((page - 1) * limit, page * limit),
      pagination: {
        page,
        limit,
        total: data.length,
        pages: Math.ceil(data.length / limit),
      },
    };
  };
  let origin;
  const server = http.createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "http://127.0.0.1:4173");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, Idempotency-Key",
    );
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Cache-Control", "no-store");
    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }
    const url = new URL(req.url, origin),
      route = url.pathname,
      query = url.searchParams;
    requests.push({ method: req.method, path: route + url.search });
    try {
      if (route.startsWith("/fixture/")) {
        const record =
          options.find((item) => route.includes(item._id)) || options[0];
        res
          .writeHead(200, { "Content-Type": "image/svg+xml" })
          .end(illustration(record));
        return;
      }
      let payload;
      if (req.method === "POST" && route === "/api/pricing/estimate") {
        let text = "";
        for await (const chunk of req) {
          text += chunk;
          if (text.length > 50000) throw new Error("Fixture input too large");
        }
        const input = estimateInput.parse(JSON.parse(text)),
          data = calculateEstimate(input, { design, options, settings });
        pricingCalls.push({ input, data });
        payload = { data };
      } else if (route === "/api/designs") {
        const search = (query.get("search") || "").toLowerCase();
        payload = list(
          `${design.title} ${design.titleHi} ${design.code}`
            .toLowerCase()
            .includes(search)
            ? [design]
            : [],
          query,
        );
      } else if (route === `/api/designs/id/${ids.design}`)
        payload = { data: design };
      else if (route === "/api/options")
        payload = list(
          options.filter(
            (item) =>
              isPublishedOption(item) &&
              (item.kind !== "extra" || isSupportedAddon(item)) &&
              (!query.get("kind") || item.kind === query.get("kind")) &&
              (!query.get("garment") ||
                item.garments.includes(query.get("garment"))),
          ),
          query,
        );
      else if (route === "/api/settings") payload = { data: settings };
      else if (route === "/api/auth/config") payload = { data: {} };
      else if (route === "/api/services")
        payload = list(
          [
            {
              _id: id(600),
              code: "stitching",
              active: true,
              itemTypes: ["kurti"],
            },
          ],
          query,
        );
      else if (req.method === "GET") payload = list([], query);
      else {
        res.writeHead(405, { "Content-Type": "application/json" }).end(
          JSON.stringify({
            error: {
              code: "FIXTURE_READ_ONLY",
              message:
                "This browser fixture only estimates public configurations.",
            },
          }),
        );
        return;
      }
      res
        .writeHead(200, { "Content-Type": "application/json" })
        .end(JSON.stringify(payload));
    } catch (error) {
      res
        .writeHead(error.status || (error.name === "ZodError" ? 400 : 500), {
          "Content-Type": "application/json",
        })
        .end(
          JSON.stringify({
            error: {
              code: error.code || "VALIDATION_ERROR",
              message: error.message,
              details: error.issues?.map((issue) => ({
                path: issue.path.join("."),
                message: issue.message,
              })),
            },
          }),
        );
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  origin = `http://127.0.0.1:${server.address().port}`;
  for (const item of options)
    if (item.kind !== "sleeveLength") {
      item.imageUrl = `${origin}/fixture/${item._id}.svg`;
      item.imageAlt = `${item.name} ${item.kind === "back" ? "back view" : "design illustration"}`;
    }
  design.coverImageUrl = `${origin}/fixture/design.svg`;
  return {
    url: origin,
    ids,
    design,
    options,
    pricingCalls,
    requests,
    close: () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections?.();
      }),
  };
}

export async function verifyCustomizationInBrowser({
  fixture,
  send,
  evaluate,
  navigate,
  waitFor,
  session,
  results,
}) {
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const js = (value) => JSON.stringify(value);
  const fill = (selector, value) =>
    evaluate(
      `(() => { const input=document.querySelector(${js(selector)}); if(!input) throw Error('Missing input: '+${js(selector)}); const prototype=input.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype,'value').set.call(input,${js(String(value))}); input.dispatchEvent(new Event('input',{bubbles:true})); })()`,
    );
  const select = (selector, value) =>
    evaluate(
      `(() => { const input=document.querySelector(${js(selector)}); if(!input) throw Error('Missing select'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(input,${js(value)}); input.dispatchEvent(new Event('change',{bubbles:true})); })()`,
    );
  const clickText = (text, selector = "button") =>
    evaluate(
      `(() => { const control=[...document.querySelectorAll(${js(selector)})].find(item=>item.textContent.replace(/\\s+/g,' ').trim()===${js(text)}); if(!control) throw Error('Missing control: '+${js(text)}); control.click(); })()`,
    );
  const choose = async (optionId) => {
    const selector = `input[value="${optionId}"]`;
    await waitFor(
      () => evaluate(`!!document.querySelector(${js(selector)})`),
      `Choice ${optionId} missing`,
    );
    await evaluate(`document.querySelector(${js(selector)}).click()`);
  };
  const step = (name) =>
    waitFor(
      () =>
        evaluate(
          `new URL(location.href).searchParams.get('step')===${js(name)}`,
        ),
      `Step ${name} missing`,
    );
  const price = (amountPaise) =>
    waitFor(
      () =>
        evaluate(
          `document.querySelector('.request-price h2')?.textContent.replace(/[^0-9]/g,'')===${js(String(amountPaise / 100))}`,
        ),
      `Expected estimate ${amountPaise} missing`,
    );
  const latest = () => fixture.pricingCalls.at(-1);
  const next = async (name) => {
    await clickText("Continue");
    await step(name);
    assert(
      await evaluate(`!!document.querySelector('a[href^="/account/support"]')`),
      "Master tailor help missing",
    );
  };
  const review = () => step("review");
  await navigate(`/request?design=${ids.design}`);
  await waitFor(
    () => evaluate(`!!document.querySelector('input[name="designId"]')`),
    "Catalogue design missing",
  );
  await fill('input[name="quantity"]', "2");
  await waitFor(
    () =>
      evaluate(
        `!![...document.querySelectorAll('label.checkbox')].find(item=>item.textContent.replace(/\\s+/g,' ').trim()==='Customize this design')`,
      ),
    "Customization mode control did not settle",
  );
  await clickText("Customize this design", "label.checkbox");
  for (const label of [
    "Sleeve length",
    "Sleeve design",
    "Front neck design",
    "Back neck design",
    "Extra add-ons",
  ])
    await clickText(label, "label.checkbox");
  await next("component-sleeveLength");
  await waitFor(
    () =>
      evaluate(
        `(()=>{const cards=[...document.querySelectorAll('.sleeve-length-card')];return cards.length===6&&cards.every(card=>{const image=card.querySelector('img.sleeve-length-image');return !!card.querySelector('input[type="radio"]')&&((image?.complete&&image.naturalWidth>0&&image.alt)||card.querySelector('svg.sleeve-length-illustration[role="img"][aria-label]'));});})()`,
      ),
    "Six labelled sleeve-length cards with loaded photos or accessible illustrations are required",
  );
  await choose(ids.full);
  await next("component-sleeve");
  await choose(ids.puff);
  await price(160000);
  await choose(ids.plain);
  await price(130000);
  await choose(ids.puff);
  await price(160000);
  assert(
    latest().data.lineItems.filter((line) => line.code === `sleeve:${ids.puff}`)
      .length === 1 &&
      latest().data.lineItems.find((line) => line.code === `sleeve:${ids.puff}`)
        .unitAmountPaise === 15000 &&
      latest().data.lineItems.filter((line) => line.code.startsWith("sleeveLength:")).every((line) => line.amountPaise === 0) &&
      !latest().data.lineItems.some((line) => line.code === "sleeve:combined"),
    "Sleeve design was not charged separately from the free length preference",
  );
  await fill("#notes-sleeve", "Keep the chosen puff shape.");
  await next("component-neck");
  await choose(ids.v);
  await price(180000);
  await fill("#notes-neck", "Keep this front neckline note.");
  await next("component-back");
  assert(
    await evaluate(
      `!document.querySelector('input[value="${ids.deep}"]') && document.body.innerText.includes('Your other neckline has not been changed')`,
    ),
    "Conflicting back option was offered or conflict unexplained",
  );
  await choose(ids.square);
  await price(192000);
  assert(
    latest().input.configuration.components.neck.optionId === ids.v,
    "Back neckline silently changed the front selection",
  );
  await next("component-extra");
  const pocketSelector = `input[type="checkbox"]`;
  await waitFor(
    () =>
      evaluate(
        `!![...document.querySelectorAll('label.request-design')].find(item=>item.textContent.includes('Pocket finishing'))`,
      ),
    "Included pocket missing",
  );
  assert(
    await evaluate(
      `[...document.querySelectorAll('label.request-design')].find(item=>item.textContent.includes('Pocket finishing')).querySelector(${js(pocketSelector)}).checked && !document.body.innerText.includes('Unavailable embroidery') && document.body.innerText.includes('customer supplies')`,
    ),
    "Included/material/future-service add-on state incorrect",
  );
  const laceClick = () =>
    evaluate(
      `[...document.querySelectorAll('label.request-design')].find(item=>item.textContent.includes('Lace finishing')).querySelector('input').click()`,
    );
  await laceClick();
  await price(200000);
  await laceClick();
  await price(192000);
  await laceClick();
  await price(200000);
  assert(
    latest().data.lineItems.find((line) => line.code === `extra:${ids.pocket}`)
      ?.included &&
      latest().data.lineItems.find(
        (line) => line.code === `extra:${ids.pocket}`,
      )?.amountPaise === 0,
    "Included finishing detail charged again",
  );
  await next("measurements");
  await select("#taken-by", "self");
  await select("#method", "body");
  await waitFor(
    () => evaluate(`!!document.querySelector('#measure-sleeveLength')`),
    "Sleeve measurement field missing",
  );
  assert(
    await evaluate(
      `document.querySelector('#measure-sleeveLength').value===''`,
    ),
    "Style preference invented a fixed sleeve measurement",
  );
  const measurements = {
    bust: 36,
    waist: 30,
    hip: 38,
    shoulder: 14,
    length: 40,
    sleeveLength: 21,
    armhole: 16,
    sleeveOpening: 10,
    frontNeckDepth: 7,
    frontNeckWidth: 7,
    backNeckDepth: 5,
    backNeckWidth: 6,
  };
  for (const [key, value] of Object.entries(measurements))
    await fill(`#measure-${key}`, value);
  await fill("#measurementNotes", "Preserve this exact measurement note.");
  await next("logistics");
  await fill("#customerName", "QA customer");
  await fill("#phone", "9876543210");
  await fill("#fabricDetails", "Two lengths of customer-supplied cotton.");
  await clickText("Please arrange pickup from my address.", "label.checkbox");
  for (const [key, value] of Object.entries({
    line1: "12 Fixture Lane",
    line2: "Second floor",
    city: "Pune",
    state: "Maharashtra",
    pin: "411001",
  }))
    await fill(`#inbound-${key}`, value);
  await fill("#request-notes", "Keep this logistics instruction.");
  await price(205000);
  await next("review");
  const draftId = await evaluate(
    "new URL(location.href).searchParams.get('draft')",
  );
  const edits = [
    "Sleeve design",
    "Sleeve length",
    "Front neck design",
    "Back neck design",
    "Extra add-ons",
  ];
  for (const label of edits)
    assert(
      await evaluate(
        `[...document.querySelectorAll('button')].some(button=>button.textContent.trim()===${js(`Edit ${label}`)})`,
      ),
      `Missing review Edit ${label}`,
    );
  await clickText("Edit Sleeve length");
  await step("component-sleeveLength");
  await choose(ids.sleeveless);
  await price(175000);
  await clickText("Save changes");
  await review();
  assert(
    latest().data.components.sleeve.suppressed &&
      !latest().data.lineItems.some((line) =>
        line.code.startsWith("sleeve:"),
      ) &&
      !latest().data.measurementFields.some((field) =>
        ["sleeveLength", "armhole", "sleeveOpening"].includes(field),
      ),
    "Sleeveless retained charges or required sleeve measurements",
  );
  await clickText("Edit Measurements");
  await step("measurements");
  assert(
    await evaluate(
      `!document.querySelector('#measure-sleeveLength') && !document.querySelector('#measure-armhole') && document.querySelector('#measure-bust').value==='36' && document.querySelector('#measurementNotes').value==='Preserve this exact measurement note.'`,
    ),
    "Sleeveless measurement editing lost unrelated values or retained sleeve fields",
  );
  await clickText("Save changes");
  await review();
  await clickText("Edit Sleeve length");
  await step("component-sleeveLength");
  await choose(ids.full);
  await price(205000);
  await clickText("Save changes");
  await review();
  assert(
    latest().input.configuration.components.sleeve.optionId === ids.puff &&
      latest().input.configuration.components.neck.optionId === ids.v &&
      latest().input.configuration.components.back.optionId === ids.square,
    "Switching back lost a parked or unrelated component choice",
  );
  await clickText("Edit Measurements");
  await step("measurements");
  assert(
    await evaluate(
      `document.querySelector('#measure-sleeveLength').value==='21' && document.querySelector('#measure-armhole').value==='16' && document.querySelector('#measure-frontNeckWidth').value==='7'`,
    ),
    "Switching back lost exact saved measurements",
  );
  await clickText(
    "I have reconfirmed the measurements affected by these changes.",
    "label.checkbox",
  );
  await clickText("Save changes");
  await review();
  assert(
    await evaluate(
      `document.body.innerText.includes('QA customer') && document.body.innerText.includes('Two lengths of customer-supplied cotton.') && document.body.innerText.includes('Keep this logistics instruction.') && document.body.innerText.includes('411001')`,
    ),
    "Review lost contact, fabric, notes or pickup address",
  );
  await select(".language-picker select", "hi");
  await waitFor(
    () =>
      evaluate(
        `document.documentElement.lang==='hi' && new URL(location.href).searchParams.get('draft')===${js(draftId)}`,
      ),
    "Hindi switch replaced the draft",
  );
  for (const width of [320, 390, 768, 1440]) {
    await send(
      "Emulation.setDeviceMetricsOverride",
      { width, height: 900, deviceScaleFactor: 1, mobile: width < 640 },
      session,
    );
    const dimensions = await evaluate(
      "({width:innerWidth,scroll:document.documentElement.scrollWidth})",
    );
    assert(
      dimensions.scroll <= dimensions.width + 1,
      `Customization review overflows at ${width}px`,
    );
  }
  await send(
    "Emulation.setDeviceMetricsOverride",
    { width: 390, height: 900, deviceScaleFactor: 1, mobile: true },
    session,
  );
  await evaluate("window.scrollTo(0,0)");
  const metrics = await send("Page.getLayoutMetrics", {}, session),
    shot = await send(
      "Page.captureScreenshot",
      {
        format: "png",
        captureBeyondViewport: true,
        clip: {
          x: 0,
          y: 0,
          width: 390,
          height: Math.ceil(metrics.cssContentSize.height),
          scale: 1,
        },
      },
      session,
    );
  const artifacts = fileURLToPath(new URL("../artifacts/", import.meta.url));
  await mkdir(artifacts, { recursive: true });
  await writeFile(
    path.join(artifacts, "request-customization-390.png"),
    Buffer.from(shot.data, "base64"),
  );
  results.push(
    "Five separate customization sections, six sleeve length illustrations and five review Edit actions rendered.",
    "Real pricing validates free sleeve-length preferences, separately charged sleeve designs, independent neckline compatibility, add-on deselection and included-price handling.",
    "Sleeveless removes sleeve charges/fields; switching back restores the parked puff design, exact measurements, notes and logistics.",
    "Hindi draft preservation and 320/390/768/1440px responsive review passed with zero uncaught browser exceptions.",
  );
}
