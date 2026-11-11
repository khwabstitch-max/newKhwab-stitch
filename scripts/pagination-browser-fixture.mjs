import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// A deterministic public API fixture for rendering checks. It starts no server,
// database or model runtime and never accesses a customer's account.
function installPaginationFixture() {
  const originalFetch = window.fetch.bind(window);
  const id = (prefix, index) => prefix + index.toString(16).padStart(23, "0");
  const designs = Array.from({ length: 24 }, (_, index) => ({
    _id: id("d", index + 1),
    garment: "kurti",
    title: `Paging design ${index + 1}`,
    titleHi: index === 21 ? "कमल डिज़ाइन" : `डिज़ाइन ${index + 1}`,
    code: `PAGE-${index + 1}`,
    startingPricePaise: 65000,
    defaultComponents: { sleeve: id("e", 60) },
    designDetails: {},
  }));
  const sleeves = Array.from({ length: 60 }, (_, index) => ({
    _id: id("e", index + 1),
    kind: "sleeve",
    garments: ["kurti"],
    name: `Sleeve choice ${index + 1}`,
    nameHi: `आस्तीन ${index + 1}`,
    description: "A fixture design for pagination checks",
    priceMode: "included",
    measurementFields: ["sleeveLength"],
    sleeveStyle: "full",
  }));
  const additions = Array.from({ length: 2 }, (_, index) => ({
    _id: id("f", index + 1),
    kind: "extra",
    garments: ["kurti"],
    name: `Addition ${index + 1}`,
    priceMode: "included",
  }));
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
  window.__pagingCalls = [];
  window.fetch = async (input, options = {}) => {
    const url = new URL(
      typeof input === "string" ? input : input.url,
      location.href,
    );
    if (!url.pathname.startsWith("/api/")) return originalFetch(input, options);
    const route = url.pathname.slice(4),
      query = url.searchParams;
    window.__pagingCalls.push(route + url.search);
    let payload;
    if (route === "/designs") {
      const search = (query.get("search") || "").toLowerCase();
      payload = list(
        designs.filter((design) =>
          `${design.title} ${design.titleHi} ${design.code}`
            .toLowerCase()
            .includes(search),
        ),
        query,
      );
    } else if (route.startsWith("/designs/id/")) {
      payload = {
        data: designs.find((design) => design._id === route.split("/").at(-1)),
      };
    } else if (route === "/options") {
      payload = list(
        query.get("kind") === "extra"
          ? additions
          : query.get("kind") === "sleeve"
            ? sleeves
            : [],
        query,
      );
    } else if (route === "/services") {
      payload = list(
        [
          {
            _id: "current-stitching",
            code: "stitching",
            active: true,
            itemTypes: ["kurti"],
          },
        ],
        query,
      );
    } else if (route === "/pricing/estimate") {
      const body = JSON.parse(options.body || "{}"),
        chosen = body.configuration?.components?.sleeve;
      const selected = sleeves.find(
        (sleeve) => sleeve._id === chosen?.optionId,
      );
      payload = {
        data: {
          knownSubtotalPaise: 65000 * body.quantity,
          hasPending: false,
          pendingItems: [],
          lineItems: [],
          configurationVersion: "a".repeat(64),
          measurementFields: ["sleeveLength"],
          components: {
            sleeve: selected
              ? {
                  source: "option",
                  optionId: selected._id,
                  name: selected.name,
                  sleeveStyle: "full",
                }
              : {
                  source: "original",
                  optionId: id("e", 60),
                  name: "Sleeve choice 60",
                  sleeveStyle: "full",
                },
          },
        },
      };
    } else if (route === "/settings" || route === "/auth/config")
      payload = { data: {} };
    else payload = list([], query);
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
}

export const paginationBrowserSource = `(${installPaginationFixture.toString()})()`;

export async function verifyPaginationInBrowser({
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
  const click = (text) =>
    evaluate(
      `(() => { const button = [...document.querySelectorAll('button')].find(item => item.textContent.trim() === ${JSON.stringify(text)}); if (!button) throw Error('Missing button'); button.click(); })()`,
    );
  const fill = (selector, value) =>
    evaluate(
      `(() => { const input = document.querySelector(${JSON.stringify(selector)}); if (!input) throw Error('Missing input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)}); input.dispatchEvent(new Event('input',{bubbles:true})); })()`,
    );
  await navigate("/request?design=d00000000000000000000001");
  await waitFor(
    () =>
      evaluate(
        `document.querySelectorAll('input[name="designId"]').length === 12`,
      ),
    "First catalogue batch missing",
  );
  await fill('input[name="quantity"]', "3");
  await click("Load more catalogue designs");
  await waitFor(
    () =>
      evaluate(
        `document.querySelectorAll('input[name="designId"]').length === 24`,
      ),
    "Later catalogue batch missing",
  );
  await evaluate(
    `document.querySelectorAll('input[name="designId"]')[12].click()`,
  );
  await fill('input[name="find-design"]', "कमल");
  await waitFor(
    () =>
      evaluate(
        `document.querySelectorAll('input[name="designId"]').length === 1 && document.body.innerText.includes('Paging design 22')`,
      ),
    "Hindi server search lost its match",
  );
  assert(
    await evaluate(
      `document.body.innerText.includes('Selected design: Paging design 13') && document.querySelector('input[name="quantity"]').value === '3'`,
    ),
    "Search lost chosen design or quantity",
  );
  await evaluate(
    `[...document.querySelectorAll('label.checkbox')].find(item => item.textContent.trim() === 'Customize this design').querySelector('input').click()`,
  );
  await waitFor(
    () =>
      evaluate(
        `!![...document.querySelectorAll('label.checkbox')].find(item => item.textContent.trim() === 'Sleeve design')`,
      ),
    "Customization choices missing",
  );
  await evaluate(
    ` [...document.querySelectorAll('label.checkbox')].find(item => item.textContent.trim() === 'Sleeve design').querySelector('input').click()`,
  );
  await click("Continue");
  await waitFor(
    () =>
      evaluate(
        `document.querySelectorAll('.visual-options input[type="radio"]').length >= 12 && document.querySelectorAll('.visual-options input[type="radio"]').length <= 13`,
      ),
    "First sleeve batch missing",
  );
  await evaluate(
    `document.querySelector('.visual-options input[type="radio"]').click()`,
  );
  for (let page = 2; page <= 5; page += 1) {
    await waitFor(
      () =>
        evaluate(
          `!![...document.querySelectorAll('button')].find(item => item.textContent.trim() === 'Load more designs' && !item.disabled)`,
        ),
      "Load more did not become available",
    );
    await click("Load more designs");
    await waitFor(
      () =>
        evaluate(
          `document.querySelectorAll('.visual-options input[type="radio"]').length === ${page * 12}`,
        ),
      `Sleeve page ${page} missing`,
    );
  }
  assert(
    await evaluate(
      `document.querySelector('.visual-options input[type="radio"]').checked && document.body.innerText.includes('Sleeve choice 60')`,
    ),
    "Loading more lost selection or original details",
  );
  await fill('.visual-options input[type="search"]', "60");
  await waitFor(
    () =>
      evaluate(
        `document.querySelectorAll('.visual-options input[type="radio"]').length === 1`,
      ),
    "Loaded search did not filter",
  );
  await evaluate(
    `document.querySelector('.visual-options input[type="radio"]').click()`,
  );
  const draftId = await evaluate(
    `new URL(location.href).searchParams.get('draft')`,
  );
  await evaluate(
    `(() => { const select=document.querySelector('.language-picker select'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,'hi'); select.dispatchEvent(new Event('change',{bubbles:true})); })()`,
  );
  await waitFor(
    () =>
      evaluate(
        `document.documentElement.lang === 'hi' && document.querySelector('.visual-options input[type="radio"]').checked && document.body.innerText.includes('आस्तीन 60')`,
      ),
    "Hindi switch lost loaded search or selection",
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
      `Paging layout overflow at ${width}px`,
    );
  }
  await send(
    "Emulation.setDeviceMetricsOverride",
    { width: 390, height: 900, deviceScaleFactor: 1, mobile: true },
    session,
  );
  const shot = await send(
    "Page.captureScreenshot",
    { format: "png", captureBeyondViewport: false },
    session,
  );
  const artifacts = fileURLToPath(new URL("../artifacts/", import.meta.url));
  await mkdir(artifacts, { recursive: true });
  await writeFile(
    path.join(artifacts, "request-paging-390.png"),
    Buffer.from(shot.data, "base64"),
  );
  assert(
    await evaluate(
      `window.__pagingCalls.filter(path => path.startsWith('/options?') && path.includes('kind=sleeve')).every(path => new URL(path,location.origin).searchParams.get('limit') === '12')`,
    ),
    "Option request was not bounded",
  );
  assert(
    await evaluate(
      `new URL(location.href).searchParams.get('draft') === ${JSON.stringify(draftId)}`,
    ),
    "Language change replaced draft",
  );
  results.push(
    "Catalogue page two and Hindi server search preserve chosen design and quantity.",
    "Five bounded option batches reach item 60 without losing selection or original component metadata.",
    "Loaded option search and Hindi switching preserve the draft and selected option; 320/390/768/1440px fit.",
  );
}
