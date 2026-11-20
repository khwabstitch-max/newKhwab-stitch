import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Actual Chrome renders of client/dist with a deterministic, read-only API.
// No database, environment file, login, upload, or live provider is used.
const root = fileURLToPath(new URL("../", import.meta.url));
const dist = path.join(root, "client", "dist");
const artifacts = path.join(root, "artifacts");
const chromePath = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const report = {
  mode: "Actual Chrome rendering; deterministic read-only public API fixtures",
  startedAt: new Date().toISOString(),
  status: "running",
  checks: [],
  pages: [],
  screenshots: [],
  exceptions: [],
  limits: "Local production build only. Catalogue records and prices are fixtures; reviews are empty. No account, order submission, database, deployment or live provider verification. Font CDN availability is external to this fixture.",
};

function installReadOnlyFixture() {
  const originalFetch = window.fetch.bind(window);
  const designs = [
    ["kurti", "Ivory everyday kurti", "आइवरी रोज़मर्रा कुर्ती", 65000],
    ["suit", "Embroidered kameez", "कढ़ाई वाला कमीज़", 95000],
    ["blouse", "Classic tailored blouse", "क्लासिक नाप का ब्लाउज़", 85000],
    ["alteration", "Thoughtful alterations", "फिटिंग में बदलाव", 25000],
  ].map(([garment, title, titleHi, startingPricePaise], index) => ({
    _id: "d" + String(index + 1).padStart(23, "0"),
    slug: "atelier-fixture-" + garment,
    garment, title, titleHi, startingPricePaise,
    code: "QA-0" + (index + 1),
    description: "A deterministic visual fixture for local browser checks.",
    descriptionHi: "स्थानीय ब्राउज़र जाँच के लिए नमूना डिज़ाइन।",
    coverView: {
      url: "/design-library/teal-kurti-board.png", width: 1536, height: 1024,
      crop: { x: 0, y: 0, width: 22.5, height: 95 },
    },
    coverImageUrl: "/design-library/teal-kurti-board.png",
    defaultComponents: {}, designDetails: {}, active: true, published: true,
  }));
  const paginate = (records, query) => {
    const page = Math.max(1, Number(query.get("page")) || 1);
    const limit = Math.max(1, Number(query.get("limit")) || 12);
    return {
      data: records.slice((page - 1) * limit, page * limit),
      pagination: { page, limit, total: records.length, pages: Math.max(1, Math.ceil(records.length / limit)) },
    };
  };
  window.__atelierApiCalls = [];
  window.fetch = async (input, options = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url, location.href);
    if (!url.pathname.startsWith("/api/")) return originalFetch(input, options);
    const route = url.pathname.slice(4);
    const method = (options.method || "GET").toUpperCase();
    const query = url.searchParams;
    window.__atelierApiCalls.push({ method, route: route + url.search });
    let payload;
    let status = 200;
    if (route === "/pricing/estimate" && method === "POST") {
      const body = JSON.parse(options.body || "{}");
      const selected = designs.find((design) => design._id === body.designId);
      payload = { data: {
        knownSubtotalPaise: (selected?.startingPricePaise || 65000) * (Number(body.quantity) || 1),
        hasPending: true, pendingItems: [], lineItems: [],
        configurationVersion: "a".repeat(64), components: {},
        measurementFields: ["bust", "waist", "hip", "shoulder", "length"],
      } };
    } else if (!["GET", "HEAD"].includes(method)) {
      status = 405;
      payload = { error: { code: "READ_ONLY_FIXTURE", message: "This visual fixture does not allow changes." } };
    } else if (route === "/settings" || route === "/site") {
      payload = { data: {
        businessName: "Khwab Stitch", announcement: "", about: "", faqs: [],
        whatsapp: "", contactEmail: "", instagram: "", facebook: "",
        garmentBasePrices: { kurti: 65000, suit: 95000, blouse: 85000, alteration: 25000 },
        policies: {}, support: {}, homepage: {
          slides: [], featuredDesignIds: [],
          // Persisted prior templates exercise display refresh, not just absent-copy fallbacks.
          hero: {
            eyebrow: "CUSTOM STITCHING · EMBROIDERY · MADE TO ORDER",
            eyebrowHi: "कस्टम सिलाई · कढ़ाई · आपकी पसंद पर",
            headline: "Stitching & embroidery, made for you.",
            headlineHi: "आपकी पसंद की सिलाई और कढ़ाई।",
            description: "Kurtis, suits, blouses & alterations. Your fabric, your fit.",
            descriptionHi: "कुर्ती, सूट, ब्लाउज़ और फिटिंग। कपड़ा आपका, सिलाई आपके नाप की।",
          },
          footer: {
            description: "Made-to-order stitching & embroidery. Your fabric, your personal touch.",
            descriptionHi: "आपकी पसंद की सिलाई और कढ़ाई। आपका कपड़ा, आपके नाप की पोशाक।",
          },
        },
      } };
    } else if (route === "/designs") {
      const garment = query.get("garment");
      const search = (query.get("search") || "").toLowerCase();
      payload = paginate(designs.filter((design) => (!garment || design.garment === garment) &&
        `${design.title} ${design.titleHi} ${design.code}`.toLowerCase().includes(search)), query);
    } else if (route.startsWith("/designs/")) {
      const key = route.split("/").at(-1);
      const design = designs.find((item) => item.slug === key || item._id === key);
      status = design ? 200 : 404;
      payload = design ? { data: design } : { error: { code: "NOT_FOUND", message: "Fixture design not found." } };
    } else if (route === "/services") {
      payload = paginate([{ _id: "visual-stitching-service", code: "stitching", active: true,
        name: "Custom stitching", nameHi: "नाप के अनुसार सिलाई", itemTypes: ["kurti", "suit", "blouse", "alteration"] }], query);
    } else if (["/reviews", "/options", "/categories", "/measurement-guides"].includes(route)) {
      payload = paginate([], query);
    } else if (["/auth/capabilities", "/auth/config"].includes(route)) {
      payload = { data: { google: { enabled: false }, googleEnabled: false, email: { enabled: false }, passwordResetEnabled: false } };
    } else {
      status = 404;
      payload = { error: { code: "UNEXPECTED_FIXTURE_ROUTE", message: "Unhandled read-only fixture route: " + route } };
    }
    return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
  };
}

const fixtureSource = `(${installReadOnlyFixture.toString()})();`;
const mime = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".avif": "image/avif", ".svg": "image/svg+xml",
  ".woff2": "font/woff2", ".ico": "image/x-icon",
};
let browser;
let server;
let connection;
let session;
let nextId = 0;
const pending = new Map();

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitFor(test, message, timeout = 15000) {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const result = await test();
      if (result) return result;
    } catch (error) { lastError = error; }
    await delay(80);
  }
  throw new Error(message + (lastError ? ` (${lastError.message})` : ""));
}

function send(method, params = {}, sessionId = session) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error("CDP timeout: " + method)); }, 20000);
    pending.set(id, { resolve, reject, timer });
    connection.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
}

async function evaluate(expression) {
  const response = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
  return response.result?.value;
}

async function viewport(width) {
  await send("Emulation.setDeviceMetricsOverride", {
    width, height: width < 768 ? 844 : 1000, deviceScaleFactor: 1, mobile: width < 768,
  });
  await delay(100);
}

let base;
async function navigate(route) {
  await send("Page.navigate", { url: base + route });
  await waitFor(() => evaluate(`document.readyState === 'complete' && !!document.querySelector('main h1') && document.querySelector('#root')?.textContent.length > 60`), "Page did not render: " + route);
  await waitFor(() => evaluate(`!document.querySelector('main .design-grid[aria-busy="true"]') && !document.querySelector('main .design-grid-skeleton')`), "Public collection did not settle: " + route);
  await evaluate(`Promise.race([document.fonts.ready, new Promise(resolve => setTimeout(resolve, 5000))]).then(() => true)`);
  await delay(100);
}

async function language(value) {
  await evaluate(`(() => { const select = document.querySelector('.language-picker select');
    if (!select) throw Error('Language picker missing');
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, ${JSON.stringify(value)});
    select.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await waitFor(() => evaluate(`document.documentElement.lang === ${JSON.stringify(value)}`), "Language did not change to " + value);
}

async function loadPageImages() {
  await evaluate(`(async () => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += Math.max(350, innerHeight - 150)) {
      scrollTo(0, y); await new Promise(resolve => setTimeout(resolve, 120));
    }
    scrollTo(0, 0); return true;
  })()`);
  await waitFor(() => evaluate(`Array.from(document.images).every(image => image.closest('details:not([open])') || !image.getClientRects().length || image.complete)`), "Visible images did not finish loading");
}

async function inspect(route, width, currentLanguage, capture = false) {
  await loadPageImages();
  const result = await evaluate(`(() => {
    const width = innerWidth;
    const overflow = [];
    const scrollers = new Set();
    const hidden = element => {
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0' || !element.getClientRects().length) return true;
      // Chrome can retain layout rectangles for UA-suppressed closed details content.
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        if (parent.tagName === 'DETAILS' && !parent.open && !parent.querySelector(':scope > summary')?.contains(element)) return true;
      }
      return false;
    };
    for (const element of document.querySelectorAll('body *')) {
      if (hidden(element) || element.closest('.sr-only, .skip-link, [aria-hidden="true"]') ||
        (element instanceof SVGElement && element.tagName.toLowerCase() !== 'svg')) continue;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || (rect.left >= -1 && rect.right <= width + 1)) continue;
      let parent = element.parentElement;
      let allowed = false;
      while (parent && parent !== document.body) {
        const style = getComputedStyle(parent);
        if (['auto', 'scroll'].includes(style.overflowX) && parent.scrollWidth > parent.clientWidth + 1) {
          const parentRect = parent.getBoundingClientRect();
          if (parentRect.left >= -1 && parentRect.right <= width + 1) {
            allowed = true; scrollers.add(parent.className || parent.tagName); break;
          }
        }
        parent = parent.parentElement;
      }
      if (!allowed) overflow.push({ tag: element.tagName, className: typeof element.className === 'string' ? element.className : '',
        text: (element.textContent || '').trim().slice(0, 60), left: Math.round(rect.left), right: Math.round(rect.right) });
    }
    const brokenImages = Array.from(document.images).filter(image => !hidden(image) && image.complete && !image.naturalWidth)
      .map(image => ({ source: image.currentSrc || image.src, alt: image.alt }));
    const footerContact = document.querySelector('.atelier-footer-contact a[href="/contact"]');
    const footerContactRect = footerContact?.getBoundingClientRect();
    const footerContactVisible = !!footerContact && !hidden(footerContact) &&
      footerContactRect.width > 0 && footerContactRect.height > 0;
    const footer = document.querySelector('.atelier-footer');
    const footerStyle = footer && getComputedStyle(footer);
    const luminance = color => {
      const channels = color?.match(/[0-9.]+/g)?.slice(0, 3).map(Number);
      if (channels?.length !== 3) return null;
      const linear = channels.map(channel => {
        const value = channel / 255;
        return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
      });
      return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
    };
    const footerBackground = luminance(footerStyle?.backgroundColor);
    const footerInk = luminance(footerContact && getComputedStyle(footerContact).color);
    const footerPalette = footerStyle && {
      background: footerStyle.backgroundColor,
      text: footerStyle.color,
      contact: footerContact && getComputedStyle(footerContact).color,
      lightBackground: footerBackground !== null && footerInk !== null && footerBackground > footerInk,
      contactContrast: footerBackground === null || footerInk === null ? null :
        (Math.max(footerBackground, footerInk) + .05) / (Math.min(footerBackground, footerInk) + .05),
    };
    const headerLogo = document.querySelector('.atelier-header .logo');
    const headerRequest = document.querySelector('.atelier-header a.atelier-request-link[href="/request"]');
    const frames = Array.from(document.querySelectorAll('.home-hero ol.stitch-journey > li[data-stage]'));
    const storyboard = frames.map(frame => {
      const photo = frame.querySelector('.stitch-frame-media > img');
      return { stage: frame.dataset.stage, visible: !hidden(frame),
        imageLoaded: !!photo && photo.complete && photo.naturalWidth > 0,
        alt: photo?.alt,
        interactiveControls: frame.querySelectorAll('a, button, input, select, [role="button"], [tabindex]').length };
    });
    return { route: location.pathname + location.search, language: document.documentElement.lang,
      viewport: width, documentWidth: document.documentElement.scrollWidth,
      h1: document.querySelector('main h1')?.textContent.trim(), images: document.images.length,
      footerContactVisible, footerPalette,
      headerLogoVisible: !!headerLogo && !hidden(headerLogo),
      headerRequestVisible: !!headerRequest && !hidden(headerRequest),
      storyboard,
      heroActions: Array.from(document.querySelectorAll('.home-hero-actions a'), link => link.getAttribute('href')),
      brokenImages, overflow: overflow.slice(0, 30), allowedHorizontalScrollers: [...scrollers],
      apiCalls: window.__atelierApiCalls || [] };
  })()`);
  report.pages.push(result);
  assert(result.language === currentLanguage, `Unexpected language at ${route}/${width}`);
  assert(result.documentWidth <= width + 1, `Document overflow at ${route}/${width}/${currentLanguage}: ${result.documentWidth}`);
  assert(!result.overflow.length, `Element overflow at ${route}/${width}/${currentLanguage}: ${JSON.stringify(result.overflow.slice(0, 5))}`);
  assert(!result.brokenImages.length, `Broken images at ${route}/${width}/${currentLanguage}: ${JSON.stringify(result.brokenImages)}`);
  assert(result.footerContactVisible, `Footer contact link is hidden at ${route}/${width}/${currentLanguage}`);
  assert(result.headerLogoVisible && result.headerRequestVisible, `Header brand or start-stitching action is hidden at ${route}/${width}/${currentLanguage}`);
  assert(result.footerPalette?.lightBackground && result.footerPalette.contactContrast >= 4.5,
    `Footer contact needs readable dark text on a light background at ${route}/${width}/${currentLanguage}: ${JSON.stringify(result.footerPalette)}`);
  if (route === "/") {
    assert(JSON.stringify(result.storyboard.map(frame => frame.stage)) === JSON.stringify(["fabric", "design", "stitch", "wear"]),
      `Stitching journey is missing or out of order at ${width}/${currentLanguage}`);
    assert(result.storyboard.every(frame => frame.visible && frame.imageLoaded && frame.alt && frame.interactiveControls === 0),
      `Journey frames must be visible, loaded and static at ${width}/${currentLanguage}: ${JSON.stringify(result.storyboard)}`);
    assert(!/embroidery|कढ़ाई|कढ़ाई/i.test(result.h1), `Prior embroidery hero template was not refreshed at ${width}/${currentLanguage}`);
    assert(result.heroActions.includes("/catalogue") && result.heroActions.includes("/request?source=reference"),
      `Genuine catalogue/reference hero actions are missing at ${width}/${currentLanguage}`);
  }
  assert(!result.apiCalls.some(call => !['GET', 'HEAD'].includes(call.method) && call.route !== '/pricing/estimate'), 'Unexpected write in read-only visual fixture');
  if (capture) {
    const label = route === "/" ? "home" : route.startsWith("/request") ? "request" : route.split("?")[0].replaceAll("/", "");
    const destination = path.join(artifacts, `atelier-${label}-${currentLanguage}-${width}.png`);
    const metrics = await send("Page.getLayoutMetrics");
    const size = metrics.cssContentSize || metrics.contentSize;
    const image = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true,
      clip: { x: 0, y: 0, width, height: Math.ceil(size.height), scale: 1 } });
    await writeFile(destination, Buffer.from(image.data, "base64"));
    report.screenshots.push(path.relative(root, destination).replaceAll("\\", "/"));
  }
  console.log(`${currentLanguage} ${width}px ${route}: bounds and ${result.images} images passed`);
}

async function press(key, code, windowsVirtualKeyCode) {
  await send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode,
    ...(key === "Enter" ? { text: "\r", unmodifiedText: "\r" } : {}) });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode });
}

try {
  await stat(path.join(dist, "index.html"));
  await mkdir(artifacts, { recursive: true });
  const profile = await mkdtemp(path.join(artifacts, "atelier-chrome-profile-"));
  server = createServer(async (request, response) => {
    try {
      const requestPath = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
      if (requestPath.startsWith("/api/")) { response.writeHead(503); response.end("Browser fixture was not installed."); return; }
      const candidate = path.resolve(dist, "." + requestPath);
      if (candidate !== dist && !candidate.startsWith(dist + path.sep)) { response.writeHead(403); response.end(); return; }
      let target = candidate;
      try { if (!(await stat(target)).isFile()) target = path.join(dist, "index.html"); }
      catch { target = path.extname(requestPath) ? null : path.join(dist, "index.html"); }
      if (!target) { response.writeHead(404); response.end(); return; }
      const body = await readFile(target);
      response.writeHead(200, { "Content-Type": mime[path.extname(target)] || "application/octet-stream", "Cache-Control": "no-store" });
      response.end(body);
    } catch { response.writeHead(500); response.end(); }
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
  let websocket;
  let chromeError;
  browser = spawn(chromePath, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
  browser.on("error", error => { chromeError = error; });
  browser.stderr.on("data", chunk => { const match = String(chunk).match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) websocket = match[1]; });
  await waitFor(() => { if (chromeError) throw chromeError; return websocket; }, "Chrome did not start");
  connection = new WebSocket(websocket);
  await new Promise((resolve, reject) => { connection.addEventListener("open", resolve, { once: true }); connection.addEventListener("error", reject, { once: true }); });
  connection.addEventListener("message", event => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.exceptionThrown") {
      const detail = message.params.exceptionDetails;
      report.exceptions.push(detail.exception?.description || detail.text);
    }
    const task = pending.get(message.id);
    if (!task) return;
    pending.delete(message.id); clearTimeout(task.timer);
    if (message.error) task.reject(new Error(message.error.message)); else task.resolve(message.result);
  });
  const target = await send("Target.createTarget", { url: "about:blank" }, undefined);
  session = (await send("Target.attachToTarget", { targetId: target.targetId, flatten: true }, undefined)).sessionId;
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", { source: fixtureSource });
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await viewport(1440);
  await navigate("/");
  for (const currentLanguage of ["en", "hi"]) {
    await language(currentLanguage);
    for (const width of [1440, 768, 390, 320]) {
      await viewport(width);
      for (const route of ["/", "/catalogue", "/how-it-works", "/contact", "/request?source=reference"]) {
        await navigate(route);
        await inspect(route, width, currentLanguage, route === "/" || width === 390);
      }
    }
  }
  report.checks.push("EN and HI: homepage, catalogue, how-it-works, contact and guest reference request at 1440/768/390/320px; actual element bounds, document width, loaded images and visible footer contact link.");
  report.checks.push("Four static, loaded fabric/design/stitch/wear frames; persisted prior hero templates refresh to stitching copy; visible header brand/request action and measured footer contact contrast on a light background.");
  for (const currentLanguage of ["en", "hi"]) {
    await language(currentLanguage);
    for (const width of [1200, 1201]) {
      await viewport(width);
      await navigate("/");
      await inspect("/", width, currentLanguage);
    }
  }
  report.checks.push("Homepage header, stitching journey and footer remain usable on both sides of the 1200px navigation breakpoint in English and Hindi.");

  await viewport(390);
  await navigate("/");
  await language("en");
  await evaluate(`document.querySelector('.mobile-menu').focus()`);
  await press("Enter", "Enter", 13);
  await waitFor(() => evaluate(`document.querySelector('.mobile-menu')?.getAttribute('aria-expanded') === 'true'`), "Keyboard Enter did not open mobile menu");
  await press("Escape", "Escape", 27);
  await waitFor(() => evaluate(`document.querySelector('.mobile-menu')?.getAttribute('aria-expanded') === 'false' && document.activeElement === document.querySelector('.mobile-menu')`), "Escape did not close menu and restore toggle focus");
  await press("Enter", "Enter", 13);
  await waitFor(() => evaluate(`document.querySelector('.mobile-menu')?.getAttribute('aria-expanded') === 'true'`), "Menu did not reopen");
  await viewport(1440);
  await waitFor(() => evaluate(`document.querySelector('.mobile-menu')?.getAttribute('aria-expanded') === 'false'`), "Desktop resize did not close mobile menu");
  await viewport(390);
  assert(await evaluate(`getComputedStyle(document.querySelector('#primary-navigation')).display === 'none'`), "Mobile menu reopened after resizing back");
  report.checks.push("Mobile menu opens with keyboard Enter; Escape restores toggle focus; desktop resize clears open state.");

  await evaluate(`(() => { const link = document.querySelector('main a.button[href="/catalogue"]'); if (!link) throw Error('Hero catalogue CTA missing'); link.click(); })()`);
  await waitFor(() => evaluate(`location.pathname === '/catalogue' && document.querySelectorAll('.public-design-card').length === 4`), "Hero catalogue CTA did not show fixture collection");
  await evaluate(`(() => { const button = Array.from(document.querySelectorAll('.filter-tabs button')).find(item => item.textContent.trim() === 'Blouses'); if (!button) throw Error('Blouse filter missing'); button.click(); })()`);
  await waitFor(() => evaluate(`new URLSearchParams(location.search).get('garment') === 'blouse' && document.querySelectorAll('.public-design-card').length === 1`), "Catalogue garment filter did not filter fixture records");
  await navigate("/");
  const categoryHref = await evaluate(`(() => { const link = document.querySelector('main a[href="/catalogue?garment=kurti"]'); if (!link) throw Error('Kurti category link missing'); link.click(); return link.getAttribute('href'); })()`);
  await waitFor(() => evaluate(`location.pathname === '/catalogue' && new URLSearchParams(location.search).get('garment') === 'kurti'`), "Homepage category link did not open garment collection");
  await navigate("/");
  await evaluate(`(() => { const link = document.querySelector('main a[href="/request?source=reference"]'); if (!link) throw Error('Hero reference CTA missing'); link.click(); })()`);
  await waitFor(() => evaluate(`location.pathname === '/request' && new URLSearchParams(location.search).get('source') === 'reference' && !!document.querySelector('main h1')`), "Reference CTA did not open guest custom request");
  report.checks.push("Actual hero catalogue/reference CTA clicks, homepage garment link and catalogue blouse filter preserve routes and filter fixture records.");
  await navigate("/");
  await evaluate(`(() => { const link = document.querySelector('.atelier-header a.atelier-request-link[href="/request"]'); if (!link) throw Error('Header start stitching action missing'); link.click(); })()`);
  await waitFor(() => evaluate(`location.pathname === '/request' && !new URLSearchParams(location.search).has('source') && !!document.querySelector('main h1')`), "Header start stitching action did not open a new stitching request");
  report.checks.push("The visible header start-stitching action opens a real new request.");
  report.categoryHref = categoryHref;
  assert(report.exceptions.length === 0, "Uncaught browser exceptions: " + report.exceptions.join("; "));
  report.status = "passed";
} catch (error) {
  report.status = "failed";
  report.error = error.stack || error.message;
  if (connection?.readyState === WebSocket.OPEN && session) {
    try {
      report.failureContext = await evaluate(`({ route: location.href, fonts: document.fonts.status,
        images: Array.from(document.images).map(image => ({ src: image.currentSrc || image.src, complete: image.complete,
          loading: image.loading, width: image.naturalWidth, rect: image.getBoundingClientRect().toJSON(),
          collapsedDetails: !!image.closest('details:not([open])') })) })`);
      const image = await send("Page.captureScreenshot", { format: "png" });
      await writeFile(path.join(artifacts, "atelier-failure.png"), Buffer.from(image.data, "base64"));
      report.screenshots.push("artifacts/atelier-failure.png");
    } catch { /* Preserve the original failure if the target is already gone. */ }
  }
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  await mkdir(artifacts, { recursive: true });
  await writeFile(path.join(artifacts, "atelier-browser-report.json"), JSON.stringify(report, null, 2) + "\n");
  if (connection?.readyState === WebSocket.OPEN) {
    try { await send("Browser.close", {}, null); } catch { /* owned browser cleanup */ }
    connection.close();
  }
  for (const task of pending.values()) { clearTimeout(task.timer); task.reject(new Error("Browser closed")); }
  pending.clear();
  browser?.kill();
  if (server) await new Promise(resolve => server.close(resolve));
  console.log(JSON.stringify({ status: report.status, pages: report.pages.length, checks: report.checks,
    screenshots: report.screenshots, error: report.error, report: "artifacts/atelier-browser-report.json" }, null, 2));
}
