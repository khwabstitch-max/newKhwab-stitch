import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Actual Chromium rendering against the production build. No live-provider claims.
// Use CHROME_PATH if Chrome is not at the Windows default location.
const root = fileURLToPath(new URL("../", import.meta.url));
const chromePath =
  process.env.CHROME_PATH ||
  "C:/Program Files/Google/Chrome/Application/chrome.exe";
const base = "http://127.0.0.1:4173";
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const profile = await mkdtemp(path.join(os.tmpdir(), "khwab-browser-"));
let browser;
let preview;
let connection;
let nextId = 0;
const pending = new Map();
const exceptions = [];
const results = [];
const artifacts = path.join(root, "artifacts");
const withCustomization = process.argv.includes("--customization");
const withPaging =
  !withCustomization &&
  (process.argv.includes("--paging") ||
    process.env.KHWAB_BROWSER_PAGING === "1");
const withAuth =
  !withCustomization && !withPaging && process.env.KHWAB_BROWSER_AUTH === "1";
let authFixture;
let customizationFixture;
async function waitFor(fn, message, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try {
      const value = await fn();
      if (value) return value;
    } catch {
      /* retry read only */
    }
    await delay(100);
  }
  throw new Error(message);
}
function send(method, params = {}, sessionId) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`CDP timeout: ${method}`));
    }, 15000);
    pending.set(id, { resolve, reject, timeout });
    connection.send(
      JSON.stringify({
        id,
        method,
        params,
        ...(sessionId ? { sessionId } : {}),
      }),
    );
  });
}
let session;
async function evaluate(expression) {
  const reply = await send(
    "Runtime.evaluate",
    { expression, returnByValue: true, awaitPromise: true },
    session,
  );
  if (reply.exceptionDetails)
    throw new Error(
      reply.exceptionDetails.exception?.description ||
        reply.exceptionDetails.text,
    );
  return reply.result.value;
}
async function navigate(route) {
  await send("Page.navigate", { url: base + route }, session);
  await waitFor(
    () =>
      evaluate(
        'document.readyState === "complete" && document.querySelector("#root")?.textContent.length > 40',
      ),
    `Page did not render: ${route}`,
  );
  await delay(300);
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
try {
  if (withCustomization) {
    const { startCustomizationFixture } =
      await import("./customization-browser-fixture.mjs");
    customizationFixture = await startCustomizationFixture();
  }
  if (withAuth) {
    const { startAuthFixture } = await import("./auth-browser-fixture.mjs");
    authFixture = await startAuthFixture();
  }
  preview = spawn(
    process.execPath,
    [
      path.join(root, "client/node_modules/vite/bin/vite.js"),
      "preview",
      "--host",
      "127.0.0.1",
      "--port",
      "4173",
      "--strictPort",
    ],
    {
      cwd: path.join(root, "client"),
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let previewErrors = "";
  preview.stderr.on("data", (chunk) => {
    previewErrors += chunk;
  });
  await waitFor(async () => {
    if (preview.exitCode !== null)
      throw new Error(previewErrors || "Preview exited");
    const response = await fetch(base);
    return response.ok;
  }, "Production preview did not start");
  let devtoolsUrl;
  browser = spawn(
    chromePath,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "about:blank",
    ],
    { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] },
  );
  browser.on("error", () => {});
  browser.stderr.on("data", (chunk) => {
    const match = String(chunk).match(/DevTools listening on (ws:\/\/[^\s]+)/);
    if (match) devtoolsUrl = match[1];
  });
  await waitFor(
    () => devtoolsUrl,
    "Chrome unavailable. Set CHROME_PATH to an installed Chromium browser.",
  );
  connection = new WebSocket(devtoolsUrl);
  await new Promise((resolve, reject) => {
    connection.addEventListener("open", resolve, { once: true });
    connection.addEventListener("error", reject, { once: true });
  });
  connection.addEventListener("message", (event) => {
    const value = JSON.parse(event.data);
    if (value.method === "Runtime.exceptionThrown")
      exceptions.push(value.params.exceptionDetails.text);
    if (value.id && pending.has(value.id)) {
      const task = pending.get(value.id);
      pending.delete(value.id);
      clearTimeout(task.timeout);
      if (value.error) task.reject(new Error(value.error.message));
      else task.resolve(value.result);
    }
  });
  const target = await send("Target.createTarget", { url: "about:blank" });
  session = (
    await send("Target.attachToTarget", {
      targetId: target.targetId,
      flatten: true,
    })
  ).sessionId;
  await send("Page.enable", {}, session);
  await send("Runtime.enable", {}, session);
  if (withPaging) {
    const { paginationBrowserSource } =
      await import("./pagination-browser-fixture.mjs");
    await send(
      "Page.addScriptToEvaluateOnNewDocument",
      { source: paginationBrowserSource },
      session,
    );
  }
  if (authFixture || customizationFixture) {
    await send(
      "Page.addScriptToEvaluateOnNewDocument",
      {
        source: `(() => { const original = window.fetch.bind(window); window.fetch = (input, options) => { const url = new URL(typeof input === 'string' ? input : input.url, location.href); if(url.pathname.startsWith('/api/')) return original(${JSON.stringify((authFixture || customizationFixture).url)} + url.pathname + url.search, options); return original(input, options); }; })()`,
      },
      session,
    );
  }
  await send("Page.bringToFront", {}, session);
  await send("Emulation.setFocusEmulationEnabled", { enabled: true }, session);
  await send(
    "Emulation.setDeviceMetricsOverride",
    { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false },
    session,
  );
  if (withCustomization) {
    const { verifyCustomizationInBrowser } =
      await import("./customization-browser-fixture.mjs");
    await verifyCustomizationInBrowser({
      fixture: customizationFixture,
      send,
      evaluate,
      navigate,
      waitFor,
      session,
      results,
    });
    assert(
      exceptions.length === 0,
      "Uncaught browser exceptions: " + exceptions.join("; "),
    );
    console.log(
      JSON.stringify(
        {
          status: "passed",
          checks: results,
          limits:
            "Deterministic public localhost API using actual pricing/schema code in real Chrome. No database, model runtime, account provider, live data or deployment.",
        },
        null,
        2,
      ),
    );
  } else if (withPaging) {
    const { verifyPaginationInBrowser } =
      await import("./pagination-browser-fixture.mjs");
    await verifyPaginationInBrowser({
      send,
      evaluate,
      navigate,
      waitFor,
      session,
      results,
    });
    assert(
      exceptions.length === 0,
      "Uncaught browser exceptions: " + exceptions.join("; "),
    );
    console.log(
      JSON.stringify(
        {
          status: "passed",
          checks: results,
          limits:
            "Public pagination fixture in real Chrome. No database, authentication provider, live data or deployment.",
        },
        null,
        2,
      ),
    );
  } else if (process.env.KHWAB_BROWSER_AUTH_ONLY === "1") {
    if (!authFixture)
      throw new Error(
        "KHWAB_BROWSER_AUTH=1 is required for focused browser verification.",
      );
    const { verifyAuthInBrowser } = await import("./auth-browser-fixture.mjs");
    await verifyAuthInBrowser({
      fixture: authFixture,
      send,
      evaluate,
      navigate,
      waitFor,
      session,
      results,
    });
    assert(
      exceptions.length === 0,
      "Uncaught browser exceptions: " + exceptions.join("; "),
    );
    console.log(
      JSON.stringify(
        {
          status: "passed",
          checks: results,
          limits:
            "Focused customer/admin browser checks use isolated MongoDB and real local JWTs. Providers are mocked; no live customer data or deployment.",
        },
        null,
        2,
      ),
    );
  } else {
    await navigate("/");
    assert(
      await evaluate('document.body.innerText.toLowerCase().includes("khwab")'),
      "Home branding missing",
    );
    assert(
      await evaluate('document.querySelectorAll("h1").length === 1'),
      "Home needs one primary heading",
    );
    assert(
      await evaluate('document.querySelector("main") !== null'),
      "Main landmark missing",
    );
    assert(
      await evaluate(
        'document.querySelectorAll("a[href], button").length >= 5',
      ),
      "Navigation/actions missing",
    );
    results.push(
      "Desktop home rendered with primary heading, landmark and navigation.",
    );
    await mkdir(artifacts, { recursive: true });
    let capture = await send(
      "Page.captureScreenshot",
      { format: "png", captureBeyondViewport: false },
      session,
    );
    await writeFile(
      path.join(artifacts, "home-desktop.png"),
      Buffer.from(capture.data, "base64"),
    );
    const publicLinks = await evaluate(
      `Array.from(document.querySelectorAll('a[href]')).map(a=>a.getAttribute('href')).filter(h=>h?.startsWith('/') && !h.startsWith('//'))`,
    );
    const routes = [...new Set(publicLinks)]
      .filter(
        (route) =>
          !/^\/(admin|orders|profile|request|new-request|account|worker)/.test(
            route,
          ),
      )
      .slice(0, 12);
    for (const route of routes) {
      await navigate(route);
      assert(
        await evaluate('document.querySelector("main") !== null'),
        `Main landmark missing: ${route}`,
      );
      assert(
        await evaluate('document.querySelector("h1") !== null'),
        `Page heading missing: ${route}`,
      );
      results.push(`Public route rendered: ${route}`);
    }
    if (authFixture) {
      for (const width of [1440, 390]) {
        await send(
          "Emulation.setDeviceMetricsOverride",
          { width, height: 1000, deviceScaleFactor: 1, mobile: width < 640 },
          session,
        );
        await navigate("/designs/qa-stitching-design");
        assert(
          await evaluate(
            `fetch('/design-library/teal-kurti-board.png').then(response=>response.ok)`,
          ),
          "Original board asset did not load",
        );
        const metrics = await send("Page.getLayoutMetrics", {}, session);
        const shot = await send(
          "Page.captureScreenshot",
          {
            format: "png",
            captureBeyondViewport: true,
            clip: {
              x: 0,
              y: 0,
              width,
              height: Math.ceil(metrics.cssContentSize.height),
              scale: 1,
            },
          },
          session,
        );
        await writeFile(
          path.join(artifacts, `teal-kurti-${width}.png`),
          Buffer.from(shot.data, "base64"),
        );
      }
    }
    for (const width of [320, 390, 768, 1024]) {
      await send(
        "Emulation.setDeviceMetricsOverride",
        { width, height: 844, deviceScaleFactor: 1, mobile: width < 640 },
        session,
      );
      for (const route of ["/", ...routes]) {
        await navigate(route);
        const dimensions = await evaluate(
          "({viewport:innerWidth,body:document.documentElement.scrollWidth})",
        );
        assert(
          dimensions.body <= dimensions.viewport + 1,
          `Horizontal overflow at ${width}px: ${route} (${dimensions.body})`,
        );
        if (route === "/") {
          const heading = await evaluate(
            '({right:document.querySelector(".hero h1 em").getBoundingClientRect().right,viewport:innerWidth})',
          );
          assert(
            heading.right <= heading.viewport,
            `Hero heading clipped at ${width}px`,
          );
        }
      }
    }
    results.push(
      "320/390/768/1024px layouts have no public-route overflow or clipped hero heading.",
    );
    await send(
      "Emulation.setDeviceMetricsOverride",
      { width: 390, height: 844, deviceScaleFactor: 1, mobile: true },
      session,
    );
    await navigate("/");
    capture = await send(
      "Page.captureScreenshot",
      { format: "png", captureBeyondViewport: false },
      session,
    );
    await writeFile(
      path.join(artifacts, "home-mobile.png"),
      Buffer.from(capture.data, "base64"),
    );
    // Switch the actual React selector, then verify both language and saved preference.
    const chooseLanguage = async (language) => {
      await evaluate(
        `(()=>{const select=document.querySelector('.language-picker select');const setter=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set;setter.call(select,${JSON.stringify(language)});select.dispatchEvent(new Event('change',{bubbles:true}));})()`,
      );
      await waitFor(
        () =>
          evaluate(
            `document.documentElement.lang === ${JSON.stringify(language)}`,
          ),
        "Language selection did not render",
      );
    };
    await chooseLanguage("hi");
    assert(
      await evaluate(
        `document.querySelector('h1').textContent.includes('आपकी सोच')`,
      ),
      "Hindi home heading missing",
    );
    await navigate("/");
    assert(
      await evaluate(
        `document.documentElement.lang==='hi' && localStorage.getItem('khwab.language')==='hi'`,
      ),
      "Saved Hindi preference did not survive reload",
    );
    for (const width of [320, 390, 768, 1024, 1440]) {
      await send(
        "Emulation.setDeviceMetricsOverride",
        { width, height: 900, deviceScaleFactor: 1, mobile: width < 640 },
        session,
      );
      for (const route of ["/", ...routes]) {
        await navigate(route);
        const layout = await evaluate(
          `({width:innerWidth,scroll:document.documentElement.scrollWidth,select:document.querySelector('.language-picker').getBoundingClientRect().right})`,
        );
        assert(
          layout.scroll <= layout.width + 1,
          `Hindi horizontal overflow at ${width}px on ${route}: ${layout.scroll}`,
        );
        assert(
          layout.select <= layout.width,
          `Language selector clipped at ${width}px`,
        );
      }
      await navigate("/");
      if (width === 390 || width === 1440) {
        const shot = await send(
          "Page.captureScreenshot",
          { format: "png", captureBeyondViewport: false },
          session,
        );
        await writeFile(
          path.join(artifacts, `home-hindi-${width}.png`),
          Buffer.from(shot.data, "base64"),
        );
      }
    }
    await navigate("/login");
    await evaluate(`document.getElementById('auth-email').reportValidity()`);
    assert(
      await evaluate(
        `/[^\\x00-\\x7F]/.test(document.getElementById('auth-email').validationMessage)`,
      ),
      "Native required message is not Hindi",
    );
    await evaluate(
      `(()=>{const input=document.getElementById('auth-email');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'meera@example.test');input.dispatchEvent(new Event('input',{bubbles:true}));})()`,
    );
    await chooseLanguage("en");
    assert(
      await evaluate(
        `document.getElementById('auth-email').value==='meera@example.test'`,
      ),
      "Language change cleared login input",
    );
    results.push(
      "Hindi/English selector persists on reload; Hindi public pages fit 320/390/768/1024/1440px; native validation and form-state preservation verified.",
    );
    await send(
      "Emulation.setDeviceMetricsOverride",
      { width: 390, height: 844, deviceScaleFactor: 1, mobile: true },
      session,
    );
    await navigate("/this-route-does-not-exist");
    assert(
      await evaluate(
        "/not found|404|lost|missing|couldn.t find|could not find|loose thread/i.test(document.body.innerText)",
      ),
      "Missing not-found state",
    );
    results.push("Unknown route presents a not-found state.");
    await navigate("/request");
    assert(
      await evaluate(
        'location.pathname === "/request" && Boolean(document.querySelector(".wizard-form"))',
      ),
      "Guest customization must remain accessible before login",
    );
    results.push("Guest request configuration is accessible before sign-in.");
    for (const route of [
      "/orders",
      "/profile",
      "/account",
      "/account/support",
      "/worker",
      "/admin",
    ]) {
      await navigate(route);
      await waitFor(
        () => evaluate('location.pathname === "/login"'),
        `Unauthenticated route was not gated: ${route}`,
      );
    }
    results.push(
      "Unauthenticated orders/profile/account/support/worker/admin routes redirect to login while guest customization remains available.",
    );
    if (authFixture) {
      const { verifyAuthInBrowser } =
        await import("./auth-browser-fixture.mjs");
      await verifyAuthInBrowser({
        fixture: authFixture,
        send,
        evaluate,
        navigate,
        waitFor,
        session,
        results,
      });
    }
    await navigate("/");
    await evaluate(
      `document.querySelector('button[aria-label="Open navigation"]').focus()`,
    );
    await send(
      "Input.dispatchKeyEvent",
      {
        type: "keyDown",
        key: "Enter",
        code: "Enter",
        windowsVirtualKeyCode: 13,
        text: "\r",
        unmodifiedText: "\r",
      },
      session,
    );
    await send(
      "Input.dispatchKeyEvent",
      { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 },
      session,
    );
    await waitFor(
      () =>
        evaluate(
          `document.querySelector('button[aria-expanded="true"]') !== null`,
        ),
      "Keyboard could not open mobile navigation",
    );
    await send(
      "Input.dispatchKeyEvent",
      { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 },
      session,
    );
    await send(
      "Input.dispatchKeyEvent",
      { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 },
      session,
    );
    assert(
      await evaluate(
        'document.activeElement?.getAttribute("href") === "/catalogue"',
      ),
      "Mobile navigation keyboard focus order failed",
    );
    await send(
      "Input.dispatchKeyEvent",
      {
        type: "keyDown",
        key: "Enter",
        code: "Enter",
        windowsVirtualKeyCode: 13,
        text: "\r",
        unmodifiedText: "\r",
      },
      session,
    );
    await send(
      "Input.dispatchKeyEvent",
      { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 },
      session,
    );
    await waitFor(
      () => evaluate('location.pathname === "/catalogue"'),
      "Keyboard navigation did not open catalogue",
    );
    results.push(
      "Mobile navigation opens and follows catalogue with keyboard Enter/Tab.",
    );
    assert(
      exceptions.length === 0,
      `Uncaught browser exceptions: ${exceptions.join("; ")}`,
    );
    console.log(
      JSON.stringify(
        {
          status: "passed",
          checks: results,
          screenshots: [
            "artifacts/home-desktop.png",
            "artifacts/home-mobile.png",
            "artifacts/home-hindi-390.png",
            "artifacts/home-hindi-1440.png",
            ...(withAuth
              ? [
                  "artifacts/teal-kurti-1440.png",
                  "artifacts/teal-kurti-390.png",
                ]
              : []),
          ],
          limits: withAuth
            ? "Authentication uses the real API/JWT and an isolated temporary MongoDB. ImageKit is mocked. No user Atlas records or external deployment are involved."
            : "No provider credentials, authenticated live flows or deployed-service checks. Backend-unavailable states are expected in this local browser smoke.",
        },
        null,
        2,
      ),
    );
  }
} finally {
  if (connection?.readyState === WebSocket.OPEN) {
    try {
      await send("Browser.close");
    } catch {
      /* close best effort */
    }
    connection.close();
  }
  browser?.kill();
  preview?.kill();
  if (authFixture) await authFixture.close();
  if (customizationFixture) await customizationFixture.close();
  for (const item of pending.values()) {
    clearTimeout(item.timeout);
    item.reject(new Error("Browser closed"));
  }
  await delay(300);
  // This exact OS-created temporary profile belongs to this process.
  const resolvedProfile = path.resolve(profile);
  if (
    path.dirname(resolvedProfile) !== path.resolve(os.tmpdir()) ||
    !path.basename(resolvedProfile).startsWith("khwab-browser-")
  )
    throw new Error("Unsafe temporary profile cleanup path");
  await rm(resolvedProfile, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  }).catch(() => {});
}
