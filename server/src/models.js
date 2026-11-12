import mongoose from "mongoose";
import { GARMENTS, STATUSES } from "./domain.js";
import { createExtensionSchemas } from "./models-extension.js";
import { createCommerceSchemas } from "./commerce-models.js";
import { OPTION_KINDS, SLEEVE_LENGTH_STYLES } from "./workflow-input.js";
const { Schema } = mongoose;
const oid = Schema.Types.ObjectId;
const opts = { timestamps: true, strict: "throw", versionKey: false };
const revision = { type: Number, default: 0, required: true, min: 0 };
const text = (max = 2000) => ({
  type: String,
  trim: true,
  maxlength: max,
  default: "",
});
export function createModels(connection = mongoose) {
  const schemas = {
    RequestLimit: new Schema({ key: {type:String,required:true}, bucket:{type:Number,required:true}, hits:{type:Number,default:0,min:0}, expiresAt:{type:Date,required:true} }, opts),
    User: new Schema(
      {
        // Optional legacy identifier is retained for operator-controlled migrations.
        firebaseUid: { type: String, select: false },
        passwordHash: { type: String, select: false },
        authVersion: { type: Number, default: 0, min: 0, required: true },
        email: { ...text(254), lowercase: true },
        emailReservation: {
          type: String,
          lowercase: true,
          trim: true,
          select: false,
        },
        name: text(100),
        phone: text(12),
        role: {
          type: String,
          enum: ["customer", "admin"],
          default: "customer",
        },
        disabled: { type: Boolean, default: false },
        deletionRequestedAt: Date,
        deletionCompletedAt: Date,
        purgeAfter: Date,
        mutationFence: { type: Number, default: 0 },
        uploadDay: String,
        uploadCount: { type: Number, default: 0 },
      },
      opts,
    ),
    Category: new Schema(
      {
        name: { type: String, required: true },
        nameHi: text(80),
        slug: { type: String, required: true, unique: true },
        active: { type: Boolean, default: true },
        designRefs: { type: Number, default: 0, min: 0 },
        revision,
      },
      opts,
    ),
    DesignOption: new Schema(
      {
        code: { type: String, maxlength: 50 },
        importKey: { type: String, maxlength: 180 },
        importDigest: String,
        usedCount: { type: Number, default: 0, min: 0 },
        referenceFence: { type: Number, default: 0 },
        sourceCrops: { type: [Schema.Types.Mixed], default: undefined },
        name: { type: String, required: true },
        nameHi: text(80),
        kind: {
          type: String,
          enum: OPTION_KINDS,
          required: true,
        },
        garments: [{ type: String, enum: GARMENTS }],
        description: text(1000),
        descriptionHi: text(1000),
        imageMediaId: { type: oid, ref: "MediaAsset", default: null },
        imageMediaIds: [{ type: oid, ref: "MediaAsset" }],
        imageAlt: text(250),
        imageAltHi: text(250),
        displayOrder: { type: Number, min: -10000, max: 10000, default: 0 },
        status: { type: String, enum: ["draft", "published", "archived"] },
        lengthStyle: { type: String, enum: SLEEVE_LENGTH_STYLES },
        compatibleLengthStyles: [{ type: String, enum: SLEEVE_LENGTH_STYLES }],
        incompatibleOptionIds: [{ type: oid, ref: "DesignOption" }],
        sleevePricingMode: { type: String, enum: ["separate", "combined"], default: "separate" },
        combinedLengthPrices: { type: [new Schema({ lengthStyle: { type: String, enum: SLEEVE_LENGTH_STYLES, required: true }, amountPaise: { type: Number, required: true, min: 0, max: 100000000 } }, { _id: false, strict: "throw" })], default: [] },
        materialCoverage: { type: String, enum: ["labor_only", "labor_and_materials", "review"], default: "labor_only" },
        materialNotes: text(1000),
        serviceType: { type: String, enum: ["stitching", "embroidery", "painting", "knitting", "other"], default: "stitching" },
        priceMode: {
          type: String,
          enum: ["included", "additional", "replacement", "pending"],
          default: "pending",
        },
        amountPaise: { type: Number, min: 0, max: 100000000 },
        replacementAdjustmentPaise: { type: Number, min: 0, max: 100000000 },
        measurementFields: [{ type: String }],
        sleeveStyle: {
          type: String,
          enum: [
            "sleeveless",
            "short",
            "elbow",
            "three_quarter",
            "full",
            "other",
          ],
          default: "other",
        },
        active: { type: Boolean, default: true },
        revision,
      },
      opts,
    ),
    MediaAsset: new Schema(
      {
        owner: { type: oid, ref: "User", required: true, index: true },
        fileId: { type: String, required: true, unique: true },
        storage: {
          type: String,
          enum: ["imagekit", "bundled"],
          default: "imagekit",
        },
        filePath: { type: String, required: true },
        purpose: {
          type: String,
          enum: ["reference", "measurement", "catalogue", "banner"],
          required: true,
        },
        private: { type: Boolean, required: true },
        mime: { type: String, required: true },
        bytes: { type: Number, required: true },
        width: Number,
        height: Number,
        references: { type: Number, default: 0, min: 0 },
        deletingAt: Date,
      },
      opts,
    ),
    Design: new Schema(
      {
        title: { type: String, required: true },
        titleHi: text(120),
        descriptionHi: text(4000),
        searchLabels: { type: [String], default: undefined },
        searchLabelsHi: { type: [String], default: undefined },
        referenceFence: { type: Number, default: 0 },
        designDetails: {
          type: new Schema(
            Object.fromEntries(
              [
                "neck",
                "neckHi",
                "sleeve",
                "sleeveHi",
                "back",
                "backHi",
                "style",
                "styleHi",
                "fabric",
                "fabricHi",
                "fabricRequirement",
                "fabricRequirementHi",
                "turnaround",
                "turnaroundHi",
              ].map((key) => [key, text(300)]),
            ),
            { _id: false, strict: "throw" },
          ),
          default: undefined,
        },
        defaultComponents: { type: Schema.Types.Mixed, default: undefined },
        includedAddonIds: [{ type: oid, ref: "DesignOption" }],
        serviceNotes: text(1500),
        serviceNotesHi: text(1500),
        priceOptions: {
          type: [
            new Schema(
              {
                label: { type: String, required: true, maxlength: 100 },
                labelHi: text(100),
                amountPaise: {
                  type: Number,
                  required: true,
                  min: 0,
                  max: 100000000,
                },
                isStartingPrice: { type: Boolean, default: false },
              },
              { _id: false, strict: "throw" },
            ),
          ],
          default: undefined,
        },
        imageViews: {
          type: [
            new Schema(
              {
                mediaId: { type: oid, ref: "MediaAsset", required: true },
                label: { type: String, required: true, maxlength: 80 },
                labelHi: text(80),
                crop: {
                  type: new Schema(
                    { x: Number, y: Number, width: Number, height: Number },
                    { _id: false, strict: "throw" },
                  ),
                  default: undefined,
                },
              },
              { _id: false, strict: "throw" },
            ),
          ],
          default: undefined,
        },
        code: { type: String, required: true, unique: true },
        slug: { type: String, required: true, unique: true },
        garment: { type: String, enum: GARMENTS, required: true },
        description: { type: String, required: true },
        category: { type: oid, ref: "Category", default: null, index: true },
        startingPricePaise: { type: Number, required: true, min: 0 },
        currency: { type: String, enum: ["INR"], default: "INR" },
        mediaIds: [{ type: oid, ref: "MediaAsset" }],
        coverMediaId: { type: oid, ref: "MediaAsset", default: null },
        status: {
          type: String,
          enum: ["draft", "published", "archived"],
          default: "draft",
          index: true,
        },
        usedCount: { type: Number, default: 0, min: 0 },
        revision,
      },
      opts,
    ),
    Order: new Schema(
      {
        orderNumber: { type: String, required: true, unique: true },
        owner: { type: oid, ref: "User", required: true, index: true },
        idempotencyKey: { type: String, required: true },
        requestHash: { type: String, required: true },
        garment: { type: String, enum: GARMENTS, required: true },
        quantity: { type: Number, required: true },
        designId: { type: oid, ref: "Design" },
        designSnapshot: Schema.Types.Mixed,
        preferences: Schema.Types.Mixed,
        configuration: Schema.Types.Mixed,
        logistics: Schema.Types.Mixed,
        fulfilment: Schema.Types.Mixed,
        estimate: Schema.Types.Mixed,
        policyVersion: String,
        draftId: { type: oid, ref: "Draft" },
        preferenceLabelsHi: Schema.Types.Mixed,
        measurements: Schema.Types.Mixed,
        guideSnapshots: { type: [Schema.Types.Mixed], default: undefined },
        publicMediaPins: Schema.Types.Mixed,
        referenceMediaIds: [{ type: oid, ref: "MediaAsset" }],
        customer: Schema.Types.Mixed,
        address: Schema.Types.Mixed,
        preferredDate: String,
        notes: text(),
        fabricDetails: text(1000),
        fabricAcknowledged: { type: Boolean, required: true },
        status: {
          type: String,
          enum: STATUSES,
          default: "request_received",
          index: true,
        },
        revision,
        quotes: { type: [Schema.Types.Mixed], default: [] },
        acceptedQuote: Schema.Types.Mixed,
        timeline: { type: [Schema.Types.Mixed], default: [] },
        anonymizedAt: Date,
      },
      opts,
    ),
    SiteSettings: new Schema(
      {
        key: { type: String, required: true, unique: true },
        serviceAreas: { type: [Schema.Types.Mixed], default: undefined },
        garmentBasePrices: { type: Schema.Types.Mixed, default: undefined },
        policies: Schema.Types.Mixed,
        support: Schema.Types.Mixed,
        welcome: Schema.Types.Mixed,
        homepage: Schema.Types.Mixed,
        features: Schema.Types.Mixed,
        facebook: text(250),
        businessName: text(100),
        tagline: text(180),
        taglineHi: text(180),
        announcementHi: text(300),
        aboutHi: text(3000),
        whatsapp: text(12),
        instagram: text(250),
        contactEmail: text(254),
        announcement: text(300),
        about: text(3000),
        faqs: [
          new Schema(
            {
              question: text(200),
              answer: text(2000),
              questionHi: text(200),
              answerHi: text(2000),
            },
            { _id: false, strict: "throw" },
          ),
        ],
        bannerMediaId: { type: oid, ref: "MediaAsset", default: null },
        revision,
      },
      opts,
    ),
    AuditEvent: new Schema(
      {
        actor: { type: oid, ref: "User" },
        action: { type: String, required: true },
        resourceType: { type: String, required: true },
        resourceId: String,
        metadata: { type: Schema.Types.Mixed, default: {} },
        requestId: String,
      },
      opts,
    ),
    Draft: new Schema(
      {
        owner: { type: oid, ref: "User", required: true },
        clientId: { type: String, required: true },
        title: text(150),
        data: { type: Schema.Types.Mixed, required: true },
        status: {
          type: String,
          enum: ["draft", "submitted"],
          default: "draft",
        },
        orderId: { type: oid, ref: "Order" },
        revision,
      },
      { ...opts, minimize: false },
    ),
  };
  Object.assign(
    schemas,
    createExtensionSchemas({ Schema, oid, opts, revision, text }),
    createCommerceSchemas({ Schema, oid, opts, revision, text }),
  );
  schemas.Draft.index({ owner: 1, clientId: 1 }, { unique: true });
  schemas.RequestLimit.index({key:1,bucket:1},{unique:true,name:"request_limit_bucket_unique"});
  schemas.RequestLimit.index({expiresAt:1},{expireAfterSeconds:0});
  schemas.Draft.index({ owner: 1, status: 1, updatedAt: -1 });
  schemas.User.index(
    { email: 1 },
    {
      name: "email_credential_unique",
      unique: true,
      partialFilterExpression: { passwordHash: { $type: "string" } },
    },
  );
  schemas.User.index(
    { emailReservation: 1 },
    {
      unique: true,
      partialFilterExpression: { emailReservation: { $type: "string" } },
    },
  );
  // Existing legacy deletion tombstones may still expire during migration.
  schemas.User.index({ purgeAfter: 1 }, { expireAfterSeconds: 0 });
  schemas.Order.index({ owner: 1, idempotencyKey: 1 }, { unique: true });
  schemas.Order.index({ owner: 1, createdAt: -1, _id: -1 });
  schemas.Order.index({ status: 1, createdAt: -1, _id: -1 });
  schemas.Design.index({ status: 1, garment: 1, createdAt: -1, _id: -1 });
  schemas.MediaAsset.index({ references: 1, createdAt: 1 });
  schemas.DesignOption.index({ code: 1 }, { unique: true, partialFilterExpression: { code: { $type: "string" } } });
  schemas.MeasurementGuide.index({ status: 1, garment: 1, method: 1, language: 1, displayOrder: 1 });
  schemas.AuditEvent.index({ createdAt: -1, _id: -1 });
  schemas.AuditEvent.index({ resourceType: 1, resourceId: 1, createdAt: -1 });
  return Object.fromEntries(
    Object.entries(schemas).map(([name, schema]) => [
      name,
      connection.models[name] || connection.model(name, schema),
    ]),
  );
}
export const models = createModels();
export async function transaction(work, connection = mongoose.connection) {
  const session = await connection.startSession();
  let result;
  try {
    await session.withTransaction(
      async () => {
        result = await work(session);
      },
      {
        readConcern: { level: "snapshot" },
        writeConcern: { w: "majority" },
        maxCommitTimeMS: 10000,
      },
    );
    return result;
  } finally {
    await session.endSession();
  }
}
