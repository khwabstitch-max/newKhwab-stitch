
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import {fileURLToPath} from "node:url";
import {withAdminBrowser} from "./admin-owner-browser.mjs";
import {defaultSettings,settingsInput} from "../server/src/domain.js";
const settingsPayload=(record,deliveryPricing)=>{const values={...structuredClone(defaultSettings),...record,deliveryPricing};return {...Object.fromEntries(Object.keys(settingsInput.shape).filter(k=>values[k]!==undefined).map(k=>[k,values[k]])),revision:record.revision||0};};
const root=fileURLToPath(new URL("../",import.meta.url));
const report={status:"running",checks:[],screenshots:[],limits:"Actual Chrome/Express/disposable MongoDB; injected courier responses, no real courier account or configured database."};
const fakeQuote=async ({provider,originPin,destinationPin,parcel,direction})=>({available:true,provider,originPin,destinationPin,parcel,currency:"INR",totalPaise:direction==="inbound"?7000:9000,courierId:"fixture-surface",courierName:"Delhivery",service:"Surface",chargeableWeightGrams:Math.max(parcel.weightGrams,Math.ceil(parcel.lengthCm*parcel.widthCm*parcel.heightCm/5000*1000)),quotedAt:new Date().toISOString(),validUntil:new Date(Date.now()+300000).toISOString()});
const browserApi=async(path,method="GET",body)=>{const session=JSON.parse(sessionStorage.getItem("khwab.session.v1")||"null");const response=await fetch("/api"+path,{method,headers:{Authorization:"Bearer "+session.token,...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});const result=await response.json();return {...result,_httpStatus:response.status};};
try{
await withAdminBrowser(async({fixture,send,evaluate,navigate,waitFor,screenshot,fill,browserErrors})=>{
try{
 const api=async(p,m,b)=>{const result=await evaluate("("+browserApi.toString()+")("+JSON.stringify(p)+","+JSON.stringify(m||"GET")+","+JSON.stringify(b)+")");if(result._httpStatus>=400)throw Error(p+" HTTP "+result._httpStatus+" "+JSON.stringify(result.error));return result;};
 const click=s=>evaluate("document.querySelector("+JSON.stringify(s)+").click()");
 const next=()=>click(".request-actions button:not([type=button])");
 const check=(value,text)=>{assert.ok(value,text);report.checks.push(text);};
 const step=s=>waitFor(()=>evaluate("new URLSearchParams(location.search).get('step')==="+JSON.stringify(s)+"&&!!document.querySelector('.wizard-form')"),"Request step missing: "+s);
 const setLanguage=async lang=>{await evaluate("(()=>{const n=document.querySelector('.language-picker select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(n,"+JSON.stringify(lang)+");n.dispatchEvent(new Event('change',{bubbles:true}));})()");await waitFor(()=>evaluate("document.documentElement.lang==="+JSON.stringify(lang)),"Language did not render");};
 const capture=async(name,selector)=>{for(const lang of["en","hi"]){await setLanguage(lang);for(const width of[1440,390,320]){await send("Emulation.setDeviceMetricsOverride",{width,height:width<600?844:1000,deviceScaleFactor:1,mobile:width<600});if(selector)await evaluate("(()=>{document.documentElement.style.scrollBehavior='auto';document.querySelector("+JSON.stringify(selector)+")?.scrollIntoView({block:'start',behavior:'instant'});window.scrollBy(0,-110);return new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));})()");const p=await screenshot("shipping-"+name+"-"+lang+"-"+width,width,width<600?844:1000);report.screenshots.push(path.relative(root,p));const box=await evaluate("({width:innerWidth,scroll:document.documentElement.scrollWidth})");check(box.scroll<=box.width+1,name+" "+lang+" "+width+"px has no overflow");}}await setLanguage("en");};
 const address=async direction=>{await evaluate("[...document.querySelectorAll('input[name=transport-"+direction+"]')].at(-1).click()");for(const[k,v]of Object.entries({line1:"12 Test road",city:"Delhi",state:"Delhi",pin:"110001"}))await fill(direction+"-"+k,v);};
 const request=async()=>{await navigate("/request?design="+fixture.designId);await step("design");await next();await step("measurements");await next();await step("logistics");await fill("customerName","Disposable shipping customer");await fill("phone","9876543210");await address("inbound");await address("outbound");};
 let settings=(await api("/admin/settings")).data;
 const distance={mode:"distance",distanceBasis:"pin_area",formula:"base_plus_distance",originPin:"201001",inbound:{minimumChargePaise:5000,perKmPaise:1000},outbound:{minimumChargePaise:6000,perKmPaise:1200}};
 await api("/admin/settings","PATCH",settingsPayload(settings,distance));
 await navigate("/admin/settings?section=business");
 await waitFor(()=>evaluate("document.getElementById('delivery-mode')?.value==='distance'"),"Saved per-km settings missing");
 check(await evaluate("document.getElementById('delivery-originPin').value==='201001'&&document.getElementById('delivery-inbound-perKmPaise').value==='10'"),"Admin per-km/origin settings persist accurately");
 await capture("admin","#delivery-mode");
 await request();
 check(await evaluate("!document.querySelector('.request-parcel-details')"),"Per-km pricing does not require invented parcel weights");
 await next();await step("review");
 await waitFor(()=>evaluate("document.querySelectorAll('.request-price .delivery-charge-details').length===2"),"Distance charge details missing");
 check(await evaluate("[...document.querySelectorAll('.request-price a')].filter(a=>a.href==='https://www.geonames.org/').length===2"),"Approximate PIN-area distance is attributed and shown per direction");
 await capture("distance",".request-price");

 settings=(await api("/admin/settings")).data;
 await api("/admin/settings","PATCH",settingsPayload(settings,{mode:"courier",courierProvider:"delhivery",originPin:"201001",inbound:{minimumChargePaise:10000},outbound:{minimumChargePaise:0}}));
 await navigate("/admin/settings?section=business");
 await waitFor(()=>evaluate("!!document.getElementById('courier-delhivery-apiToken')"),"Courier account form missing");
 await fill("courier-delhivery-apiToken","isolated-fixture-token");
 check(await evaluate("document.getElementById('courier-delhivery-apiToken').type==='password'"),"Courier token input is masked");
 await evaluate("document.getElementById('courier-delhivery-apiToken').form.requestSubmit()");
 await waitFor(()=>evaluate("document.getElementById('courier-delhivery-apiToken').value===''"),"Saved credential was not cleared");
 const status=(await api("/admin/courier-connections")).data;
 const connection=status.providers.find(p=>p.provider==="delhivery");
 check(connection.configured&&!connection.verified&&!JSON.stringify(status).includes("isolated-fixture-token"),"Saved account is configured, not falsely verified; secrets never returned");
 await request();
 await waitFor(()=>evaluate("document.querySelectorAll('.request-parcel-details').length===2"),"Courier package fields missing");
 for(const direction of["inbound","outbound"]){
  // Each direction has a dedicated fieldset; find it by the known numeric input after toggling its checkbox.
  await evaluate("(()=>{const fields=[...document.querySelectorAll('.request-parcel-details')];const f=fields["+JSON.stringify(direction==="inbound"?0:1)+"];const box=f.querySelector('input[type=checkbox]');if(!box.checked)box.click();})()");
  for(const[k,v]of Object.entries({weightGrams:"500",lengthCm:"20",widthCm:"15",heightCm:"10"}))await fill(direction+"-parcel-"+k,v);
 }
 await next();await step("review");
 await waitFor(()=>evaluate("document.querySelector('.request-price h2')?.textContent==='₹490'"),"Live courier + minimum floor total incorrect");
 check(await evaluate("document.querySelectorAll('.request-price .delivery-charge-details').length===2"),"Live courier estimates shown separately for pickup and delivery");
 check(await evaluate("document.querySelector('.request-price').textContent.includes('+₹30')"),"Minimum adjustment is transparent beside the actual courier quote");
 await capture("courier",".request-price");
 await click('input[type=checkbox][required]');
 await waitFor(()=>evaluate("!document.querySelector('.request-actions button:not([type=button])').disabled"),"Submit not enabled");
 await next();
 await waitFor(()=>evaluate("location.pathname.startsWith('/orders/')&&!!document.querySelector('.delivery-charge-details')"),"Shipping request not submitted");
 const orderId=await evaluate("location.pathname.split('/').at(-1)"),order=(await api("/orders/"+orderId)).data;
 check(order.logistics.inbound.parcel.weightGrams===500&&order.estimate.lineItems.filter(l=>l.pricingMode==="courier").length===2,"Submitted request preserves parcel data and quoted charges");
 check(browserErrors.length===0,"No uncaught browser exceptions");
 report.status="passed";
}catch(error){report.failureContext=await evaluate("({route:location.pathname+location.search,text:document.querySelector('main')?.textContent.slice(-16000)})");report.screenshots.push(path.relative(root,await screenshot("shipping-failure",390,844)));throw error;}
},{courierQuote:fakeQuote});
}catch(error){report.status="failed";report.error=error.stack||error.message;process.exitCode=1;}
await fs.writeFile(path.join(root,"artifacts/shipping-browser-report.json"),JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
