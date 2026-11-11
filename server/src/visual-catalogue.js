import { z } from "zod";
import { createHash } from "node:crypto";
import mongoose from "mongoose";
import { GARMENTS, objectId, optionInput, revisionSchema, requestHash, sourceCropsInput } from "./domain.js";
import { adminOnly } from "./auth.js";
import { fail, requireFound } from "./errors.js";
import { pageQuery, pageResult, checkRevision, pinMedia, releaseMedia, audit, idOf } from "./route-utils.js";
import { mediaUrl } from "./media-storage.js";
import { fenceNewReferences } from "./reference-integrity.js";

export const imageIds = (record) => [...new Set([record.imageMediaId, ...(record.imageMediaIds || [])].filter(Boolean).map(id => String(id).toLowerCase()))];
export const guideInput = z.object({
  code: z.string().regex(/^[A-Z0-9][A-Z0-9_-]{1,49}$/), name: z.string().trim().min(2).max(120), nameHi: z.string().max(120).optional(),
  garment: z.enum(GARMENTS), method: z.enum(["body", "garment"]), language: z.enum(["en", "hi", "und"]),
  instructions: z.string().trim().max(2500), instructionsHi: z.string().max(2500).optional(),
  measurementFields: z.array(z.string().regex(/^[A-Za-z]{2,40}$/)).max(20).default([]),
  imageMediaIds: z.array(objectId).max(8).refine(ids => new Set(ids.map(id => id.toLowerCase())).size === ids.length, "Choose each image once.").transform(ids => ids.map(id => id.toLowerCase())), status: z.enum(["draft", "published", "archived"]).default("draft"),
  displayOrder: z.number().int().min(-10000).max(10000).default(0), sourceCrops: sourceCropsInput,
}).strict().superRefine((guide, ctx) => { if (guide.status === "published" && !guide.imageMediaIds.length) ctx.addIssue({ code: "custom", path: ["imageMediaIds"], message: "Attach a public guide image before publishing." }); });

export async function publicImages(ctx, record) {
  const assets = await ctx.models.MediaAsset.find({ _id: { $in: imageIds(record) }, private: false, purpose: "catalogue", deletingAt: null }).lean();
  const byId = new Map(assets.map(asset => [String(asset._id), asset]));
  return imageIds(record).filter(id => byId.has(id)).map(id => ({ id, url: mediaUrl(ctx.images, byId.get(id), 3600), alt: record.imageAlt || record.name, width: byId.get(id).width, height: byId.get(id).height }));
}
export async function optionInUse(ctx, id, session) {
  const keys = ["sleeve", "sleeveLength", "neck", "back", "fit"];
  const mixed = { $in: [id, new RegExp(`^${id}$`, "i")] };
  const queries = [
    [ctx.models.Design, { $or: [...keys.map(key => ({ [`defaultComponents.${key}`]: mixed })), { includedAddonIds: id }] }],
    [ctx.models.DesignOption, { incompatibleOptionIds: id }],
    [ctx.models.Order, { $or: [...keys.flatMap(key => [{ [`configuration.components.${key}.optionId`]: mixed }, { [`estimate.components.${key}.optionId`]: mixed }, { [`designSnapshot.components.${key}.optionId`]: mixed }]), { "configuration.addonIds": mixed }, { "estimate.addons.optionId": mixed }, { "designSnapshot.includedAddonIds": mixed }] }],
    [ctx.models.Draft, { $or: [...keys.map(key => ({ [`data.configuration.components.${key}.optionId`]: mixed })), { "data.configuration.addonIds": mixed }] }],
    [ctx.models.SupportProposal, { $or: keys.map(key => ({ [`changes.${key}.optionId`]: mixed })) }],
  ];
  for (const [Model, filter] of queries) if (Model && await Model.exists(filter).session(session || null)) return true;
  return false;
}
export function visualCatalogueRoutes(app, ctx, auth) {
  const admin = [auth, adminOnly], Model = ctx.models.MeasurementGuide;
  app.get("/api/measurement-guides", async (req, res) => {
    const q = pageQuery(req.query, { garment: z.enum(GARMENTS), method: z.enum(["body", "garment"]), language: z.enum(["en", "hi", "und"]) });
    const filter = { status: "published", garment: q.garment, method: q.method, language: { $in: [q.language, "und"] } };
    const [items, total] = await Promise.all([Model.find(filter).sort({ displayOrder: 1, _id: 1 }).skip((q.page-1)*q.limit).limit(q.limit).lean(), Model.countDocuments(filter)]);
    res.json(pageResult(await Promise.all(items.map(async ({ sourceCrops: _source, importKey: _key, importDigest: _digest, usedCount: _uses, ...item }) => ({ ...item, images: await publicImages(ctx, item) }))), total, q));
  });
  app.get("/api/admin/measurement-guides", ...admin, async (req, res) => {
    const q = pageQuery(req.query), [items, total] = await Promise.all([Model.find().sort({ displayOrder: 1, _id: 1 }).skip((q.page-1)*q.limit).limit(q.limit).lean(), Model.countDocuments()]);
    res.json(pageResult(await Promise.all(items.map(async item => ({ ...item, images: await publicImages(ctx,item) }))), total, q));
  });
  app.post("/api/admin/measurement-guides", ...admin, async (req, res) => {
    const body = guideInput.parse(req.body);
    const record = await ctx.transaction(async session => {
      await pinMedia(ctx, body.imageMediaIds, session, { private: false, purposes: ["catalogue"] });
      const [created] = await Model.create([body], { session });
      await audit(ctx,req,"guide.created","measurementGuide",created._id,session); return created;
    }); res.status(201).json({ data: record });
  });
  app.patch("/api/admin/measurement-guides/:id", ...admin, async (req,res) => {
    const { revision, ...raw } = req.body, expected = revisionSchema.parse(revision), body = guideInput.parse(raw);
    const record = await ctx.transaction(async session => {
      const current = requireFound(await Model.findById(idOf(req)).session(session)); checkRevision(current,expected);
      const before = imageIds(current), after = imageIds(body);
      await pinMedia(ctx,after.filter(id=>!before.includes(id)),session,{private:false,purposes:["catalogue"]});
      await releaseMedia(ctx,before.filter(id=>!after.includes(id)),session);
      const updated = await Model.findOneAndUpdate({_id:current._id,revision:expected},{$set:body,$inc:{revision:1}},{session,returnDocument:"after",runValidators:true});
      if (!updated) fail(409,"REVISION_CONFLICT","The guide changed. Refresh it.");
      await audit(ctx,req,"guide.updated","measurementGuide",current._id,session); return updated;
    }); res.json({data:record});
  });
  app.delete("/api/admin/measurement-guides/:id", ...admin, async(req,res)=>{
    const {revision,permanent=false}=z.object({revision:revisionSchema,permanent:z.boolean().optional()}).strict().parse(req.body);
    await ctx.transaction(async session=>{
      const current=requireFound(await Model.findById(idOf(req)).session(session));checkRevision(current,revision);
      if(permanent){
        const selected = { $in: [String(current._id), new RegExp(`^${current._id}$`, "i")] };
        if(current.usedCount>0 || await ctx.models.Order.exists({"measurements.guideIds":selected}).session(session) || await ctx.models.Draft.exists({"data.measurements.guideIds":selected}).session(session)) fail(409,"GUIDE_IN_USE","Archive referenced guides instead of deleting them.");
        await Model.deleteOne({_id:current._id,revision},{session});await releaseMedia(ctx,imageIds(current),session);
      }else await Model.updateOne({_id:current._id,revision},{$set:{status:"archived"},$inc:{revision:1}},{session});
      await audit(ctx,req,permanent?"guide.deleted":"guide.archived","measurementGuide",current._id,session);
    });res.json({data:permanent?{deleted:true}:{archived:true}});
  });
  app.delete("/api/admin/options/:id/permanent", ...admin, async(req,res)=>{
    const {revision}=z.object({revision:revisionSchema}).strict().parse(req.body);
    await ctx.transaction(async session=>{
      const current=requireFound(await ctx.models.DesignOption.findById(idOf(req)).session(session));checkRevision(current,revision);
      if(current.usedCount>0 || await optionInUse(ctx,String(current._id),session))fail(409,"OPTION_IN_USE","Archive referenced options instead of deleting them.");
      await ctx.models.DesignOption.deleteOne({_id:current._id,revision},{session});await releaseMedia(ctx,imageIds(current),session);
      await audit(ctx,req,"options.deleted","options",current._id,session);
    });res.json({data:{deleted:true}});
  });
  app.post("/api/admin/options/import", ...admin, async(req,res)=>{
    const items=z.object({items:z.array(z.object({importKey:z.string().min(8).max(180),option:z.unknown()}).strict()).min(1).max(50)}).strict().parse(req.body).items;
    const results=[];
    for(const item of items){
      const body=optionInput.parse({...item.option,importKey:item.importKey}), digest=requestHash(body), id=new mongoose.Types.ObjectId(createHash("sha256").update("visual-option:"+item.importKey).digest("hex").slice(0,24));
      const result=await ctx.transaction(async session=>{
        const old=await ctx.models.DesignOption.findById(id).session(session);
        if(old){if(old.importKey!==item.importKey||old.importDigest!==digest)fail(409,"IMPORT_CONFLICT","This import key already represents different source data.");return {created:false,id:String(id)};}
        await fenceNewReferences(ctx, { optionIds: body.incompatibleOptionIds || [] }, {}, session);
        await pinMedia(ctx,imageIds(body),session,{private:false,purposes:["catalogue"]});
        await ctx.models.DesignOption.create([{...body,_id:id,importDigest:digest}],{session});
        await audit(ctx,req,"options.imported","options",id,session,{importKey:item.importKey});return {created:true,id:String(id)};
      });results.push(result);
    }res.status(201).json({data:results});
  });
}
