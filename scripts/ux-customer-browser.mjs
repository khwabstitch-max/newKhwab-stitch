import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withAdminBrowser } from "./admin-owner-browser.mjs";

// Real production React bundle, Chrome, Express, JWTs and a disposable Mongo replica.
// This exercises application behaviour, not live MongoDB/ImageKit/email credentials.
const root = fileURLToPath(new URL("../", import.meta.url));
const reportPath = path.join(root, "artifacts/ux-customer-browser.json");
const report = { environment: "isolated local Chrome; disposable MongoDB; test media provider", checks: [], captures: [], errors: [] };
const check = (value, description) => { assert.ok(value, description); report.checks.push(description); };

try {
  await withAdminBrowser(async ({ fixture, send, evaluate, navigate, waitFor, screenshot, browserEvents = [] }) => {
    await fixture.seedOwnerTasks();
    const monitor = `(()=>{window.__uxErrors=[];addEventListener('error',event=>{if(event instanceof ErrorEvent)window.__uxErrors.push({type:'error',message:event.message});});addEventListener('unhandledrejection',()=>window.__uxErrors.push({type:'rejection',message:'Unhandled promise rejection'}));const original=console.error;console.error=(...values)=>{window.__uxErrors.push({type:'console',message:values.filter(v=>typeof v==='string').join(' ').slice(0,300)});original.apply(console,values);};})()`;
    await send("Page.addScriptToEvaluateOnNewDocument", { source: monitor });
    await evaluate(monitor);
    const fill = async (selector, value) => evaluate(`(()=>{const node=document.querySelector(${JSON.stringify(selector)});if(!node)throw Error('Missing field');const prototype=node instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:node instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(prototype,'value').set.call(node,${JSON.stringify(value)});node.dispatchEvent(new Event(node instanceof HTMLSelectElement?'change':'input',{bubbles:true}));})()`);
    const click = async selector => evaluate(`(()=>{const node=document.querySelector(${JSON.stringify(selector)});if(!node||node.disabled)throw Error('Missing or disabled action');node.click();})()`);
    const clickLabel = async (text, selector = "label") => evaluate(`(()=>{const node=[...document.querySelectorAll(${JSON.stringify(selector)})].find(node=>node.textContent.trim()===${JSON.stringify(text)});if(!node)throw Error('Missing labelled action');(node.querySelector('input')||node).click();})()`);
    const chooseLanguage = async language => {
      const collapsed = await evaluate("document.querySelector('.language-picker select').getClientRects().length===0");
      if (collapsed) await click(".mobile-menu");
      await fill(".language-picker select", language);
      await waitFor(() => evaluate(`document.documentElement.lang===${JSON.stringify(language)}`), "The selected language did not render.");
      if (collapsed) await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    };
    const collectErrors = async () => {
      const errors = await evaluate("window.__uxErrors||[]");
      const route = await evaluate("location.pathname");
      report.errors.push(...errors.map(error => ({ route, ...error })));
      await evaluate("window.__uxErrors=[]");
    };
    const go = async route => { await collectErrors(); await navigate(route); };
    const hasNoOverflow = async description => {
      const sizes = await evaluate("({viewport:innerWidth,scroll:document.documentElement.scrollWidth})");
      check(sizes.scroll <= sizes.viewport + 1, description + ` (${sizes.scroll}/${sizes.viewport}px)`);
    };
    const waitCollection = () => waitFor(() => evaluate("Boolean(document.querySelector('.public-design-card'))"), "The public collection did not load.");
    const step = expected => waitFor(() => evaluate(`new URLSearchParams(location.search).get('step')===${JSON.stringify(expected)}&&Boolean(document.querySelector('.wizard-form'))`), "The request did not reach " + expected + ".");
    const continueForm = async () => { await click(".wizard-form .request-actions button:not([type=button])"); };
    const currentDraft = () => evaluate(`(()=>{const id=new URLSearchParams(location.search).get('draft');return JSON.parse(sessionStorage.getItem('khwab:request:v2:'+id)||'null')?.data;})()`);
    const waitDraft = async predicate => waitFor(async () => predicate(await currentDraft()), "Entered request data was not saved in this tab.");

    // Logout is a real application action, not a storage manipulation.
    await go("/");
    await waitCollection();
    await click(".public-footer button.text-button");
    await waitFor(() => evaluate("location.pathname==='/login'"), "The test owner could not sign out.");
    await go("/");
    await waitCollection();
    check(await evaluate("document.querySelector('.home-hero h1').textContent==='Your fabric. Your design. Stitched to your measurements.'"), "Approved English hero is persistent and not a rotating promotion.");
    check(await evaluate("Boolean(document.querySelector('.home-hero a[href=\"/contact\"]'))"), "Master-tailor guidance is accessible to guests.");
    check(await evaluate("!document.querySelector('.home-promotion')"), "No invented carousel appears when the owner has not configured slides.");
    await waitFor(() => evaluate("[...document.querySelectorAll('.home-hero-image img')].every(image=>image.complete&&image.naturalWidth>0)"), "The actual hero photograph did not load.");
    for (const language of ["en", "hi"]) {
      await chooseLanguage(language);
      for (const width of [1366, 768, 390]) {
        const capture = await screenshot(`ux-after-home-${language}-${width}`, width, width < 600 ? 844 : 1000);
        report.captures.push(path.relative(root, capture));
        await hasNoOverflow(`${language} home at ${width}px has no horizontal overflow`);
        const heading = await evaluate("(()=>{const r=document.querySelector('.home-hero h1').getBoundingClientRect();return {left:r.left,right:r.right,width:innerWidth};})()");
        check(heading.left >= 0 && heading.right <= heading.width + 1, `${language} hero heading fits ${width}px`);
      }
      for (const width of [1366, 390]) {
        await send("Emulation.setDeviceMetricsOverride", { width, height: width < 600 ? 844 : 1000, deviceScaleFactor: 1, mobile: width < 600 });
        await evaluate("document.getElementById('home-collection-title').scrollIntoView({block:'start'})");
        await waitFor(() => evaluate("[...document.querySelectorAll('.public-design-card img')].every(image=>image.complete&&image.naturalWidth>0)"), "The catalogue photograph did not load.");
        report.captures.push(path.relative(root, await screenshot(`ux-after-collection-${language}-${width}`, width, width < 600 ? 844 : 1000)));
      }
      await go("/");
      await waitCollection();
      check(await evaluate(`document.documentElement.lang===${JSON.stringify(language)}&&localStorage.getItem('khwab.language')===${JSON.stringify(language)}`), `${language} preference survives a full page refresh`);
    }
    await chooseLanguage("en");
    await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await click(".mobile-menu");
    check(await evaluate("document.querySelector('.mobile-menu').getAttribute('aria-expanded')==='true'"), "Mobile navigation exposes its expanded state.");
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    check(await evaluate("document.querySelector('.mobile-menu').getAttribute('aria-expanded')==='false'&&document.activeElement===document.querySelector('.mobile-menu')"), "Escape closes the mobile menu and restores focus.");
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 1000, deviceScaleFactor: 1, mobile: false });
    await fill(".public-search input", "PREVIEW-TEAL");
    await click(".public-search button");
    await waitFor(() => evaluate("location.pathname==='/catalogue'&&new URLSearchParams(location.search).get('q')==='PREVIEW-TEAL'&&Boolean(document.querySelector('.public-design-card'))"), "Header code search did not return the real design.");
    const filteredRoute = await evaluate("location.pathname+location.search");
    await chooseLanguage("hi");
    check(await evaluate(`location.pathname+location.search===${JSON.stringify(filteredRoute)}&&document.querySelector('.public-design-card').textContent.includes('PREVIEW-TEAL')`), "Language switching preserves search filters and the catalogue code.");
    await chooseLanguage("en");
    await click(".public-design-card");
    await waitFor(() => evaluate("location.pathname.startsWith('/designs/')"), "The design detail did not open.");
    await waitFor(() => evaluate(`Boolean([...document.querySelectorAll('a')].find(a=>a.getAttribute('href')===${JSON.stringify(filteredRoute)}))`), "The filtered return link was lost.");
    check(true, "Design detail retains the filtered catalogue return destination.");

    // A fresh reference route must never inherit the previous catalogue branch.
    await go("/"); await waitCollection();
    await click(".home-hero a[href='/request?source=reference']");
    await step("design");
    await waitFor(() => evaluate("Boolean(document.querySelector('input[name=design-source]:checked'))"), "The reference choice did not render.");
    check(await evaluate("document.querySelector('input[name=design-source]:checked').closest('label').textContent.includes('Upload my own reference')&&!document.querySelector('.request-designs')&&!document.querySelector('input[type=file]')"), "Share Your Design starts the reference branch and protects private guest uploads.");
    await fill("#quantity", "2");
    await waitDraft(draft => Number(draft?.quantity) === 2);
    const referenceRoute = await evaluate("location.pathname+location.search");
    await chooseLanguage("hi");
    check(await evaluate(`document.getElementById('quantity').value==='2'&&location.pathname+location.search===${JSON.stringify(referenceRoute)}`), "Language switching preserves entered request quantity and draft route.");
    await go(referenceRoute);
    await waitFor(() => evaluate("Boolean(document.getElementById('quantity'))"), "The refreshed reference draft did not render.");
    check(await evaluate("document.getElementById('quantity').value==='2'"), "A reference draft and its values survive page refresh.");
    await chooseLanguage("en");

    // Complete a separate exact-copy request using the actual guest/customer path.
    await go("/request?design=" + fixture.designId);
    await step("design");
    await waitFor(() => evaluate("Boolean(document.querySelector('input[name=design-mode]:checked'))"), "The original catalogue configuration did not load.");
    check(await evaluate("document.querySelector('input[name=design-mode]:checked').closest('label').textContent.includes('Same as shown')"), "Catalogue starts with its original configuration.");
    await continueForm(); await step("measurements");
    check(true, "Same as shown skips all customization sections.");
    await fill("#measurementNotes", "Customer browser measurement note");
    await continueForm(); await step("logistics");
    await fill("#customerName", "Disposable browser customer");
    await fill("#phone", "9876543210");
    await fill("#fabricDetails", "Customer supplied test cotton");
    await fill("#request-notes", "Preserve this request note");
    await continueForm(); await step("review");
    await waitDraft(draft => draft?.customer?.name === "Disposable browser customer");
    check((await currentDraft()).measurements.notes === "Customer browser measurement note", "Review preserves measurement, fabric, customer and request entries.");
    await clickLabel("Edit Measurements", "button"); await step("measurements");
    await fill("#measurementNotes", "Discard this change");
    await clickLabel("Cancel changes", "button"); await step("review");
    await waitDraft(draft => draft?.measurements?.notes === "Customer browser measurement note");
    check(true, "Cancel changes restores the edited section without losing unrelated request data.");
    await clickLabel("Edit Measurements", "button"); await step("measurements");
    await fill("#measurementNotes", "Saved measurement edit");
    await continueForm(); await step("review");
    await waitDraft(draft => draft?.measurements?.notes === "Saved measurement edit");
    check((await currentDraft()).notes === "Preserve this request note", "Save changes updates measurements and preserves unrelated notes.");
    await chooseLanguage("hi");
    report.captures.push(path.relative(root, await screenshot("ux-after-review-hi-mobile", 390, 844)));
    await hasNoOverflow("Hindi mobile review has no horizontal overflow");
    await chooseLanguage("en");
    await click(".review-step .checkbox input[type=checkbox]");
    await continueForm();
    await waitFor(() => evaluate("location.pathname==='/login'&&Boolean(document.getElementById('auth-email'))"), "Guest review did not request authentication.");
    await fill("#auth-email", fixture.customerEmail);
    await fill("#auth-password", fixture.password);
    await click(".auth-form .auth-submit");
    await waitFor(() => evaluate("location.pathname==='/request'&&Boolean(document.querySelector('.review-step'))"), "Authentication did not return to the same review.");
    await waitFor(() => evaluate("Boolean(document.querySelector('.review-step .request-actions button:not([type=button]):not([disabled])'))"), "The restored review did not obtain a current estimate.");
    check(await evaluate("document.body.textContent.includes('Saved measurement edit')&&document.body.textContent.includes('Preserve this request note')"), "Customer login returns to the preserved review without automatically submitting.");
    const reviewRoute = await evaluate("location.pathname+location.search");
    await go(reviewRoute);
    await waitFor(() => evaluate("Boolean(document.querySelector('.review-step .request-actions button:not([type=button]):not([disabled])'))"), "The signed-in review did not survive refresh.");
    check(await evaluate("document.body.textContent.includes('Saved measurement edit')&&!document.querySelector('.auth-form')"), "JWT session and current request survive refresh.");
    await continueForm();
    await waitFor(() => evaluate("/^\\/orders\\/[a-f0-9]{24}$/.test(location.pathname)"), "Explicit submit did not create the stitching request.");
    check(true, "Only explicit customer submission creates the request and opens its order detail.");
    await hasNoOverflow("Mobile order detail has no horizontal overflow");

    // A mixed catalogue/reference component must hide and restore only its gallery.
    await go("/request?design=" + fixture.designId);
    await step("design");
    await waitFor(() => evaluate("Boolean(document.querySelector('input[name=design-mode]'))"), "The customization form did not load.");
    await clickLabel("Customize this design");
    await clickLabel("Front neck design");
    await continueForm(); await step("component-neck");
    await waitFor(() => evaluate("Boolean(document.querySelector('.visual-option-selection input[type=radio]'))"), "The neckline gallery did not load an eligible option.");
    await click(".visual-option-selection input[type=radio]");
    const selectedNeck = await evaluate("document.querySelector('.visual-option-selection input:checked').value");
    await clickLabel("Follow my uploaded reference");
    check(await evaluate("!document.querySelector('.visual-options')&&Boolean(document.getElementById('reference-neck'))"), "Follow my reference hides the component gallery without altering other parts.");
    await clickLabel("Choose from Khwab Stitch designs");
    await waitFor(() => evaluate(`document.querySelector('.visual-option-selection input:checked')?.value===${JSON.stringify(selectedNeck)}`), "The selected eligible component option did not return.");
    check(true, "Switching back to our designs restores the eligible selected option.");
    await collectErrors();
    report.browserEvents = browserEvents;
    check(report.errors.length === 0 && browserEvents.length === 0, "No uncaught errors, rejected promises, console errors or failed resources occurred in the exercised browser flows.");
  });
  report.status = "Verified";
} catch (error) {
  report.status = "Failed";
  report.failure = { name: error.name, message: error.message };
  process.exitCode = 1;
}
await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
process.stdout.write(JSON.stringify({ status: report.status, checks: report.checks.length, captures: report.captures, failure: report.failure, report: path.relative(root, reportPath) }) + "\n");
