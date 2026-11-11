import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { createHash } from "node:crypto";
import mongoose from "mongoose";
import sharp from "sharp";
import { connect } from "./runtime.js";
import { optionInput, requestHash } from "../src/domain.js";
import { guideInput } from "../src/visual-catalogue.js";
import { pinMedia } from "../src/route-utils.js";
import { fenceNewReferences } from "../src/reference-integrity.js";
const {values}=parseArgs({options:{manifest:{type:"string",default:"../artifacts/visual-import/manifest.json"},owner:{type:"string"},execute:{type:"boolean",default:false}}});
const manifestPath=path.resolve(values.manifest), root=path.dirname(manifestPath), manifest=JSON.parse(await fs.readFile(manifestPath,"utf8"));
if(manifest.version!==1||!Array.isArray(manifest.records)||manifest.records.length>100)throw Error("Invalid prepared manifest.");
const assets=new Map();
for(const record of manifest.records)for(const relative of record.assets){
  if(!/^assets\/[a-f0-9]{64}\.(jpg|png|webp)$/.test(relative))throw Error("Invalid staged asset path.");
  const buffer=await fs.readFile(path.join(root,relative)),hash=createHash("sha256").update(buffer).digest("hex");
  if(hash!==path.basename(relative).split(".")[0])throw Error("A staged image changed; regenerate and review the contact sheet.");
  if(buffer.length>5*1024*1024)throw Error("Staged image exceeds upload limit.");assets.set(relative,{buffer,hash});
}
if(!values.execute){process.stdout.write(JSON.stringify({mode:"preview-only",records:manifest.records.length,assets:assets.size,status:"draft",willPublish:false,willOverwrite:false,next:"Review source/crop flags, back up the configured database, then rerun with --execute to upload public catalogue assets and create draft records."},null,2));process.exit(0);}
let ctx;
try{
  ctx=await connect();
  const admins=await ctx.models.User.find({role:"admin",disabled:false,...(values.owner?{email:values.owner.toLowerCase()}: {})}).limit(2);
  if(admins.length!==1)throw Error("Specify one existing active administrator with --owner. This importer never grants roles.");
  const owner=admins[0],summary={created:0,skipped:0,uploaded:0,published:0};
  await ctx.models.DesignOption.createIndexes();
  await ctx.models.MeasurementGuide.createIndexes();
  for(const prepared of manifest.records){
    const Model=prepared.type==="option"?ctx.models.DesignOption:prepared.type==="measurementGuide"?ctx.models.MeasurementGuide:null;
    if(!Model)throw Error("Unknown manifest record type.");
    const id=new mongoose.Types.ObjectId(createHash("sha256").update("visual-record:"+prepared.importKey).digest("hex").slice(0,24));
    const digest=requestHash(prepared),old=await Model.findById(id);
    if(old){if(old.importKey!==prepared.importKey||old.importDigest!==digest)throw Error("Import key conflict; existing admin edits were not overwritten.");summary.skipped++;continue;}
    if(await Model.exists({code:prepared.code}))throw Error("A stable code is already used by an unrelated existing record; nothing was overwritten.");
    const mediaIds=[];
    for(const relative of prepared.assets){
      const {buffer,hash}=assets.get(relative),mediaId=new mongoose.Types.ObjectId(createHash("sha256").update("visual-asset:"+hash).digest("hex").slice(0,24));
      let asset=await ctx.models.MediaAsset.findById(mediaId);
      if(!asset){
        const {data,info}=await sharp(buffer,{limitInputPixels:24000000,animated:false}).rotate().resize({width:1600,height:1600,fit:"inside",withoutEnlargement:true}).webp({quality:90}).toBuffer({resolveWithObject:true});
        const uploaded=await ctx.images.upload(data,{private:false,purpose:"catalogue",owner:String(owner._id)});
        try{asset=await ctx.models.MediaAsset.create({_id:mediaId,owner:owner._id,...uploaded,purpose:"catalogue",private:false,mime:"image/webp",bytes:data.length,width:info.width,height:info.height,references:0});summary.uploaded++;}
        catch(error){await ctx.images.remove(uploaded.fileId);if(error.code!==11000)throw error;asset=await ctx.models.MediaAsset.findById(mediaId);}
      }
      if(asset.private||asset.purpose!=="catalogue"||asset.deletingAt)throw Error("Imported public asset is unavailable.");mediaIds.push(String(mediaId));
    }
    const {assets:_assets,reviewFlags:_flags,type:_type,...fields}=prepared;void _assets;void _flags;void _type;
    const body=prepared.type==="option"?optionInput.parse({...fields,imageMediaId:mediaIds[0],imageMediaIds:mediaIds,status:"draft",active:false}):guideInput.parse({code:prepared.code,name:prepared.name,garment:prepared.garment,method:prepared.method,language:prepared.language,instructions:prepared.instructions,measurementFields:prepared.measurementFields,imageMediaIds:mediaIds,status:"draft",displayOrder:prepared.displayOrder,sourceCrops:prepared.sourceCrops});
    await ctx.transaction(async session=>{
      const authorized=await ctx.models.User.updateOne({_id:owner._id,role:"admin",disabled:false},{$inc:{mutationFence:1}},{session});
      if(authorized.modifiedCount!==1)throw Error("The administrator is no longer active.");
      if (prepared.type === "option") await fenceNewReferences(ctx, { optionIds: body.incompatibleOptionIds || [] }, {}, session);
      await pinMedia(ctx, [...new Set(mediaIds)], session, { private: false, purposes: ["catalogue"] });
      await Model.create([{...body,_id:id,importKey:prepared.importKey,importDigest:digest}],{session});
      await ctx.models.AuditEvent.create([{actor:owner._id,action:"visual.imported",resourceType:prepared.type,resourceId:String(id),metadata:{code:prepared.code,status:"draft",reviewFlags:prepared.reviewFlags}}],{session});
    });summary.created++;
  }
  process.stdout.write(JSON.stringify({status:"imported-drafts",...summary,acceptedQuotesModified:false,customerDataModified:false},null,2));
}catch(error){process.stdout.write(JSON.stringify({status:"failed",code:error.code||error.name,message:error.status?error.message:"Import stopped. Inspect configuration, existing administrator and source conflicts; no unrelated record was overwritten."}));process.exitCode=1;}
finally{if(ctx)await ctx.disconnect();}
