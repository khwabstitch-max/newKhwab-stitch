
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { withAdminBrowser } from "./admin-owner-browser.mjs";
const root=fileURLToPath(new URL("../",import.meta.url)),require=createRequire(new URL("../server/package.json",import.meta.url));
const {PDFDocument}=require("pdf-lib");
const assets=path.join(root,"artifacts/reference-upload-test");
const report={mode:"Production client, actual Express and disposable MongoDB, isolated signed media provider",checks:[],screenshots:[],status:"running",limits:"No configured database, live provider or real customer order. Fixture-only account and files."};
await fs.mkdir(assets,{recursive:true});
const board=await fs.readFile(path.join(root,"client/public/design-library/teal-kurti-board.png"));
await fs.writeFile(path.join(assets,"front.png"),board);
await fs.copyFile(path.join(root,"client/public/crops/length/sleeveless.jpg"),path.join(assets,"side.jpg"));
const pdf=await PDFDocument.create(),image=await pdf.embedPng(board),page=pdf.addPage([840,620]);
page.drawImage(image,{x:20,y:20,width:800,height:533});
await fs.writeFile(path.join(assets,"front-side-back.pdf"),await pdf.save());
const browserApi=async(path,method="GET",body)=>{
 const session=JSON.parse(sessionStorage.getItem("khwab.session.v1")||"null");
 const response=await fetch("/api"+path,{method,headers:{Authorization:"Bearer "+session.token,...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const value=await response.json();if(!response.ok)throw Error(path+" HTTP "+response.status+" "+value.error?.message);return value;
};
try{
await withAdminBrowser(async({fixture,send,evaluate,navigate,waitFor,screenshot,fill,browserErrors})=>{
 try {
 const monitor="(()=>{window.__referenceErrors=[];addEventListener('error',event=>window.__referenceErrors.push(event.error?.stack||event.message));const old=console.error;console.error=(...args)=>{window.__referenceErrors.push(args.map(arg=>arg?.stack||String(arg)).join(' '));old.apply(console,args);};})()";
 await send("Page.addScriptToEvaluateOnNewDocument",{source:monitor});await evaluate(monitor);
 const api=(p,m,b)=>evaluate("("+browserApi.toString()+")("+JSON.stringify(p)+","+JSON.stringify(m||"GET")+","+JSON.stringify(b)+")");
 const click=selector=>evaluate("(()=>{const n=document.querySelector("+JSON.stringify(selector)+");if(!n||n.disabled)throw Error('Unavailable control');n.click();})()");
 const next=()=>click(".wizard-form .request-actions button:not([type=button])");
 const step=s=>waitFor(()=>evaluate("new URLSearchParams(location.search).get('step')==="+JSON.stringify(s)+"&&!!document.querySelector('.wizard-form')"),"Step not reached: "+s);
 const upload=async names=>{
  const doc=await send("DOM.getDocument"),{nodeId}=await send("DOM.querySelector",{nodeId:doc.root.nodeId,selector:'.wizard-form input[type="file"]'});
  assert.ok(nodeId,"Upload input exists");
  await send("DOM.setFileInputFiles",{nodeId,files:names.map(n=>path.join(assets,n))});
  await waitFor(()=>evaluate("!!document.querySelector('.reference-file-preview a[href]')&&!document.querySelector('.request-upload-status')"),"Uploads did not settle",30000);
 };
 const check=(condition,text)=>{assert.ok(condition,text);report.checks.push(text);};
 const go=async url=>{await navigate(url);await waitFor(()=>evaluate("!!document.querySelector('main h1')"),"Page did not load");};
 const language=async lang=>{
  await evaluate("(()=>{const n=document.querySelector('.language-picker select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(n,"+JSON.stringify(lang)+");n.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await waitFor(()=>evaluate("document.documentElement.lang==="+JSON.stringify(lang)),"Language did not settle");
 };
 const capture=async(name,selector)=>{
  if(process.argv.includes("--diagnose"))return;
  if(selector)await evaluate("document.querySelector("+JSON.stringify(selector)+")?.scrollIntoView({block:'center'})");
  for(const lang of ["en","hi"]){
   await language(lang);
   for(const width of [1440,390,320]){
    const target=await screenshot("reference-"+name+"-"+lang+"-"+width,width,width<600?844:1000);
    report.screenshots.push(path.relative(root,target));
    const size=await evaluate("({width:innerWidth,scroll:document.documentElement.scrollWidth})");
    check(size.scroll<=size.width+1,name+" "+lang+" "+width+"px fits viewport");
   }
  }
  await language("en");
 };
 await go("/request?source=reference");await step("design");
 await waitFor(()=>evaluate("!!document.querySelector('input[type=file]')"),"Signed-in uploader missing");
 check(await evaluate("document.querySelector('input[type=file]').multiple&&document.querySelector('input[type=file]').accept.includes('application/pdf')"),"Reference picker accepts multiple PDF/JPEG/PNG files");
 await upload(["front-side-back.pdf"]);
 check(await evaluate("document.querySelectorAll('.reference-file-preview').length===1&&!!document.querySelector('.reference-file-document')"),"A single combined PDF is accepted");
 await next();await step("measurements");check(true,"A combined PDF continues without requiring three separate files");

 await go("/request?source=reference");await step("design");await upload(["front.png","side.jpg","front-side-back.pdf"]);
 await waitFor(()=>evaluate("document.querySelectorAll('.reference-file-preview a[href]').length===3"),"All three references not visible");
 check(await evaluate("document.querySelectorAll('.reference-file-document').length===1&&document.querySelectorAll('.reference-file-preview img').length===2"),"JPEG, PNG and PDF batch displays two images and one document");
 await capture("upload",".reference-previews");
 await next();await step("measurements");await next();await step("logistics");
 await fill("customerName","Disposable browser customer");await fill("phone","9876543210");await fill("request-notes","Browser-only reference verification");
 await next();await step("review");
 await waitFor(()=>evaluate("!!document.querySelector('.request-price details')&&!document.querySelector('.request-price [role=status]')"),"Estimate did not settle");
 check(await evaluate("document.querySelector('.request-review-references').querySelectorAll('.reference-file-preview').length===3"),"Final review retains all uploaded reference files");
 check(await evaluate("!/₹/.test(document.querySelector('.request-price h2').textContent)"),"Uploaded design has pending stitching price");
 await capture("review",".request-review-references");
 await click('input[type="checkbox"][required]');
 await waitFor(()=>evaluate("!document.querySelector('.request-actions button:not([type=button])').disabled"),"Submit not enabled");
 await next();
 await waitFor(()=>evaluate("location.pathname.startsWith('/orders/')&&!!document.querySelector('#order-design-references')"),"Request was not submitted",30000);
 const orderId=await evaluate("location.pathname.split('/').at(-1)");
 let order=(await api("/orders/"+orderId)).data;
 check(order.referenceSnapshots.length===3&&order.referenceSnapshots.some(f=>f.mimeType==="application/pdf"&&f.pageCount===1),"Submitted order persists filename, MIME and PDF page metadata");
 const pdfUrl=await evaluate("[...document.querySelectorAll('#order-design-references .reference-file-open')].find(a=>a.querySelector('.reference-file-document'))?.href");
 const signed=await fetch(pdfUrl),bytes=Buffer.from(await signed.arrayBuffer());
 check(signed.ok&&signed.headers.get("content-type").includes("application/pdf")&&bytes.subarray(0,5).toString()==="%PDF-","Signed document URL serves a real PDF with correct content type");
 order=(await api("/admin/orders/"+orderId+"/status","PATCH",{revision:order.revision,status:"under_review",note:"Disposable browser review"})).data;
 order=(await api("/admin/orders/"+orderId+"/quotes","POST",{revision:order.revision,amountPaise:95000,deliveryDate:"2027-02-20",notes:"Disposable browser quote"})).data;
 await go("/orders/"+orderId);
 await waitFor(()=>evaluate("!!document.querySelector('.order-quote-reference-link')&&document.querySelectorAll('#order-design-references .reference-file-preview a[href]').length===3"),"Quote reference gallery missing");
 check(true,"Customer quote links to the submitted image/PDF references");
 await capture("quote","#order-design-references");
 await go("/admin/orders/"+orderId);
 await waitFor(()=>evaluate("document.querySelectorAll('#order-design-references .reference-file-preview a[href]').length===3"),"Admin reference gallery missing");
 check(true,"Admin quote review opens the same submitted references");

 await api("/admin/options","POST",{kind:"sleeveLength",name:"Full length",nameHi:"पूरी लंबाई",garments:["kurti"],active:true,status:"published",lengthStyle:"full",priceMode:"included",amountPaise:0});
 await go("/request?design="+fixture.designId);await step("design");
 await evaluate("[...document.querySelectorAll('input[name=design-mode]')].at(-1).click()");
 await evaluate("[...document.querySelectorAll('.request-part-choices input')].filter(n=>['Sleeve length','Sleeve design','Front neck design','Back neck design'].includes(n.getAttribute('aria-label'))).forEach(n=>n.click())");
 await next();
 for(const name of ["sleeveLength","sleeve","neck","back"]){
  await step("component-"+name);
  await waitFor(()=>evaluate("!!document.querySelector('.visual-options input[type=radio],.sleeve-length-options input[type=radio]')"),"Individual selector did not load");
  check(await evaluate("!document.querySelector('main').textContent.includes('Official Style Guide')&&!document.querySelector('main').textContent.includes('Explore neck and sleeve design references')"),name+" has no duplicate full-guide banner");
  await evaluate("(()=>{const n=[...document.querySelectorAll('button')].find(n=>n.textContent.trim()==='View larger & details');if(!n)throw Error('Preview missing');n.click()})()");
  await waitFor(()=>evaluate("!!document.querySelector('dialog[open]')"),"Individual preview did not open");
  await send("Input.dispatchKeyEvent",{type:"keyDown",key:"Escape",code:"Escape",windowsVirtualKeyCode:27});
  await waitFor(()=>evaluate("!document.querySelector('dialog[open]')"),"Individual preview did not close");
  check(true,name+" individual preview opens and closes");
  await click(".visual-options input[type=radio],.sleeve-length-options input[type=radio]");await next();
 }
 check(browserErrors.length===0,"No uncaught browser errors");
 report.status="passed";
 } catch(error) { report.failureContext=await evaluate("({route:location.pathname+location.search,text:document.querySelector('main')?.textContent.slice(-16000),errors:window.__referenceErrors})");report.screenshots.push(path.relative(root,await screenshot("reference-failure",390,844)));throw error; }
});
}catch(error){report.status="failed";report.error=error.stack||error.message;process.exitCode=1;}
await fs.writeFile(path.join(root,"artifacts/reference-upload-browser-report.json"),JSON.stringify(report,null,2));
console.log(JSON.stringify({status:report.status,checks:report.checks,screenshots:report.screenshots,error:report.error}));
