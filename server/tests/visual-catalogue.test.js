import { test } from "node:test";
import assert from "node:assert/strict";
import { guideInput, imageIds } from "../src/visual-catalogue.js";
import { optionInput, orderInput } from "../src/domain.js";
const id="a".repeat(24);
test("guide publication requires a validated image and distinct body/garment method",()=>{
 const guide={code:"MG-01",name:"Kurti guide",garment:"kurti",method:"garment",language:"und",instructions:"Garment only",imageMediaIds:[id],status:"published"};
 assert.equal(guideInput.safeParse(guide).success,true);assert.equal(guideInput.safeParse({...guide,method:"tailor"}).success,false);assert.equal(guideInput.safeParse({...guide,imageMediaIds:[]}).success,false);assert.equal(guideInput.safeParse({...guide,imageUrl:"https://private.example.test"}).success,false);assert.equal(guideInput.safeParse({...guide,imageMediaIds:[id,id.toUpperCase()]}).success,false);
});
test("every new sleeve-length write is explicitly zero even when legacy monetary fields are supplied",()=>{
 for(const lengthStyle of ["sleeveless","short","elbow","three_quarter","full","custom"]){const result=optionInput.parse({name:"Length preference",kind:"sleeveLength",lengthStyle,garments:["kurti"],priceMode:"additional",amountPaise:99000,replacementAdjustmentPaise:7000});assert.equal(result.priceMode,"included");assert.equal(result.amountPaise,0);assert.equal(result.replacementAdjustmentPaise,0);}
});
test("unknown applicability is allowed only for unpublished draft imports",()=>{
 const option={name:"Review source",kind:"neck",garments:[],status:"draft",active:false,priceMode:"pending"};assert.equal(optionInput.safeParse(option).success,true);assert.equal(optionInput.safeParse({...option,status:"published",active:true}).success,false);
});
test("provenance rejects invalid crop bounds and selected image references are deduplicated",()=>{
 const option={name:"Round neck",kind:"neck",garments:["kurti"],sourceCrops:[{sourceFilename:"source.jpg",sourceSha256:"a".repeat(64),crop:{left:-1,top:0,width:100,height:100}}]};assert.equal(optionInput.safeParse(option).success,false);assert.deepEqual(imageIds({imageMediaId:id,imageMediaIds:[id,id]}),[id]);
});
test("who takes measurements is independent of body versus garment and assistance does not invent sizes",()=>{
 const body={garment:"kurti",quantity:1,configuration:{source:"reference",mode:"custom",components:{},addonIds:[]},preferences:{},measurements:{unit:"cm",method:"body",takenBy:"assistance",values:{}},referenceMediaIds:[id],customer:{name:"Test",phone:"9876543210"},fabricAcknowledged:true};
 assert.equal(orderInput.safeParse(body).success,true);assert.equal(orderInput.safeParse({...body,measurements:{...body.measurements,takenBy:"tailor"}}).success,false);
});
