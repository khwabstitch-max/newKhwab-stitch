import test from "node:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { writeCatalogueBackup } from "../src/catalogue-backup.js";
import assert from "node:assert/strict";
import { catalogueCodePrefix, catalogueCodeNumber, allocateCatalogueCode, assertCatalogueIdentity } from "../src/catalogue-codes.js";
import { productionCataloguePlan } from "../src/catalogue-migration.js";
import { PRODUCTION_DESIGN_PROFILES, productionDesignContent, publicProductionDesign, productionOptionFields } from "../src/catalogue-production.js";
import { designInput, orderInput } from "../src/domain.js";

test("catalogue identities use zero-based garment and independent option namespaces", () => {
  for (const [garment, prefix] of [["kurti","K"],["suit","KS"],["blouse","B"],["alteration","A"]]) assert.equal(catalogueCodePrefix("design",{garment}),prefix);
  for (const [kind,prefix] of [["sleeve","SD"],["sleeveLength","SL"],["neck","FN"],["back","BN"]]) assert.equal(catalogueCodePrefix("option",{kind}),prefix);
  assert.equal(catalogueCodeNumber("SD-0","SD"),0);
  assert.equal(catalogueCodeNumber("SD-10","SD"),10);
  assert.equal(catalogueCodeNumber("SD-01","SD"),null);
  assert.equal(catalogueCodeNumber("FN-0","BN"),null);
});
test("code reservations remain unique and are never reused after a record is deleted", async () => {
  const counters = new Map(), records=[];
  const Model={find:()=>({select(){return this;},session(){return this;},async lean(){return records;}})};
  const models={Design:Model,CatalogueCodeSequence:{
    async updateOne({_id},{$max}){counters.set(_id,Math.max(counters.get(_id)||0,$max.value));},
    async findOneAndUpdate({_id},{$inc}){const value=(counters.get(_id)||0)+$inc.value;counters.set(_id,value);return{value};}
  }};
  const codes=await Promise.all(Array.from({length:16},()=>allocateCatalogueCode(models,"design",{garment:"kurti"},null)));
  assert.equal(new Set(codes).size,16); assert.equal(codes[0],"K-0"); assert.equal(codes.at(-1),"K-15");
  assert.equal(await allocateCatalogueCode(models,"design",{garment:"kurti"},null),"K-16");
  records.push({code:"K-50"});
  assert.equal(await allocateCatalogueCode(models,"design",{garment:"kurti"},null),"K-51");
});
test("existing codes and their garment or option namespace cannot be silently reassigned",()=>{
  assert.doesNotThrow(()=>assertCatalogueIdentity({code:"B-0",garment:"blouse"},{code:"B-0",garment:"blouse",title:"New display title"},"design"));
  assert.throws(()=>assertCatalogueIdentity({code:"B-0",garment:"blouse"},{code:"B-1"},"design"),error=>error.code==="CATALOGUE_CODE_IMMUTABLE");
  assert.throws(()=>assertCatalogueIdentity({code:"B-0",garment:"blouse"},{garment:"kurti"},"design"),error=>error.code==="CATALOGUE_TYPE_IMMUTABLE");
  assert.throws(()=>assertCatalogueIdentity({code:"SD-0",kind:"sleeve"},{kind:"neck"},"option"),error=>error.code==="CATALOGUE_TYPE_IMMUTABLE");
});
test("migration enriches known references without inventing component selections or changing money",()=>{
  const designs=PRODUCTION_DESIGN_PROFILES.map((profile,index)=>({_id:profile.id,slug:profile.slug,garment:profile.garment,code:profile.legacyCode,title:"Demo sample",titleHi:"",description:"Old development description",startingPricePaise:15000+index,defaultComponents:{},mediaIds:["preserved-upload"],revision:3}));
  const options=[{_id:"option-cap",code:"KS-SD-05",name:"Cap sleeve",kind:"sleeve",garments:["kurti","suit","blouse","alteration"],amountPaise:5000,priceMode:"additional",compatibleLengthStyles:["short","full"],revision:0}];
  const before=structuredClone({designs,options}),plan=productionCataloguePlan(designs,options);
  assert.deepEqual(designs,before.designs); assert.deepEqual(options,before.options);
  assert.deepEqual(plan.designChanges.map(item=>item.code),["K-0","K-1","KS-0","B-0","A-0"]);
  assert.equal(plan.optionChanges[0].code,"SD-0");
  assert.deepEqual(plan.optionChanges[0].fields.compatibleLengthStyles,["short"]);
  assert.deepEqual(plan.optionChanges[0].fields.garments,["kurti","suit","blouse"]);
  for(const item of [...plan.designChanges,...plan.optionChanges])for(const key of ["startingPricePaise","amountPaise","replacementAdjustmentPaise","defaultComponents","mediaIds","slug","_id"])assert.equal(key in item.fields,false,key);
  const migratedDesigns=designs.map(record=>({...record,...plan.designChanges.find(change=>change.id===record._id)?.fields}));
  const migratedOptions=options.map(record=>({...record,...plan.optionChanges.find(change=>change.id===record._id)?.fields}));
  const next=productionCataloguePlan(migratedDesigns,migratedOptions,plan.sequences.map(item=>({_id:item.key,value:item.value})));
  assert.equal(next.designChanges.length,0);assert.equal(next.optionChanges.length,0);
});
test("legacy aliases and reserved counters preserve future code monotonicity",()=>{
  const design={_id:"unknown",code:"K-9",garment:"kurti",title:"Owned",titleHi:"मालिक का डिज़ाइन",descriptionHi:"विवरण"};
  const legacy={_id:"new",code:"OLD-1",garment:"kurti",title:"Owned",titleHi:"मालिक का डिज़ाइन",descriptionHi:"विवरण"};
  const plan=productionCataloguePlan([design,legacy],[],[{_id:"design:K",value:20}]);
  assert.equal(plan.designChanges[0].code,"K-20");
  assert.deepEqual(plan.designChanges[0].fields.codeAliases,["OLD-1"]);
});
test("production descriptions are bilingual, service-specific and owner edits remain authoritative",()=>{
  for(const profile of PRODUCTION_DESIGN_PROFILES){
    const record={_id:profile.id,code:profile.legacyCode,slug:profile.slug,garment:profile.garment,title:"Demo sample",startingPricePaise:12345};
    const content=productionDesignContent(record);assert.match(content.titleHi,/[\u0900-\u097f]/);assert.match(content.descriptionHi,/[\u0900-\u097f]/);assert.ok(content.serviceNotesHi);
    const projected=publicProductionDesign(record);assert.equal(projected.startingPricePaise,12345);assert.equal(projected.code,record.code);
    assert.equal(/demo/i.test(projected.title),false);
    const owned={...record,title:"Owner's custom title"};assert.equal(publicProductionDesign(owned),owned);
    if(profile.garment==="alteration"){assert.ok(content.designDetails.scope);assert.ok(content.designDetails.preparationHi);assert.equal(content.designDetails.neck,undefined);}
  }
  assert.equal(productionDesignContent({_id:"unrelated",slug:"other",garment:"kurti"}),null);
});
test("sleeve compatibility is curated per silhouette and does not mutate pricing fields",()=>{
  assert.deepEqual(productionOptionFields({name:"Bishop balloon sleeve",kind:"sleeve",garments:["blouse"]}).compatibleLengthStyles,["three_quarter","full"]);
  assert.deepEqual(productionOptionFields({name:"Puff sleeve",kind:"sleeve",garments:["kurti"]}).compatibleLengthStyles,["short","elbow"]);
  assert.equal(productionOptionFields({name:"Owned custom sleeve",kind:"sleeve",garments:["kurti"]}).compatibleLengthStyles,undefined);
});
test("admin create can omit or leave a code blank while server allocation supplies identity",()=>{
  const value={title:"A new blouse",slug:"new-blouse",garment:"blouse",description:"Made from customer fabric.",startingPricePaise:30000};
  assert.equal(designInput.safeParse(value).success,true);
  assert.equal(designInput.parse({...value,code:""}).code,undefined);
});
test("sample garments need an explicit acknowledgement and preserve old request shapes",()=>{
  const value={garment:"kurti",quantity:1,designId:"1".repeat(24),configuration:{source:"catalogue",mode:"exact",components:{},addonIds:[]},preferences:{},measurements:{unit:"in",method:"garment",takenBy:"sample",sampleGarmentIncluded:true,values:{},reconfirmFields:["bust"]},customer:{name:"Customer",phone:"9876543210"},fabricAcknowledged:true};
  assert.equal(orderInput.safeParse(value).success,true);
  assert.equal(orderInput.safeParse({...value,measurements:{...value.measurements,sampleGarmentIncluded:false}}).success,false);
  assert.equal(orderInput.safeParse({...value,measurements:{...value.measurements,values:{bust:36}}}).success,false);
  assert.equal(orderInput.safeParse({...value,measurements:{...value.measurements,method:"body"}}).success,false);
  const old=orderInput.parse({...value,measurements:{unit:"in",method:"assistance",values:{}}});
  assert.equal(Object.hasOwn(old,"preferredDateReason"),false);
  assert.equal(Object.hasOwn(old.measurements,"sampleGarmentIncluded"),false);
});

test("apply backups preserve exact catalogue data, exclude unrelated records and fail closed when storage is unavailable", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "catalogue-backup-"));
  const records = { designs: [{ _id: "retained-id", code: "K-0", startingPricePaise: 30000 }], options: [{ _id: "option", amountPaise: 5000 }], counters: [{ _id: "design:K", value: 1 }], orders: [{ private: true }], users: [{ private: true }] };
  const first = await writeCatalogueBackup(records, directory);
  const second = await writeCatalogueBackup(records, directory);
  assert.notEqual(first, second);
  const saved = JSON.parse(await readFile(first, "utf8"));
  assert.deepEqual(saved.designs, records.designs); assert.deepEqual(saved.options, records.options); assert.deepEqual(saved.counters, records.counters);
  assert.equal(saved.scope, "catalogue-only"); assert.equal(saved.orders, undefined); assert.equal(saved.users, undefined);
  const blocked = path.join(directory, "file-not-directory");
  await writeFile(blocked, "occupied");
  await assert.rejects(writeCatalogueBackup(records, blocked), error => error.name === "CatalogueBackupError");
});

test("legacy option suffixes sort numerically and space-separated demo names are curated or flagged", () => {
  const options = [{ _id: "z", code: "LEGACY-2", name: "Second", kind: "neck", garments: ["kurti"] }, { _id: "a", code: "LEGACY-10", name: "Tenth", kind: "neck", garments: ["kurti"] }];
  const profile = PRODUCTION_DESIGN_PROFILES[1];
  const designs = [{ _id: profile.id, slug: profile.slug, garment: profile.garment, code: "K-0", title: "Demo sample" }, { _id: "other", garment: "blouse", code: "B-0", title: "Demo example", titleHi: "present", descriptionHi: "present" }];
  const plan = productionCataloguePlan(designs, options);
  assert.deepEqual(plan.optionChanges.map(item => [item.previousCode, item.code]), [["LEGACY-2", "FN-0"], ["LEGACY-10", "FN-1"]]);
  assert.equal(plan.designChanges.find(item => item.id === profile.id).fields.title, profile.content.title);
  assert.ok(plan.warnings.some(item => item.id === "other"));
});
