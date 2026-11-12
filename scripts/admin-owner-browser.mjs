import { spawn } from "node:child_process";
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const artifacts = path.join(root, "artifacts");
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

// Only disposable local identities/database and a fresh repository-local browser
// profile are used. This module never imports dotenv or configured provider data.
export async function withAdminBrowser(work) {
  process.env.KHWAB_NO_ENV_FILES = "1";
  for (const key of ["MONGODB_URI", "TEST_MONGODB_URI", "ALLOW_EXTERNAL_TEST_DATABASE", "JWT_SECRET", "IMAGEKIT_PRIVATE_KEY", "RESEND_API_KEY", "EMAIL_FROM", "PUBLIC_WEB_URL", "GOOGLE_CLIENT_ID", "MONGOMS_SYSTEM_BINARY"]) delete process.env[key];
  const temporary = path.join(artifacts, "isolated-tmp");
  await fs.mkdir(temporary, { recursive: true });
  process.env.TMP = process.env.TEMP = process.env.TMPDIR = temporary;
  process.env.MONGOMS_DOWNLOAD_DIR = path.join(root, "server/node_modules/.cache/mongodb-memory-server");
  process.env.MONGOMS_PREFER_GLOBAL_PATH = "false";
  if (process.platform === "win32") {
    const runtime = path.join(artifacts, "isolated-runtime");
    const key = Object.keys(process.env).find(key => key.toLowerCase() === "path") || "PATH";
    process.env[key] = runtime + path.delimiter + (process.env[key] || "");
  }
  const profile = await fs.mkdtemp(path.join(temporary, "khwab-admin-"));
  let fixture, server, browser, socket;
  const pending = new Map();
  try {
    const { startAuthFixture } = await import("./auth-browser-fixture.mjs");
    fixture = await startAuthFixture({ mediaUploads: true });
    const dist = path.join(root, "client/dist");
    server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url, "http://localhost");
        if (url.pathname.startsWith("/api/")) {
          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          const headers = { Origin: req.headers.origin || `http://${req.headers.host}` };
          for (const key of ["authorization", "content-type", "idempotency-key"]) if (req.headers[key]) headers[key] = req.headers[key];
          const response = await fetch(fixture.url + url.pathname + url.search, {
            method: req.method, headers,
            ...(!["GET", "HEAD"].includes(req.method) ? { body: Buffer.concat(chunks) } : {}),
            signal: AbortSignal.timeout(20000),
          });
          res.writeHead(response.status, { "Content-Type": response.headers.get("content-type") || "application/json", "Cache-Control": "no-store" });
          res.end(Buffer.from(await response.arrayBuffer()));
          return;
        }
        let target = path.resolve(dist, "." + decodeURIComponent(url.pathname));
        if (!target.startsWith(dist + path.sep) && target !== dist) { res.writeHead(404); res.end(); return; }
        let stat = await fs.stat(target).catch(() => null);
        if (!stat?.isFile()) {
          if (/^\/(assets|brand|images|design-library|design-guides)\//.test(url.pathname)) { res.writeHead(404); res.end(); return; }
          target = path.join(dist, "index.html");
        }
        const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".woff2": "font/woff2" };
        res.writeHead(200, { "Content-Type": types[path.extname(target)] || "application/octet-stream" });
        res.end(await fs.readFile(target));
      } catch { res.writeHead(502, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: { message: "Isolated preview request failed." } })); }
    });
    await new Promise((resolve, reject) => { server.listen(0, "127.0.0.1", resolve); server.once("error", reject); });
    const base = "http://127.0.0.1:" + server.address().port;
    fixture.addFrontendOrigin(base);
    let devtools;
    browser = spawn(process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
    browser.stderr.on("data", chunk => { const match = String(chunk).match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) devtools = match[1]; });
    browser.on("error", () => {});
    async function waitFor(read, message, timeout = 20000) {
      const end = Date.now() + timeout;
      while (Date.now() < end) { try { const value = await read(); if (value) return value; } catch {} await pause(80); }
      throw new Error(message);
    }
    await waitFor(() => devtools, "The isolated Chrome session did not start.");
    socket = new WebSocket(devtools);
    await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
    let next = 0;
    const browserErrors = [];
    const browserEvents = [];
    socket.addEventListener("message", event => {
      const response = JSON.parse(event.data);
      if (response.method === "Runtime.exceptionThrown") browserErrors.push("Uncaught browser exception");
      if (response.method === "Runtime.consoleAPICalled" && response.params?.type === "error") browserErrors.push("Browser console error");
      if (response.method === "Runtime.exceptionThrown" || (response.method === "Runtime.consoleAPICalled" && response.params?.type === "error") || (response.method === "Log.entryAdded" && response.params?.entry?.level === "error")) browserEvents.push({ type: response.method, source: response.params?.entry?.source || "javascript" });
      const task = pending.get(response.id);
      if (task) { pending.delete(response.id); clearTimeout(task.timer); response.error ? task.reject(new Error(response.error.message)) : task.resolve(response.result); }
    });
    const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
      const id = ++next;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error("Chrome command timed out.")); }, 20000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
    const target = await send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
    await send("Page.enable", {}, sessionId);
    await send("Runtime.enable", {}, sessionId);
    await send("Log.enable", {}, sessionId);
    const evaluate = async expression => {
      const response = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sessionId);
      if (response.exceptionDetails) throw new Error("The isolated browser action failed.");
      return response.result.value;
    };
    const navigate = async route => { await send("Page.navigate", { url: base + route }, sessionId); await waitFor(() => evaluate('document.readyState === "complete" && document.querySelector("#root")?.textContent.length > 30'), "The preview page did not render."); };
    const fill = (id, value) => evaluate(`(()=>{const node=document.getElementById(${JSON.stringify(id)});if(!node)throw Error('Missing field');const prototype=node instanceof HTMLSelectElement?HTMLSelectElement.prototype:node instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(prototype,'value').set.call(node,${JSON.stringify(value)});node.dispatchEvent(new Event(node instanceof HTMLSelectElement?'change':'input',{bubbles:true}));})()`);
    const click = text => evaluate(`(()=>{const node=[...document.querySelectorAll('button,a')].find(node=>node.textContent.trim()===${JSON.stringify(text)});if(!node||node.disabled)throw Error('Missing or disabled action');node.click();})()`);
    const uploadFile = async (selector, relativePath) => {
      const target = path.resolve(root, relativePath);
      if (!target.startsWith(root + path.sep)) throw new Error("Browser upload must stay in the repository.");
      const document = await send("DOM.getDocument", {}, sessionId);
      const { nodeId } = await send("DOM.querySelector", { nodeId: document.root.nodeId, selector }, sessionId);
      if (!nodeId) throw new Error("The upload control did not exist.");
      await send("DOM.setFileInputFiles", { nodeId, files: [target] }, sessionId);
    };
    const screenshot = async (name, width = 1440, height = 1000) => {
      if (!/^[a-z0-9-]+$/.test(name)) throw new Error("Invalid screenshot name.");
      await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 600 }, sessionId);
      await pause(120);
      const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, sessionId);
      const target = path.join(artifacts, name + ".png");
      await fs.writeFile(target, Buffer.from(shot.data, "base64"));
      return target;
    };
    await navigate("/login?returnTo=%2Fadmin");
    await waitFor(() => evaluate("Boolean(document.getElementById('auth-email'))"), "The sign-in form did not load.");
    await fill("auth-email", fixture.adminEmail);
    await fill("auth-password", fixture.password);
    await evaluate("document.getElementById('auth-password').form.requestSubmit()");
    await waitFor(() => evaluate("location.pathname === '/admin' && Boolean(document.querySelector('.admin-nav'))"), "The isolated owner could not open the workspace.");
    return await work({ base, fixture, send: (method, params) => send(method, params, sessionId), evaluate, navigate, waitFor, screenshot, fill, click, uploadFile, browserErrors, browserEvents });
  } finally {
    for (const task of pending.values()) clearTimeout(task.timer);
    socket?.close();
    browser?.kill();
    await pause(200);
    if (server) await new Promise(resolve => server.close(resolve));
    await fixture?.close();
    const resolved = path.resolve(profile);
    if (resolved.startsWith(path.resolve(temporary) + path.sep) && path.basename(resolved).startsWith("khwab-admin-")) await fs.rm(resolved, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const label = process.argv.includes("--after") ? "after" : "before";
  try {
    const captures = await withAdminBrowser(async browser => {
      await browser.waitFor(() => browser.evaluate("Boolean(document.querySelector('.admin-content h1'))"), "The owner dashboard did not load.");
      const paths = [await browser.screenshot(`admin-${label}-desktop`)];
      await browser.navigate("/admin/options");
      await browser.waitFor(() => browser.evaluate("Boolean(document.querySelector('.admin-content h1'))"), "The choices page did not load.");
      paths.push(await browser.screenshot(`admin-options-${label}-desktop`));
      paths.push(await browser.screenshot(`admin-${label}-mobile`, 390, 844));
      return paths.map(value => path.relative(root, value));
    });
    process.stdout.write(JSON.stringify({ isolated: true, label, captures }) + "\n");
  } catch (error) { process.stderr.write(JSON.stringify({ stage: "isolated-admin-capture", error: error.name }) + "\n"); process.exitCode = 1; }
}
