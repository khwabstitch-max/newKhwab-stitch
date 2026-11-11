export function createCommerceSchemas({ Schema, oid, opts, revision, text }) {
  const owner = { type: oid, ref: "User", required: true };
  const schemas = {
    CommerceSettings: new Schema({
      key: { type: String, default: "main", unique: true },
      enabled: { type: Boolean, default: false },
      offersEnabled: { type: Boolean, default: false },
      creditsEnabled: { type: Boolean, default: false },
      referralsEnabled: { type: Boolean, default: false },
      loyaltyEnabled: { type: Boolean, default: false },
      maxCreditBps: { type: Number, default: 0, min: 0, max: 10000 },
      referralRewardPaise: { type: Number, default: 0, min: 0 },
      referredRewardPaise: { type: Number, default: 0, min: 0 },
      qualifyingStitchingPaise: { type: Number, default: 0, min: 0 },
      milestones: { type: [new Schema({
        code: { type: String, required: true },
        orders: { type: Number, min: 1, required: true },
        rewardPaise: { type: Number, min: 1, required: true },
      }, { _id: false, strict: "throw" })], default: [] },
      terms: text(2500),
      termsHi: text(2500),
      revision,
    }, opts),
    CommerceOffer: new Schema({
      code: { type: String, required: true, unique: true },
      name: { type: String, required: true }, nameHi: text(120),
      description: text(1000), descriptionHi: text(1000),
      status: { type: String, enum: ["draft", "published", "archived"], default: "draft" },
      type: { type: String, enum: ["fixed", "percentage"], required: true },
      value: { type: Number, min: 1, required: true },
      maxDiscountPaise: { type: Number, min: 1, default: null },
      minimumStitchingPaise: { type: Number, min: 0, default: 0 },
      garments: [String],
      startsAt: { type: Date, default: null }, endsAt: { type: Date, default: null },
      totalUseLimit: { type: Number, min: 1, default: null },
      perCustomerLimit: { type: Number, min: 1, default: 1 },
      usedCount: { type: Number, min: 0, default: 0 },
      displayOrder: { type: Number, default: 0 }, revision,
    }, opts),
    CommerceWallet: new Schema({
      owner: { ...owner, unique: true },
      balancePaise: { type: Number, min: 0, default: 0 },
      referralCode: { type: String, required: true, unique: true },
      revision,
    }, opts),
    CommerceLedger: new Schema({
      owner, eventKey: { type: String, required: true, maxlength: 180 },
      kind: { type: String, enum: ["admin", "redemption", "reversal", "referral", "loyalty"], required: true },
      deltaPaise: { type: Number, required: true }, balancePaise: { type: Number, min: 0, required: true },
      reason: text(300), orderId: { type: oid, ref: "Order", default: null },
      actor: { type: oid, ref: "User", default: null }, requestHash: { type: String, required: true },
    }, opts),
    CommerceReservation: new Schema({
      owner, orderId: { type: oid, ref: "Order", required: true }, quoteVersion: { type: Number, required: true },
      selection: { type: Schema.Types.Mixed, required: true },
      preview: { type: Schema.Types.Mixed, required: true },
      state: { type: String, enum: ["pending", "committed", "released"], default: "pending" },
      committedAt: Date, releasedAt: Date,
    }, opts),
    CommerceOfferUse: new Schema({
      owner, offerId: { type: oid, ref: "CommerceOffer", required: true },
      orderId: { type: oid, ref: "Order", required: true }, quoteVersion: { type: Number, required: true },
      state: { type: String, enum: ["used", "released"], default: "used" },
    }, opts),
    CommerceReferral: new Schema({
      referredOwner: { ...owner, unique: true }, referrerOwner: owner,
      code: { type: String, required: true },
      state: { type: String, enum: ["claimed", "qualified"], default: "claimed" },
      qualifiedOrderId: { type: oid, ref: "Order", default: null },
      qualifiedAt: Date,
    }, opts),
    CommerceMilestone: new Schema({
      owner, code: { type: String, required: true },
      orderId: { type: oid, ref: "Order", required: true },
      rewardPaise: { type: Number, min: 1, required: true },
    }, opts),
    CommerceCompletion: new Schema({
      owner, orderId: { type: oid, ref: "Order", required: true, unique: true },
      stitchingPaise: { type: Number, min: 0, required: true },
    }, opts),
  };
  schemas.CommerceLedger.index({ owner: 1, eventKey: 1 }, { unique: true });
  schemas.CommerceLedger.index({ owner: 1, createdAt: -1, _id: -1 });
  schemas.CommerceReservation.index({ orderId: 1, quoteVersion: 1 }, { unique: true });
  schemas.CommerceReservation.index({ owner: 1, state: 1 });
  schemas.CommerceOfferUse.index({ orderId: 1, quoteVersion: 1 }, { unique: true });
  schemas.CommerceOfferUse.index({ owner: 1, offerId: 1, state: 1 });
  schemas.CommerceOffer.index({ status: 1, displayOrder: 1, _id: 1 });
  schemas.CommerceReferral.index({ referrerOwner: 1, state: 1 });
  schemas.CommerceMilestone.index({ owner: 1, code: 1 }, { unique: true });
  schemas.CommerceCompletion.index({ owner: 1, createdAt: 1 });
  return schemas;
}
