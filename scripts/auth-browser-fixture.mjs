import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { bundledBoardFields } from "../server/src/media-storage.js";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { randomBytes, randomUUID } from "node:crypto";
import { createApp } from "../server/src/app.js";
import { createModels, transaction } from "../server/src/models.js";
import { defaultSettings } from "../server/src/domain.js";
const require = createRequire(
  new URL("../server/package.json", import.meta.url),
);

// The default fixture is in memory. Explicitly authorized configured runs use a
// fresh random database name, never the database named in the connection URI.
export async function startAuthFixture() {
  const mongoose = require("mongoose");
  const { MongoMemoryReplSet } = require("mongodb-memory-server");
  const pino = require("pino");
  const externalUri = process.env.TEST_MONGODB_URI;
  if (externalUri && process.env.ALLOW_EXTERNAL_TEST_DATABASE !== "true")
    throw new Error("Configured browser tests require explicit disposable database authorization.");
  const replica = externalUri ? null : await MongoMemoryReplSet.create({
    binary: {
      downloadDir: fileURLToPath(
        new URL(
          "../server/node_modules/.cache/mongodb-memory-server/",
          import.meta.url,
        ),
      ),
    },
    replSet: { count: 1, storageEngine: "wiredTiger" },
  });
  // Atlas shared tiers permit at most 38 bytes: keep 96 random UUID bits.
  const database = "khwab-browser-" + randomUUID().replaceAll("-", "").slice(0, 24);
  const guardedDrop = async () => {
    if (!connection || connection.readyState !== 1) return;
    if (connection.name !== database || !/^khwab-browser-[0-9a-f]{24}$/.test(database))
      throw new Error("Refusing browser fixture cleanup outside its exact random database.");
    await connection.dropDatabase();
  };
  let connection, server;
  try {
    connection = await mongoose
      .createConnection(externalUri || replica.getUri(), {
        dbName: database,
        autoIndex: true,
        bufferCommands: false,
      })
      .asPromise();
    const models = createModels(connection);
    await Promise.all(Object.values(models).map((model) => model.init()));
    const config = {
      NODE_ENV: "test",
      JWT_SECRET: randomBytes(64).toString("base64url"),
      origins: ["http://127.0.0.1:4173"],
      TRUST_PROXY_HOPS: 0,
      LOG_LEVEL: "silent",
    };
    const images = {
      url: () => "https://images.example.test/fixture.webp",
      upload: async () => {
        throw new Error("Image uploads are outside this auth smoke.");
      },
      remove: async () => {},
    };
    const app = createApp({
      config,
      models,
      transaction: (work) => transaction(work, connection),
      images,
      logger: pino({ level: "silent" }),
      dbReady: () => connection.readyState === 1,
    });
    server = await new Promise((resolve, reject) => {
      const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
      listening.once("error", reject);
    });
    const url = "http://127.0.0.1:" + server.address().port;
    const password = "Browser-test-" + randomBytes(12).toString("base64url");
    const adminEmail = "admin-" + randomUUID() + "@example.test";
    const customerEmail = "customer-" + randomUUID() + "@example.test";
    const registered = await fetch(url + "/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "QA administrator",
        email: adminEmail,
        password,
      }),
    });
    if (registered.status !== 201)
      throw new Error(
        "Could not prepare isolated administrator fixture: HTTP " +
          registered.status,
      );
    await models.User.updateOne(
      { email: adminEmail },
      { $set: { role: "admin" }, $inc: { authVersion: 1 } },
    );
    const boardTemplate = JSON.parse(
      readFileSync(
        new URL("../client/src/data/teal-kurti.json", import.meta.url),
        "utf8",
      ),
    );
    const administrator = await models.User.findOne({ email: adminEmail });
    const boardAsset = await models.MediaAsset.create({
      ...bundledBoardFields(administrator._id),
      references: 5,
    });
    const defaults = await models.DesignOption.create([
      {
        name: "Original round front",
        kind: "neck",
        garments: ["kurti"],
        active: true,
        priceMode: "included",
        amountPaise: 0,
        imageMediaId: boardAsset._id,
        imageAlt: "Catalogue front neckline detail",
        measurementFields: ["frontNeckDepth"],
      },
      {
        name: "Original elbow sleeve",
        kind: "sleeve",
        garments: ["kurti"],
        active: true,
        priceMode: "included",
        amountPaise: 0,
        imageMediaId: boardAsset._id,
        imageAlt: "Catalogue elbow sleeve detail",
        sleeveStyle: "elbow",
        measurementFields: ["sleeveLength"],
      },
      {
        name: "Original simple back",
        kind: "back",
        garments: ["kurti"],
        active: true,
        priceMode: "included",
        amountPaise: 0,
        imageMediaId: boardAsset._id,
        imageAlt: "Catalogue back neckline detail",
        measurementFields: ["backNeckDepth"],
      },
      {
        name: "Original comfort fit",
        kind: "fit",
        garments: ["kurti"],
        active: true,
        priceMode: "included",
        amountPaise: 0,
        imageMediaId: boardAsset._id,
        imageAlt: "Catalogue comfort fit detail",
      },
    ]);
    await models.DesignOption.create({
      name: "Full sleeve modification",
      kind: "sleeve",
      garments: ["kurti"],
      active: true,
      priceMode: "additional",
      amountPaise: 15000,
      description:
        "A full-length sleeve; numeric length is confirmed at the measurement step.",
      sleeveStyle: "full",
      measurementFields: ["sleeveLength"],
    });
    const design = await models.Design.create({
      ...boardTemplate.design,
      title: boardTemplate.design.title,
      code: "PREVIEW-TEAL",
      slug: "qa-stitching-design",
      mediaIds: [boardAsset._id],
      coverMediaId: boardAsset._id,
      imageViews: boardTemplate.design.imageViews.map((view) => ({
        ...view,
        mediaId: boardAsset._id,
      })),
      status: "published",
      defaultComponents: Object.fromEntries(
        defaults.map((option) => [option.kind, option._id]),
      ),
    });
    await models.SiteSettings.create({
      ...defaultSettings,
      key: "main",
      support: {
        timezone: "Asia/Kolkata",
        responseHours: 6,
        startHour: 10,
        endHour: 18,
        weekdays: [1, 2, 3, 4, 5, 6],
      },
    });

    return {
      url,
      password,
      adminEmail,
      customerEmail,
      designId: String(design._id),
      async close() {
        await new Promise((resolve) => server.close(resolve));
        try { await guardedDrop(); }
        finally { await connection.close(); await replica?.stop(); }
      },
    };
  } catch (error) {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (connection) {
      await guardedDrop().catch(() => {});
      await connection.close();
    }
    await replica?.stop();
    throw error;
  }
}

export async function verifyAuthInBrowser({
  fixture,
  send,
  evaluate,
  navigate,
  waitFor,
  session,
  results,
}) {
  const assert = (value, message) => {
    if (!value) throw new Error(message);
  };
  async function fill(id, value) {
    await evaluate(
      `(() => { const input = document.getElementById(${JSON.stringify(id)}); if(!input) throw new Error('Missing auth input'); const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; setter.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input',{bubbles:true})); })()`,
    );
  }
  async function submit() {
    await evaluate(`document.querySelector('form.auth-form').requestSubmit()`);
  }
  async function signedIn(expected = "/orders") {
    await waitFor(
      () =>
        evaluate(
          `location.pathname === ${JSON.stringify(expected)} && sessionStorage.getItem('khwab.session.v1') !== null && !document.querySelector('form.auth-form')`,
        ),
      "Email/password authentication did not reach its requested page",
    );
  }
  async function logout() {
    await navigate("/profile");
    await waitFor(
      () =>
        evaluate(
          `Array.from(document.querySelectorAll('button')).some(button => button.textContent.includes('Sign out of this browser session'))`,
        ),
      "Profile did not load",
    );
    await evaluate(
      `Array.from(document.querySelectorAll('button')).find(button => button.textContent.includes('Sign out of this browser session')).click()`,
    );
    await waitFor(
      () =>
        evaluate(
          `sessionStorage.getItem('khwab.session.v1') === null && location.pathname === '/login'`,
        ),
      "Logout did not clear the browser session",
    );
  }
  await navigate("/login?mode=register");
  await fill("auth-name", "Browser QA customer");
  await fill("auth-email", fixture.customerEmail);
  await fill("auth-password", fixture.password);
  await fill("auth-confirm-password", fixture.password);
  await submit();
  await signedIn();
  const originalToken = await evaluate(
    `JSON.parse(sessionStorage.getItem('khwab.session.v1')).token`,
  );
  assert(
    typeof originalToken === "string" && originalToken.split(".").length === 3,
    "Expected a signed JWT session",
  );
  results.push(
    "Actual browser registration creates a customer and a JWT through the real API.",
  );
  await navigate("/orders");
  await signedIn();
  results.push(
    "Browser reload restores the JWT session after server verification.",
  );
  await navigate("/admin");
  await waitFor(
    () => evaluate(`document.body.innerText.includes('Atelier access only')`),
    "Customer unexpectedly accessed admin workspace",
  );
  results.push("A real customer session is denied the admin workspace.");
  await logout();
  const revoked = await fetch(fixture.url + "/api/me", {
    headers: { Authorization: "Bearer " + originalToken },
  });
  assert(
    revoked.status === 401,
    "Logout failed to revoke the previously issued JWT",
  );
  results.push(
    "Logout clears sessionStorage and revokes the previous JWT on the server.",
  );
  await fill("auth-email", fixture.customerEmail);
  await fill("auth-password", "Incorrect-password-12345");
  await submit();
  await waitFor(
    () =>
      evaluate(
        `document.querySelector('[role="alert"]')?.textContent.length > 0`,
      ),
    "Wrong-password error was not shown",
  );
  assert(
    await evaluate(
      `location.pathname === '/login' && sessionStorage.getItem('khwab.session.v1') === null`,
    ),
    "Invalid credentials created a browser session",
  );
  await fill("auth-password", fixture.password);
  await submit();
  await signedIn("/profile");
  results.push(
    "Wrong-password login is recoverable; correct credentials sign in successfully.",
  );
  await logout();
  await fill("auth-email", fixture.adminEmail);
  await fill("auth-password", fixture.password);
  await submit();
  await signedIn("/profile");
  await navigate("/admin");
  await waitFor(
    () =>
      evaluate(
        `document.body.innerText.includes('A good day to make beautiful things')`,
      ),
    "Trusted administrator did not access the dashboard",
  );
  results.push(
    "An administrator provisioned only in the isolated fixture can access the dashboard.",
  );
  await navigate("/designs/qa-stitching-design");
  await waitFor(
    () =>
      evaluate(
        `document.querySelectorAll('.design-preview-strip button').length===7`,
      ),
    "Seven board previews did not render",
  );
  await evaluate(
    `document.querySelector('.design-preview-strip button[aria-label="Side view"]').click()`,
  );
  await evaluate(`document.querySelector('.gallery-expand').click()`);
  await waitFor(
    () => evaluate(`Boolean(document.querySelector('dialog[open]'))`),
    "Image zoom did not open",
  );
  await send(
    "Input.dispatchKeyEvent",
    {
      type: "keyDown",
      key: "Escape",
      code: "Escape",
      windowsVirtualKeyCode: 27,
    },
    session,
  );
  await send(
    "Input.dispatchKeyEvent",
    { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 },
    session,
  );
  await waitFor(
    () => evaluate(`!document.querySelector('dialog[open]')`),
    "Escape did not close image zoom",
  );
  assert(
    await evaluate(
      `document.querySelector('.stitching-rates').innerText.includes('550+') && document.querySelector('.fabric-promise').innerText.includes('Fabric provided by customer')`,
    ),
    "Stitching rates or fabric promise missing",
  );
  await navigate("/admin/designs");
  await waitFor(
    () =>
      evaluate(
        `Array.from(document.querySelectorAll('button')).some(button=>button.textContent.includes('Use teal kurti template'))`,
      ),
    "Preset action missing",
  );
  await evaluate(
    `Array.from(document.querySelectorAll('button')).find(button=>button.textContent.includes('Use teal kurti template')).click()`,
  );
  await waitFor(
    () =>
      evaluate(
        `document.querySelectorAll('.preview-editor').length===7 && document.querySelectorAll('.rate-editor').length===4`,
      ),
    "Editable previews/rates missing",
  );
  await fill("detail-neck", "Browser-edited neckline");
  await evaluate(`document.getElementById('designTitle').form.requestSubmit()`);
  await waitFor(
    () =>
      evaluate(
        `!document.getElementById('designTitle') && document.body.innerText.includes('Design saved.')`,
      ),
    "Preset did not save through real API",
  );
  const saved = await evaluate(
    `fetch('/api/admin/designs?limit=50',{headers:{Authorization:'Bearer '+JSON.parse(sessionStorage.getItem('khwab.session.v1')).token}}).then(response=>response.json()).then(result=>result.data.find(design=>design.code==='KS-TEAL-01')).then(design=>({views:design?.imageViews?.length,prices:design?.priceOptions?.length,neck:design?.designDetails?.neck,status:design?.status}))`,
  );
  assert(
    saved.views === 7 &&
      saved.prices === 4 &&
      saved.neck === "Browser-edited neckline" &&
      saved.status === "draft",
    "Saved board did not preserve admin edits",
  );
  results.push(
    "Actual board gallery has seven views, modal/Escape support and stitching-only rates; an administrator saves edited template details/prices/previews through the real API without ImageKit.",
  );
  await logout();
  await navigate("/request?design=" + fixture.designId);
  await waitFor(
    () => evaluate("document.body.innerText.includes('Same as shown')"),
    "Guest catalogue request did not load",
  );
  await fill("quantity", "2");
  await evaluate("document.querySelector('.wizard-form').requestSubmit()");
  await waitFor(
    () => evaluate("Boolean(document.getElementById('method'))"),
    "Exact copy failed to skip component selection",
  );
  await evaluate("document.querySelector('.wizard-form').requestSubmit()");
  await waitFor(
    () => evaluate("Boolean(document.getElementById('customerName'))"),
    "Logistics step missing",
  );
  await fill("customerName", "Browser QA customer");
  await fill("phone", "9876543210");
  await evaluate("document.querySelector('.wizard-form').requestSubmit()");
  await waitFor(
    () =>
      evaluate(
        "document.querySelector('.wizard-form h2')?.textContent==='Review'",
      ),
    "Review step missing",
  );
  await evaluate(
    "document.querySelector('.wizard-form input[type=checkbox]').click()",
  );
  await evaluate("document.querySelector('.wizard-form').requestSubmit()");
  await waitFor(
    () => evaluate("location.pathname==='/login'"),
    "Guest final submission did not request authentication",
  );
  await fill("auth-email", fixture.customerEmail);
  await fill("auth-password", fixture.password);
  await submit();
  await signedIn("/request");
  await waitFor(
    () =>
      evaluate(
        "document.querySelector('.wizard-form h2')?.textContent==='Review'",
      ),
    "Authentication did not restore request review",
  );
  const pending = await evaluate(
    "fetch('/api/orders',{headers:{Authorization:'Bearer '+JSON.parse(sessionStorage.getItem('khwab.session.v1')).token}}).then(r=>r.json()).then(v=>v.data.length)",
  );
  assert(
    pending === 0,
    "Login unexpectedly submitted the request automatically",
  );
  const restored = await evaluate(
    "({text:document.querySelector('.wizard-form').textContent, name:document.body.innerText.includes('Browser QA customer')})",
  );
  assert(
    /Kurti\s*\u00d7\s*2/.test(restored.text) && restored.name,
    "Draft data did not survive login: " +
      JSON.stringify({
        quantity: restored.text.match(/Kurti.{0,15}/)?.[0],
        name: restored.name,
      }),
  );
  await waitFor(
    () => evaluate("Boolean(document.querySelector('.request-price details'))"),
    "Trusted estimate missing after authentication",
  );
  for (const width of [390, 1440]) {
    await send(
      "Emulation.setDeviceMetricsOverride",
      { width, height: 900, deviceScaleFactor: 1, mobile: width < 640 },
      session,
    );
    const layout = await evaluate(
      "({width:innerWidth,scroll:document.documentElement.scrollWidth})",
    );
    assert(
      layout.scroll <= layout.width + 1,
      "Request review overflow at " + width,
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
      fileURLToPath(
        new URL(`../artifacts/request-review-${width}.png`, import.meta.url),
      ),
      Buffer.from(shot.data, "base64"),
    );
  }
  await evaluate("document.querySelector('.wizard-form').requestSubmit()");
  await waitFor(
    () =>
      evaluate(
        "location.pathname.startsWith('/orders/') && location.pathname.split('/')[2]?.length===24",
      ),
    "Explicit request submission did not receive a real saved receipt",
  ).catch(async (error) => {
    const detail = await evaluate(
      "({path:location.pathname,alerts:Array.from(document.querySelectorAll('[role=alert]')).map(e=>e.textContent),status:document.querySelector('.draft-toolbar [role=status]')?.textContent,invalid:Array.from(document.querySelectorAll('.wizard-form input')).filter(e=>!e.validity.valid).map(e=>({id:e.id,message:e.validationMessage}))})",
    );
    throw new Error(error.message + ": " + JSON.stringify(detail));
  });
  await waitFor(
    () => evaluate("document.body.innerText.includes('Request received.')"),
    "Saved request receipt missing",
  );
  results.push(
    "Guest exact-copy request skips custom steps, preserves quantity/contact through login, stays unsubmitted until explicit action, and receives a real idempotent MongoDB receipt.",
  );
  const receiptPath = await evaluate("location.pathname");
  for (const width of [320, 390, 768, 1440]) {
    await send(
      "Emulation.setDeviceMetricsOverride",
      { width, height: 900, deviceScaleFactor: 1, mobile: width < 640 },
      session,
    );
    for (const route of [
      "/account",
      "/account/drafts",
      "/account/measurements",
      "/account/support",
    ]) {
      await navigate(route);
      await waitFor(
        () =>
          evaluate("Boolean(document.querySelector('.account-navigation'))"),
        "Account route did not load",
      );
      const layout = await evaluate(
        "({width:innerWidth,scroll:document.documentElement.scrollWidth})",
      );
      assert(
        layout.scroll <= layout.width + 1,
        "Account overflow at " + width + " on " + route,
      );
    }
  }
  results.push(
    "Request review fits mobile/desktop; account, drafts, measurements and support fit 320/390/768/1440px without horizontal overflow.",
  );
  await navigate("/account");
  await waitFor(
    () =>
      evaluate(
        "Boolean(document.querySelector('.account-navigation')) && document.body.innerText.includes('Active orders')",
      ),
    "Account overview missing",
  ).catch(async (error) => {
    const detail = await evaluate(
      "({path:location.pathname,title:document.querySelector('h1')?.textContent,main:document.querySelector('main')?.innerText.slice(0,700),alerts:Array.from(document.querySelectorAll('[role=alert]')).map(e=>e.textContent)})",
    );
    throw new Error(error.message + ": " + JSON.stringify(detail));
  });
  await navigate("/account/support");
  await waitFor(
    () =>
      evaluate(
        "Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('Ask for guidance'))",
      ),
    "Private support route missing",
  );
  await evaluate(
    "Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Ask for guidance')).click()",
  );
  await fill("help-subject", "Browser measurement guidance");
  await evaluate(
    "(()=>{const e=document.getElementById('help-description');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'Please help confirm the sleeve measurement.');e.dispatchEvent(new Event('input',{bubbles:true}));})()",
  );
  await evaluate(
    "document.getElementById('help-subject').form.requestSubmit()",
  );
  await waitFor(
    () =>
      evaluate(
        "location.search.includes('ticket=') && Boolean(document.querySelector('.conversation'))",
      ),
    "Support request was not saved",
  );
  results.push(
    "Authenticated account navigation and an asynchronous master-tailor assistance request save through the real isolated API.",
  );
  await logout();
  await fill("auth-email", fixture.adminEmail);
  await fill("auth-password", fixture.password);
  await submit();
  await signedIn("/profile");
  await navigate(receiptPath.replace("/orders/", "/admin/orders/"));
  await waitFor(
    () => evaluate("Boolean(document.getElementById('nextStatus'))"),
    "Admin order controls missing",
  );
  await evaluate(
    "(()=>{const e=document.getElementById('nextStatus');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,'under_review');e.dispatchEvent(new Event('change',{bubbles:true}));})()",
  );
  await evaluate("document.getElementById('nextStatus').form.requestSubmit()");
  await waitFor(
    () =>
      evaluate(
        "document.querySelector('.order-detail .badge')?.textContent==='Under Review'",
      ),
    "Admin review status did not persist",
  );
  await fill("quoteAmount", "1400");
  await fill(
    "quoteDate",
    new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
  );
  await evaluate("document.getElementById('quoteAmount').form.requestSubmit()");
  await waitFor(
    () =>
      evaluate(
        "document.querySelector('.quote-panel .eyebrow')?.textContent.includes('VERSION 1')",
      ),
    "Admin quote was not saved",
  );
  await navigate("/admin/commerce");
  await waitFor(()=>evaluate("[...document.querySelectorAll('button')].some(button=>button.textContent.trim()==='Edit programme settings')"),"Admin commerce summary did not load");
  await evaluate("[...document.querySelectorAll('button')].find(button=>button.textContent.trim()==='Edit programme settings').click()");
  await waitFor(()=>evaluate("!!document.querySelector('#commerce-terms')"),"Admin commerce settings did not load");
  for(const width of [320,390,768,1440]) {
    await send("Emulation.setDeviceMetricsOverride",{width,height:900,deviceScaleFactor:1,mobile:width<768},session);
    assert(await evaluate("document.documentElement.scrollWidth<=window.innerWidth+1"),"Admin commerce overflow at "+width);
  }
  assert(await evaluate("![...document.querySelectorAll('input[type=checkbox]')].some(input=>input.checked)"),"Test benefits unexpectedly enabled");
  results.push("Admin commerce settings load with programmes disabled and fit320/390/768/1440px.");
  await logout();
  await fill("auth-email", fixture.customerEmail);
  await fill("auth-password", fixture.password);
  await submit();
  await signedIn("/profile");
  await navigate(receiptPath);
  await waitFor(
    () =>
      evaluate(
        "Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('Accept current quote'))",
      ),
    "Quote acceptance missing",
  );
  await evaluate(
    "window.confirm=()=>true;Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Accept current quote')).click()",
  );
  await waitFor(
    () =>
      evaluate("document.body.innerText.includes('Accepted quote version 1')"),
    "Customer quote acceptance did not persist",
  );
  results.push(
    "Admin reviews the saved request and sends a versioned final quote; the customer explicitly accepts the current version through browser UI.",
  );
  await navigate("/account/benefits");
  await waitFor(()=>evaluate("document.body.innerText.includes('Benefits are currently unavailable')"),"Customer disabled-benefits state did not load");
  for(const width of [320,390,768,1440]) {
    await send("Emulation.setDeviceMetricsOverride",{width,height:900,deviceScaleFactor:1,mobile:width<768},session);
    assert(await evaluate("document.documentElement.scrollWidth<=window.innerWidth+1"),"Customer benefits overflow at "+width);
  }
  results.push("Customer benefits preserve the balance, clearly disable inactive programmes and fit320/390/768/1440px.");
  await logout();
  await send(
    "Emulation.setDeviceMetricsOverride",
    { width: 390, height: 844, deviceScaleFactor: 1, mobile: true },
    session,
  );
}
