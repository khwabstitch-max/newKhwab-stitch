import { isDeepStrictEqual } from "node:util";

// Keep the explicit deployment invariants as a minimum, then include every
// model's schema-defined unique/TTL indexes so newly added features are checked.
const required = {
  RequestLimit:[[{key:1,bucket:1},true],[{expiresAt:1},false,0]],
  CommerceWallet:[[{owner:1},true],[{referralCode:1},true]],
  CommerceLedger:[[{owner:1,eventKey:1},true]],
  CommerceReservation:[[{orderId:1,quoteVersion:1},true]],
  CommerceOffer:[[{code:1},true]],
  CommerceOfferUse:[[{orderId:1,quoteVersion:1},true]],
  CommerceReferral:[[{referredOwner:1},true]],
  CommerceMilestone:[[{owner:1,code:1},true]],
  CommerceCompletion:[[{orderId:1},true]],
};
function matchesIndex(index, keys, options) {
  return JSON.stringify(index.key) === JSON.stringify(keys)
    && (!options.unique || index.unique === true)
    && (options.expireAfterSeconds === undefined || index.expireAfterSeconds === options.expireAfterSeconds)
    && Boolean(index.sparse) === Boolean(options.sparse)
    && isDeepStrictEqual(index.partialFilterExpression || {}, options.partialFilterExpression || {});
}
export async function assertDeploymentIndexes(models) {
  const names = new Set([...Object.keys(required), ...Object.keys(models)]);
  await Promise.all([...names].map(async name => {
    const model = models[name];
    const definitions = [
      ...(required[name] || []).map(([key, unique, ttl]) => [key, { unique, ...(ttl === undefined ? {} : { expireAfterSeconds: ttl }) }]),
      ...(model?.schema?.indexes() || []).filter(([, options]) => options.unique || options.expireAfterSeconds !== undefined),
    ];
    if (!definitions.length) return;
    const message = `Required ${name} indexes are missing or incompatible. Back up and run npm run db:indexes before starting the API.`;
    if (!model) throw Error(message);
    let indexes;
    try { indexes = await model.collection.listIndexes().toArray(); }
    catch { throw Error(message); }
    for (const [keys, options] of definitions) {
      if (!indexes.some(index => matchesIndex(index, keys, options))) throw Error(message);
    }
  }));
}
