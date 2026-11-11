import { createHash } from "node:crypto";
import { rateLimit } from "express-rate-limit";

export class MongoRateLimitStore {
  localKeys = false;
  constructor(Model, namespace, now = () => Date.now()) { this.Model=Model; this.prefix=namespace; this.now=now; }
  init(options) { this.windowMs=options.windowMs; }
  key(value) { return createHash("sha256").update(`${this.prefix}:${value}`).digest("hex"); }
  async increment(value) {
    const bucket=Math.floor(this.now()/this.windowMs), key=this.key(value);
    const resetTime=new Date((bucket+1)*this.windowMs);
    const update={$inc:{hits:1},$setOnInsert:{key,bucket,expiresAt:new Date(resetTime.getTime()+this.windowMs)}};
    let record;
    try { record=await this.Model.findOneAndUpdate({key,bucket},update,{upsert:true,returnDocument:"after"}); }
    catch(error) { if(error.code!==11000)throw error; record=await this.Model.findOneAndUpdate({key,bucket},{$inc:{hits:1}},{returnDocument:"after"}); }
    if(!record)throw Error("Rate-limit update was unavailable.");
    return {totalHits:record.hits,resetTime};
  }
  async decrement(value) { await this.Model.updateOne({key:this.key(value),bucket:Math.floor(this.now()/this.windowMs),hits:{$gt:0}},{$inc:{hits:-1}}); }
  async resetKey(value) { await this.Model.deleteMany({key:this.key(value)}); }
}
export function rateLimitFor(ctx, namespace, options) {
  const durable=ctx.config.NODE_ENV==="production" || ctx.config.RATE_LIMIT_STORE==="mongo";
  if(durable && !ctx.models.RequestLimit)throw Error("The production rate-limit model is unavailable.");
  return rateLimit({...options,...(durable?{store:new MongoRateLimitStore(ctx.models.RequestLimit,namespace)}:{})});
}
