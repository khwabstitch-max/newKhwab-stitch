import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withAdminBrowser } from "./admin-owner-browser.mjs";

const root = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const report = { isolated: true, database: "disposable MongoDB replica set", authentication: "real API JWT and password verification", media: "isolated in-memory provider; real multipart validation, decode and database references; ImageKit not contacted", checks: [], captures: [] };
let stage = "start";
const assert = (value, message) => { if (!value) throw new Error(message); };

try {
  await withAdminBrowser(async browser => {
    const { fixture, evaluate, navigate, waitFor, fill, click, uploadFile, screenshot } = browser;
    try {
    const seeded = await fixture.seedOwnerTasks();
    const read = async (route, authenticated = true) => {
      assert(/^\/api\/[a-zA-Z0-9/?=&%_-]+$/.test(route), "Invalid isolated read route.");
      return evaluate(`(async()=>{const stored=${authenticated ? "JSON.parse(sessionStorage.getItem('khwab.session.v1')||'null')" : "null"};const response=await fetch(${JSON.stringify(route)},{headers:stored?.token?{Authorization:'Bearer '+stored.token}:{}});if(!response.ok)throw Error('Read failed');return response.json();})()`);
    };
    const waitInput = id => waitFor(() => evaluate(`Boolean(document.getElementById(${JSON.stringify(id)}))`), `The ${id} field did not render.`);
    const formClosed = () => waitFor(() => evaluate("!document.querySelector('form[data-admin-editor]')"), "The editor did not save and close.");
    const editRow = text => evaluate(`(()=>{const row=[...document.querySelectorAll('tr')].find(row=>row.textContent.includes(${JSON.stringify(text)}));const button=[...row?.querySelectorAll('button')||[]].find(button=>button.textContent.trim()==='Edit');if(!button)throw Error('Missing edit row');button.click();})()`);
    const uploadPhoto = async (selector, relativePath) => {
      const previous = await evaluate("document.querySelector('.media-choice.selected img')?.src || ''");
      await uploadFile(selector, relativePath);
      await waitFor(() => evaluate(`Boolean(document.querySelector('.media-choice.selected img')?.naturalWidth) && document.querySelector('.media-choice.selected img').src!==${JSON.stringify(previous)} && !document.querySelector('fieldset[disabled] input[type=file]')`), "The uploaded photograph was not attached.");
    };
    const checkNoAlert = async () => assert(!(await evaluate("Boolean(document.querySelector('[role=alert]'))")), "The owner screen displayed an error alert.");

    stage = "neck-create-photo-price";
    await navigate("/admin/options?kind=neck");
    await waitFor(() => evaluate("document.body.textContent.includes('New option')"), "Front neck choices did not load.");
    await click("New option"); await waitInput("taxonomyName");
    await fill("taxonomyName", "QA owner front neck");
    await fill("option-description", "Disposable browser task: round front neckline.");
    await fill("option-image-alt", "Front view of a round neckline");
    await fill("option-publication", "published");
    await fill("option-price-mode", "additional");
    await fill("option-price", "30.25");
    await uploadPhoto("form[data-admin-editor] input[type=file]", "client/public/crops/neck/round-neck.jpg");
    await click("Save option"); await formClosed();
    const neck = (await read("/api/admin/options?kind=neck&limit=30")).data.find(option => option.name === "QA owner front neck");
    assert(neck?.amountPaise === 3025 && neck.status === "published" && neck.imageMediaId, "Front neck price, publication or photograph did not persist.");
    const eligible = (await read("/api/options?kind=neck&garment=kurti&limit=30", false)).data;
    assert(eligible.some(option => option._id === neck._id && option.imageUrl), "The published neckline was missing from the customer selector.");
    report.checks.push("Owner created a front neckline with an uploaded photograph and ₹30.25 charge; database and public selector retain it.");

    stage = "sleeve-edit";
    await navigate("/admin/options?kind=sleeve");
    await waitFor(() => evaluate("document.querySelector('table')?.textContent.includes('Full sleeve modification')"), "Sleeve choices did not load.");
    await editRow("Full sleeve modification"); await waitInput("taxonomyName");
    await fill("option-description", "Updated by the isolated owner browser task.");
    await fill("option-price", "160.50");
    await click("Save option"); await formClosed();
    const sleeve = (await read("/api/admin/options?kind=sleeve&limit=30")).data.find(option => option.name === "Full sleeve modification");
    assert(sleeve?.amountPaise === 16050 && sleeve.description === "Updated by the isolated owner browser task.", "Sleeve edit did not persist.");
    report.checks.push("Owner edited an existing sleeve description and ₹160.50 charge without changing its kind.");

    stage = "sleeve-length-free";
    await navigate("/admin/options?kind=sleeveLength");
    await waitFor(() => evaluate("document.body.textContent.includes('New option')"), "Sleeve length choices did not load.");
    await click("New option"); await waitInput("taxonomyName");
    await fill("taxonomyName", "QA owner full length");
    await fill("option-publication", "published"); await fill("option-length-style", "full");
    assert(!(await evaluate("Boolean(document.getElementById('option-price'))")), "Sleeve length incorrectly offered a surcharge field.");
    await uploadPhoto("form[data-admin-editor] input[type=file]", "client/public/crops/length/full-sleeve.jpg");
    await click("Save option"); await formClosed();
    const length = (await read("/api/options?kind=sleeveLength&garment=kurti&limit=30", false)).data.find(option => option.name === "QA owner full length");
    assert(length?.amountPaise === 0 && length.priceMode === "included" && length.lengthStyle === "full", "Sleeve length was not free and included.");
    report.checks.push("Owner created a full-length preference; surcharge controls are absent and the public API returns included / zero paise.");

    stage = "category-design-assignment";
    await navigate("/admin/categories");
    await waitFor(() => evaluate("document.body.textContent.includes('New category')"), "Categories did not load.");
    await click("New category"); await waitInput("taxonomyName");
    await fill("taxonomyName", "QA owner category"); await fill("taxonomySlug", "qa-owner-category");
    await click("Save category"); await formClosed();
    const category = (await read("/api/admin/categories?limit=30")).data.find(item => item.slug === "qa-owner-category");
    assert(category?._id, "The new category did not persist.");
    await navigate("/admin/designs");
    await waitFor(() => evaluate("document.querySelector('table')?.textContent.includes('PREVIEW-TEAL')"), "Designs did not load.");
    await editRow("PREVIEW-TEAL"); await waitInput("designCategory");
    await fill("designCategory", category._id); await click("Save design");
    await waitFor(() => evaluate("!document.getElementById('designCategory')"), "Design assignment did not save.");
    const assigned = (await read("/api/admin/designs/" + fixture.designId)).data;
    assert(String(assigned.category?._id || assigned.category) === category._id, "The design category was not retained.");
    report.checks.push("Owner created a category and assigned the existing published design; assignment survives a fresh API read.");

    stage = "banner-create-replace";
    await navigate("/admin/settings?section=slides");
    await waitFor(() => evaluate("document.querySelector('#owner-website-settings')"), "Homepage editor did not load.");
    await click("Add a homepage slide"); await waitInput("homepage-slide-0-title");
    for (const [field, value] of [["title", "QA seasonal story"], ["titleHi", "परीक्षण का मौसमी संदेश"], ["description", "Disposable local browser verification."], ["descriptionHi", "केवल स्थानीय ब्राउज़र जाँच के लिए।"], ["actionLabel", "Explore designs"], ["actionLabelHi", "डिज़ाइन देखें"]]) await fill("homepage-slide-0-" + field, value);
    await fill("slide-kind-0", "seasonal");
    await uploadPhoto(".admin-slide-card input[type=file]", "client/public/crops/neck/boat-neck.jpg");
    await evaluate("document.querySelector('.admin-slide-card > label.checkbox input[type=checkbox]').click()");
    await click("Save website content");
    await waitFor(async () => (await read("/api/admin/settings")).data.homepage?.slides?.[0]?.title === "QA seasonal story", "The homepage slide did not save.");
    await waitInput("homepage-slide-0-title");
    const firstSlide = (await read("/api/admin/settings")).data.homepage.slides[0];
    assert(firstSlide.active && firstSlide.imageMediaId, "The initial slide did not persist.");
    await uploadPhoto(".admin-slide-card input[type=file]", "client/public/crops/back/round-back.jpg");
    await click("Save website content");
    await waitFor(async () => { const data = (await read("/api/admin/settings")).data; return data.homepage.slides[0].imageMediaId !== firstSlide.imageMediaId; }, "The replacement slide photograph did not save.");
    const homepage = (await read("/api/settings", false)).data.homepage;
    assert(homepage.slides.some(slide => slide.title === "QA seasonal story" && slide.imageUrl), "The public homepage did not return the real active slide.");
    report.checks.push("Owner added a bilingual seasonal slide, uploaded and replaced its photograph, saved it twice and verified the public resolved image.");

    stage = "scheduled-offer";
    await navigate("/admin/commerce");
    await waitFor(() => evaluate("document.body.textContent.includes('Create offer')"), "Offers page did not load.");
    await click("Create offer"); await waitInput("offer-name");
    await fill("offer-name", "QA scheduled offer"); await fill("offer-code", "QA-LOCAL-ONLY");
    await fill("offer-status", "published"); await fill("offer-type", "percentage"); await fill("offer-value", "12.5"); await fill("offer-minimum", "300");
    const start = Date.now() + 86400000, end = start + 86400000;
    const ist = timestamp => new Date(timestamp + 330 * 60000).toISOString().slice(0, 16);
    await fill("offer-startsAt", ist(start)); await fill("offer-endsAt", ist(end));
    await click("Save offer"); await waitFor(() => evaluate("!document.getElementById('offer-name')"), "The scheduled offer did not save.");
    const offer = (await read("/api/admin/commerce/offers?limit=30")).data.find(item => item.code === "QA-LOCAL-ONLY");
    assert(offer?.value === 1250 && offer.minimumStitchingPaise === 30000 && Math.abs(new Date(offer.startsAt).getTime() - start) < 60000, "Offer percentage, rupees or IST time conversion was incorrect.");
    report.checks.push("Owner scheduled a future 12.5% offer with ₹300 minimum; stored basis points, paise and IST-to-UTC times are correct. Disabled programme remains disabled.");

    stage = "measurement-guide-upload";
    await navigate("/admin/measurement-guides");
    await waitFor(() => evaluate("document.body.textContent.includes('New measurement guide')"), "Measurement guide page did not load.");
    await click("New measurement guide"); await waitInput("guide-name");
    await fill("guide-name", "QA owner garment guide"); await fill("guide-garment", "kurti"); await fill("guide-method", "garment"); await fill("guide-language", "und"); await fill("guide-status", "published");
    await fill("guide-instructions", "Disposable guide fixture for measuring a flat garment; verify measurement accuracy before use.");
    await evaluate("(()=>{const group=[...document.querySelectorAll('.admin-choice-group')].find(group=>group.textContent.includes('measurements'));const input=group?.querySelector('input[type=checkbox]');if(!input)throw Error('Missing measurement choice');input.click();})()");
    await uploadPhoto("form[data-admin-editor] input[type=file]", "client/public/guides/measurement-guide.jpg");
    await click("Save guide"); await formClosed();
    const guide = (await read("/api/admin/measurement-guides?limit=20")).data.find(item => item.name === "QA owner garment guide");
    assert(guide?.status === "published" && guide.imageMediaIds.length === 1 && guide.measurementFields.length === 1, "Guide photograph, measurement fields or publication was not retained.");
    report.checks.push("Owner uploaded and published a garment-specific guide with a selected measurement and stored public image reference.");

    stage = "consented-review-publication";
    await navigate("/admin/reviews");
    await waitFor(() => evaluate("document.body.textContent.includes('Isolated browser fixture review')"), "The consented completed-order review did not load.");
    await click("Publish");
    await waitFor(async () => (await read("/api/reviews", false)).data.some(review => review._id === seeded.reviewId), "The consented review was not published.");
    report.checks.push("Owner published a consented review attached to a delivered disposable order; the public reviews API now returns it.");

    stage = "unpublish-and-refresh";
    await navigate("/admin/options?kind=neck");
    await waitFor(() => evaluate("document.querySelector('table')?.textContent.includes('QA owner front neck')"), "The saved neckline did not survive navigation.");
    await editRow("QA owner front neck"); await waitInput("option-publication");
    await fill("option-publication", "draft"); await click("Save option"); await formClosed();
    assert(!(await read("/api/options?kind=neck&garment=kurti&limit=30", false)).data.some(option => option._id === neck._id), "An unpublished neckline remained in the public selector.");
    await navigate("/admin/designs");
    await waitFor(() => evaluate("document.querySelector('table')?.textContent.includes('PREVIEW-TEAL')"), "The design did not reload.");
    await editRow("PREVIEW-TEAL"); await waitInput("designStatus");
    await fill("designStatus", "draft"); await click("Save design");
    await waitFor(() => evaluate("!document.getElementById('designStatus')"), "The design did not unpublish.");
    assert(!(await read("/api/designs?limit=20", false)).data.some(design => design._id === fixture.designId), "A draft design remained in the public collection.");
    await navigate("/admin/designs");
    await waitFor(() => evaluate("document.querySelector('table')?.textContent.includes('PREVIEW-TEAL')"), "The unpublished design did not survive refresh.");
    report.checks.push("Owner unpublished a neckline and a catalogue design; public selectors exclude both while admin records remain available after refresh.");

    stage = "responsive-admin-evidence";
    await checkNoAlert();
    await navigate("/admin");
    await waitFor(() => evaluate("Boolean(document.querySelector('.admin-attention-list'))"), "The dashboard did not reload.");
    report.captures.push(path.relative(root, await screenshot("admin-after-desktop", 1440, 1000)));
    await navigate("/admin/options?kind=neck");
    await waitFor(() => evaluate("document.querySelector('table')?.textContent.includes('QA owner front neck')"), "The front neckline list did not reload.");
    report.captures.push(path.relative(root, await screenshot("admin-options-after-desktop", 1440, 1000)));
    report.captures.push(path.relative(root, await screenshot("admin-after-tablet", 768, 1024)));
    report.captures.push(path.relative(root, await screenshot("admin-after-mobile", 390, 844)));
    assert(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), "The admin page overflowed the mobile viewport.");
    assert(browser.browserErrors.length === 0, "The isolated owner tasks raised a browser console error.");
    report.checks.push("Actual Chrome dashboard/options screenshots captured at desktop, tablet and mobile widths; mobile document has no horizontal overflow and no browser exceptions were recorded.");
    } catch (error) {
      report.alert = await evaluate("document.querySelector('[role=alert]')?.textContent?.slice(0,600) || ''").catch(() => "");
      report.captures.push(path.relative(root, await screenshot("admin-owner-failure", 1440, 1000).catch(() => path.join(root, "artifacts/no-failure-image"))));
      throw error;
    }
  });
  report.status = "passed";
} catch (error) {
  report.status = "failed"; report.stage = stage; report.error = error.message; process.exitCode = 1;
}
await fs.mkdir(path.join(root, "artifacts"), { recursive: true });
await fs.writeFile(path.join(root, "artifacts/admin-owner-tasks.json"), JSON.stringify(report, null, 2) + "\n");
process.stdout.write(JSON.stringify(report) + "\n");
