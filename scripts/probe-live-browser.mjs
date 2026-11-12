import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Fresh, unauthenticated browser. No environment files, stored accounts,
// cookies, request bodies, authorization headers or signed image URLs logged.
const root = fileURLToPath(new URL("../", import.meta.url));
const origin = "https://newkhwab-stitch.vercel.app";
const simulateTransientFailure = process.argv.includes("--transient-collection");
const capturePhase = process.argv.find(value => value.startsWith("--capture="))?.slice(10);
if (capturePhase && !["ux-before", "ux-after"].includes(capturePhase)) throw new Error("INVALID_CAPTURE_PHASE");
const captureLanguage = process.argv.includes("--hindi") ? "hi" : "en";
let injectedFailure = false;
const artifacts = path.join(root, "artifacts");
await fs.mkdir(artifacts, { recursive: true });
const profile = await fs.mkdtemp(path.join(artifacts, "live-browser-"));
const pending = new Map();
const requests = new Map();
const results = [];
let browser, socket, session, debuggerUrl, nextId = 0;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(check, message, timeout = 20000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const result = await check();
    if (result) return result;
    await pause(150);
  }
  throw new Error(message);
}
function send(method, params = {}, sessionId = session) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error("BROWSER_COMMAND_TIMEOUT")); }, 15000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
}
async function state() {
  const value = await send("Runtime.evaluate", { expression: `JSON.stringify({ready:document.readyState,designCards:document.querySelectorAll('.design-card').length,alerts:[...document.querySelectorAll('[role="alert"]')].map(el=>el.textContent),collectionLoading:document.body.innerText.includes('Opening the collection'),collectionEmpty:document.body.innerText.includes('The collection is being curated')})`, returnByValue: true });
  return JSON.parse(value.result.value);
}
try {
  browser = spawn(process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
  browser.on("error", () => {});
  browser.stderr.on("data", data => { debuggerUrl ||= String(data).match(/DevTools listening on (ws:\/\/[^\s]+)/)?.[1]; });
  await waitFor(() => debuggerUrl, "BROWSER_UNAVAILABLE");
  socket = new WebSocket(debuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", () => reject(new Error("BROWSER_CONNECTION_FAILED")), { once: true }); });
  socket.addEventListener("message", event => {
    const value = JSON.parse(event.data);
    if (value.id && pending.has(value.id)) {
      const task = pending.get(value.id); pending.delete(value.id); clearTimeout(task.timer);
      if (value.error) task.reject(new Error("BROWSER_COMMAND_FAILED")); else task.resolve(value.result);
    }
    if (value.method === "Network.requestWillBeSent") {
      const url = new URL(value.params.request.url);
      if (url.pathname.startsWith("/api/")) requests.set(value.params.requestId, { origin: url.origin, path: url.pathname, started: Date.now() });
    }
    if (value.method === "Network.responseReceived") {
      const request = requests.get(value.params.requestId);
      if (request) results.push({ event: "api_response", origin: request.origin, path: request.path, status: value.params.response.status, durationMs: Date.now() - request.started, requestId: value.params.response.headers["x-request-id"] || value.params.response.headers["X-Request-ID"] || null });
    }
    if (value.method === "Network.loadingFailed") {
      const request = requests.get(value.params.requestId);
      if (request) results.push({ event: "api_failed", origin: request.origin, path: request.path, error: value.params.errorText, canceled: value.params.canceled || false, corsError: value.params.corsErrorStatus?.corsError || null });
    }
    if (value.method === "Fetch.requestPaused") {
      if (!injectedFailure) {
        injectedFailure = true;
        results.push({ event: "injected_collection_failure", browserOnly: true });
        send("Fetch.failRequest", { requestId: value.params.requestId, errorReason: "ConnectionReset" }).catch(() => {});
      } else send("Fetch.continueRequest", { requestId: value.params.requestId }).catch(() => {});
    }
  });
  const target = await send("Target.createTarget", { url: "about:blank" });
  session = (await send("Target.attachToTarget", { targetId: target.targetId, flatten: true })).sessionId;
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  if (capturePhase) await send("Page.addScriptToEvaluateOnNewDocument", { source: `try { localStorage.setItem('khwab.language', '${captureLanguage}'); } catch {}` });
  if (simulateTransientFailure) await send("Fetch.enable", { patterns: [{ urlPattern: origin + "/api/designs*", requestStage: "Request" }] });
  const viewports = capturePhase ? [{ width: 1366, height: 900 }, { width: 768, height: 1024 }, { width: 390, height: 844 }] : [{ width: 1366, height: 900 }, { width: 390, height: 844 }];
  for (const viewport of viewports) {
    await send("Emulation.setDeviceMetricsOverride", { ...viewport, deviceScaleFactor: 1, mobile: viewport.width < 600 });
    await send("Page.navigate", { url: origin + "/" });
    const rendered = await waitFor(async () => { const current = await state(); return current.ready === "complete" && !current.collectionLoading && (current.designCards || current.collectionEmpty || current.alerts.length) ? current : null; }, "COLLECTION_DID_NOT_SETTLE", 90000);
    results.push({ event: "home_rendered", viewport: viewport.width, ...rendered });
    if (capturePhase) {
      await send("Runtime.evaluate", { expression: "window.scrollTo(0,0)" });
      const screenshot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      const filename = `${capturePhase}-home-${captureLanguage}-${viewport.width}.png`;
      await fs.writeFile(path.join(artifacts, filename), Buffer.from(screenshot.data, "base64"));
      results.push({ event: "screenshot", filename, language: captureLanguage, viewport: viewport.width });
    }
    if (rendered.alerts.length || (!rendered.designCards && !rendered.collectionEmpty)) process.exitCode = 1;
  }
  if (simulateTransientFailure) {
    const firstRender = results.findIndex(result => result.event === "home_rendered");
    const firstLoad = results.slice(0, firstRender);
    if (!injectedFailure ||
      !firstLoad.some(result => result.event === "api_failed" && result.path === "/api/designs") ||
      !firstLoad.some(result => result.event === "api_response" && result.path === "/api/designs" && result.status === 200))
      throw new Error("TRANSIENT_RECOVERY_NOT_OBSERVED");
  }
} catch (error) {
  results.push({ event: "probe_failed", code: /^[A-Z_]+$/.test(error.message) ? error.message : error.name });
  process.exitCode = 1;
} finally {
  const report = { checkedAt: new Date().toISOString(), origin, authenticated: false, simulateTransientFailure, results };
  await fs.writeFile(path.join(artifacts, simulateTransientFailure ? "live-browser-transient-probe.json" : "live-browser-probe.json"), JSON.stringify(report, null, 2));
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  if (socket?.readyState === WebSocket.OPEN) { try { await send("Browser.close", {}, null); } catch { /* owned process cleanup */ } socket.close(); }
  if (browser?.exitCode === null) browser.kill();
  const resolvedProfile = path.resolve(profile);
  if (!resolvedProfile.startsWith(path.resolve(artifacts) + path.sep + "live-browser-")) throw new Error("UNSAFE_PROFILE_CLEANUP");
  try { await fs.rm(resolvedProfile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch { /* locked files stay in ignored workspace artifacts */ }
}
