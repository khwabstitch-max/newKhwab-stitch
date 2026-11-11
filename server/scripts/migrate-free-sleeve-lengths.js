import { parseArgs } from "node:util";
import { connect } from "./runtime.js";
const {values}=parseArgs({options:{execute:{type:"boolean",default:false}}});
if(!values.execute){process.stdout.write(JSON.stringify({mode:"dry-run-plan",changes:["Set sleeveLength option amounts to zero and priceMode included.","Invalidate cached estimates in editable drafts using revisions; preserve choices and measurements."],preserved:["Accepted quotes","Submitted orders","Customer identities","Standalone sleeve-design amounts"],next:"Back up the configured database and review environment before --execute. New runtime calculations already enforce zero length fees."},null,2));process.exit(0);}
let ctx;
try{ctx=await connect();const result=await ctx.transaction(async session=>{
 const options=await ctx.models.DesignOption.updateMany({kind:"sleeveLength",$or:[{priceMode:{$ne:"included"}},{amountPaise:{$ne:0}},{replacementAdjustmentPaise:{$ne:0}}]},{$set:{priceMode:"included",amountPaise:0,replacementAdjustmentPaise:0},$inc:{revision:1}},{session});
 const drafts=await ctx.models.Draft.updateMany({status:"draft","data.pricingMigration":{$ne:"free-length-v3"}},{$unset:{"data.estimate":"","data.priceCache":""},$set:{"data.pricingMigration":"free-length-v3","data.pricingNotice":"Sleeve length has no additional charge. Review the refreshed estimate."},$inc:{revision:1}},{session});
 return {options:options.modifiedCount,drafts:drafts.modifiedCount};});process.stdout.write(JSON.stringify({status:"migrated",...result,ordersChanged:0,quotesChanged:0}));}
finally{if(ctx)await ctx.disconnect();}
