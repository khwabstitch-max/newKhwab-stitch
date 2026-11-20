import { calculateEstimate, estimateInput } from "../server/src/pricing.js";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Actual Chrome renders of client/dist with a deterministic, read-only API.
// Public catalogue data is read only; no database writes, account login, uploads or live provider calls.
const root = fileURLToPath(new URL("../", import.meta.url));
const dist = path.join(root, "client", "dist");
const artifacts = path.join(root, "artifacts");
const chromePath = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const [designs, publicOptions] = await Promise.all(["designs?limit=50","options?limit=50"].map(async route => {const response=await fetch("http://127.0.0.1:5173/api/"+route);if(!response.ok)throw Error("Public snapshot unavailable");return (await response.json()).data;}));
const options=publicOptions.map(option=>({...option,active:true}));
const settings={serviceAreas:[{name:"Browser test zone",nameHi:"परीक्षण क्षेत्र",pinPrefixes:["110001"],enabled:true,inboundPaise:8000,outboundPaise:10000}]};
const report = {
  mode: "Actual Chrome production build, public catalogue snapshot, real pricing, isolated PIN rates",
  startedAt: new Date().toISOString(),
  status: "running",
  checks: [],
  pages: [],
  screenshots: [],
  exceptions: [],
  limits: "No real orders, account changes, courier bookings or provider calls. Business rates unchanged; test rates exist only in this browser fixture.",
};

function installProductionFixture(designs,options){
const original=window.fetch.bind(window),list=data=>({data,pagination:{page:1,pages:1,total:data.length}});
window.fetch=async(input,init={})=>{
const url=new URL(typeof input==="string"?input:input.url,location.href);
if(!url.pathname.startsWith("/api/"))return original(input,init);
const route=url.pathname.slice(4);let result,status=200;
if(route==="/pricing/estimate")return original("/__estimate",{method:"POST",headers:{"Content-Type":"application/json"},body:init.body});
if(!["GET","HEAD"].includes(init.method||"GET")){result={error:{message:"Read-only fixture"}};status=405;}
else if(route==="/designs")result=list(designs.filter(d=>!url.searchParams.get("garment")||url.searchParams.get("garment")===d.garment));
else if(route.startsWith("/designs/")){const key=route.split("/").at(-1);result={data:designs.find(d=>d._id===key||d.slug===key)};}
else if(route==="/options")result=list(options.filter(d=>(!url.searchParams.get("kind")||d.kind===url.searchParams.get("kind"))&&(!url.searchParams.get("garment")||d.garments.includes(url.searchParams.get("garment")))));
else if(route==="/settings")result={data:{businessName:"Khwab Stitch",policies:{},support:{},homepage:{},faqs:[],whatsapp:""}};
else if(route==="/services")result=list([{itemTypes:["kurti","suit","blouse","alteration"]}]);
else if(route.includes("/access"))result={data:{url:"/design-library/teal-kurti-board.png"}};
else if(route.startsWith("/auth/"))result={data:{google:{enabled:false},email:{enabled:false}}};
else result=list([]);
return new Response(JSON.stringify(result),{status,headers:{"Content-Type":"application/json"}});
};}
const fixtureSource=`(${installProductionFixture.toString()})(${JSON.stringify(designs)},${JSON.stringify(options)});`;
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

try {
  await stat(path.join(dist, "index.html"));
  await mkdir(artifacts, { recursive: true });
  const profile = await mkdtemp(path.join(artifacts, "atelier-chrome-profile-"));
  server = createServer(async (request, response) => {
    try {
      const requestPath = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
      if(requestPath==="/__estimate"){const chunks=[];for await(const chunk of request)chunks.push(chunk);try{const value=estimateInput.parse(JSON.parse(Buffer.concat(chunks).toString()));const result=calculateEstimate(value,{design:designs.find(d=>d._id===value.designId),options,settings});response.writeHead(200,{"Content-Type":"application/json"});response.end(JSON.stringify({data:result}));}catch(error){report.pricingErrors=[...(report.pricingErrors||[]),error.message];response.writeHead(400,{"Content-Type":"application/json"});response.end(JSON.stringify({error:{message:error.message}}));}return;}
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

const address={line1:"12 Browser test road",city:"Delhi",state:"Delhi",pin:"110001"};
const kurti=designs.find(d=>d.code==="K-0"),alteration=designs.find(d=>d.garment==="alteration"),selected=options.find(d=>d.kind==="sleeve"&&d.garments.includes("kurti"));
for(const lang of ["en","hi"])for(const width of [1440,390,320])for(const [kind,step] of [["custom","design"],["custom","measurements"],["custom","logistics"],["custom","review"],["reference","review"],["alteration","review"]]){
const customized=kind==="custom"||kind==="reference";
const draft={id:randomUUID(),submissionKey:randomUUID(),createdAt:Date.now(),localRevision:0,garment:kind==="alteration"?"alteration":"kurti",quantity:1,designId:kind==="reference"?"":kind==="alteration"?alteration._id:kurti._id,step,configuration:{source:kind==="reference"?"reference":"catalogue",mode:customized?"custom":"exact",changedParts:customized?["sleeve"]:[],components:customized?{sleeve:{source:"option",optionId:selected._id}}:{},addonIds:[],extraInitialized:true},measurements:{takenBy:"sample",method:"garment",unit:"in",values:{},reconfirmFields:[],sampleGarmentIncluded:true,notes:kind==="alteration"?"Shorten the hem.":""},customer:{name:"Browser test customer",phone:"9876543210"},referenceMediaIds:kind==="reference"?["000000000000000000000099"]:[],logistics:{inbound:{method:"business",address},outbound:{method:"business",address}},preferredDate:"2027-01-20",preferredDateReason:"Family celebration",fabricDetails:"Customer-provided cotton",notes:"Browser verification"};
const key="khwab:request:v2:"+draft.id,record={data:draft,revision:0,savedAt:Date.now(),expiresAt:Date.now()+86400000};
const ordinary={...record,data:{id:draft.id,submissionKey:draft.submissionKey,createdAt:draft.createdAt,garment:draft.garment,quantity:1,designId:draft.designId,configuration:draft.configuration,step}};
await evaluate(`(()=>{localStorage.setItem("khwab.language",${JSON.stringify(lang)});localStorage.setItem(${JSON.stringify(key)},${JSON.stringify(JSON.stringify(ordinary))});sessionStorage.setItem(${JSON.stringify(key)},${JSON.stringify(JSON.stringify(record))});})()`);
await viewport(width);await navigate("/request?draft="+draft.id+"&step="+step);
await waitFor(()=>evaluate('!!document.querySelector(".wizard-form") && !document.querySelector(".request-price [role=status]")'),"Request did not settle");
if(step==="review")await waitFor(()=>evaluate('!!document.querySelector(".request-price details")'),"Estimate did not settle");
await loadPageImages();
const state=await evaluate(`(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,price:document.querySelectorAll(".request-price").length,media:document.querySelectorAll(".request-reference-item").length,plans:document.querySelectorAll('input[name="measurement-plan"]').length,language:document.documentElement.lang,broken:[...document.images].filter(i=>i.getClientRects().length&&i.complete&&!i.naturalWidth).map(i=>i.src)}))()`);
assert(state.scroll<=state.width+1,"Overflow "+kind+" "+step+" "+lang+" "+width);
assert(state.price===(step==="review"?1:0),"Price must appear once only at final review");
assert(state.broken.length===0,"Broken images: "+state.broken.join(","));
assert(state.language===lang,"Language did not persist");
if(step==="measurements")assert(state.plans===3,"Measurement plans missing");
if(step==="review")assert(state.media>0,"Review reference images missing");
report.pages.push({kind,step,lang,...state});
if((width===1440&&lang==="en")||(width===390&&lang==="hi")){
let shot=await send("Page.captureScreenshot",{format:"png",captureBeyondViewport:false}),file="production-request-"+kind+"-"+step+"-"+lang+"-"+width+".png";
await writeFile(path.join(artifacts,file),Buffer.from(shot.data,"base64"));report.screenshots.push("artifacts/"+file);
if(step==="review"){await evaluate('document.querySelector(".request-price").scrollIntoView({block:"start"})');shot=await send("Page.captureScreenshot",{format:"png"});file="production-price-"+kind+"-"+lang+"-"+width+".png";await writeFile(path.join(artifacts,file),Buffer.from(shot.data,"base64"));report.screenshots.push("artifacts/"+file);}
}
}
assert(report.exceptions.length===0,"Browser errors: "+report.exceptions.join("; "));
report.checks.push("36 English/Hindi renders at 1440/390/320px without overflow or broken visible images.","One final-review estimate, no earlier price panel.","Measurement plans and design/component/reference images render.");
report.status="passed";
} catch (error) {
  report.status = "failed";
  report.error = error.stack || error.message;
  if (connection?.readyState === WebSocket.OPEN && session) {
    try {
      report.failureContext = await evaluate(`({ route: location.href, text: document.querySelector("main")?.textContent.slice(-14000), fonts: document.fonts.status,
        images: Array.from(document.images).map(image => ({ src: image.currentSrc || image.src, complete: image.complete,
          loading: image.loading, width: image.naturalWidth, rect: image.getBoundingClientRect().toJSON(),
          collapsedDetails: !!image.closest('details:not([open])') })) })`);
      const image = await send("Page.captureScreenshot", { format: "png" });
      await writeFile(path.join(artifacts, "production-request-failure.png"), Buffer.from(image.data, "base64"));
      report.screenshots.push("artifacts/production-request-failure.png");
    } catch { /* Preserve the original failure if the target is already gone. */ }
  }
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  await mkdir(artifacts, { recursive: true });
  await writeFile(path.join(artifacts, "production-request-browser-report.json"), JSON.stringify(report, null, 2) + "\n");
  if (connection?.readyState === WebSocket.OPEN) {
    try { await send("Browser.close", {}, null); } catch { /* owned browser cleanup */ }
    connection.close();
  }
  for (const task of pending.values()) { clearTimeout(task.timer); task.reject(new Error("Browser closed")); }
  pending.clear();
  browser?.kill();
  if (server) await new Promise(resolve => server.close(resolve));
  console.log(JSON.stringify({ status: report.status, pages: report.pages.length, checks: report.checks,
    screenshots: report.screenshots, error: report.error, report: "artifacts/production-request-browser-report.json" }, null, 2));
}
