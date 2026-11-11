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
export async function assertDeploymentIndexes(models) {
  for(const[name,definitions]of Object.entries(required)) {
    const indexes=await models[name].collection.listIndexes().toArray();
    for(const[key,unique,ttl]of definitions) {
      if(!indexes.some(index=>JSON.stringify(index.key)===JSON.stringify(key) && (!unique||index.unique===true) && (ttl===undefined||index.expireAfterSeconds===ttl))) throw Error(`Required ${name} index is missing. Back up and run the explicit database index migration.`);
    }
  }
}
