export function createExtensionSchemas({ Schema, oid, opts, revision, text }) {
  const owner = { type: oid, ref: "User", required: true, index: true };
  const attachmentIds = [{ type: oid, ref: "MediaAsset" }];
  const timeline = { type: [Schema.Types.Mixed], default: [] };
  const schemas = {
    MeasurementGuide: new Schema({
      referenceFence: { type: Number, default: 0 },
      importKey: String, importDigest: String,
      usedCount: { type: Number, default: 0, min: 0 },
      code: { type: String, required: true, unique: true }, name: { type: String, required: true }, nameHi: text(120),
      garment: { type: String, enum: ["kurti","suit","blouse","alteration"], required: true },
      method: { type: String, enum: ["body","garment"], required: true }, language: { type: String, enum: ["en","hi","und"], required: true },
      instructions: text(2500), instructionsHi: text(2500), measurementFields: [String],
      imageMediaIds: [{ type: oid, ref: "MediaAsset" }], status: { type: String, enum: ["draft","published","archived"], default: "draft" },
      displayOrder: { type: Number, default: 0 }, sourceCrops: [Schema.Types.Mixed], revision,
    }, opts),
    PasswordAction: new Schema(
      {
        owner,
        tokenHash: { type: String, required: true, unique: true },
        kind: { type: String, enum: ["reset", "verify"], required: true },
        expiresAt: { type: Date, required: true },
        usedAt: Date,
      },
      opts,
    ),
    AccountIdentity: new Schema(
      {
        owner: { ...owner, unique: true },
        emailVerifiedAt: Date,
        googleSubject: { type: String, select: false },
        googleEmail: {
          type: String,
          trim: true,
          lowercase: true,
          select: false,
        },
        googleEmailVerified: Boolean,
      },
      opts,
    ),
    ServiceDefinition: new Schema(
      {
        code: { type: String, required: true, unique: true },
        name: { type: String, required: true },
        serviceType: {
          type: String,
          enum: [
            "stitching",
            "alteration",
            "embroidery",
            "painting",
            "knitting",
            "other",
          ],
          required: true,
        },
        active: { type: Boolean, default: false },
        audiences: [String],
        itemTypes: [String],
        componentKinds: [String],
        measurementFields: { type: [Schema.Types.Mixed], default: [] },
        workflowStages: { type: [Schema.Types.Mixed], default: [] },
        workerSkills: [String],
        materials: {
          type: String,
          enum: ["customer", "business", "review"],
          default: "review",
        },
        materialInstructions: text(1000),
        basePricePaise: { type: Number, min: 0 },
        revision,
      },
      opts,
    ),
    AccountPreferences: new Schema(
      {
        owner: { ...owner, unique: true },
        addresses: { type: [Schema.Types.Mixed], default: [] },
        communications: {
          type: Schema.Types.Mixed,
          default: { orderUpdates: true, marketing: false },
        },
        revision,
      },
      opts,
    ),
    MeasurementProfile: new Schema(
      {
        owner,
        name: { type: String, required: true, maxlength: 100 },
        garments: [String],
        unit: { type: String, enum: ["in", "cm"], required: true },
        method: { type: String, enum: ["body", "garment"], required: true },
        values: { type: Schema.Types.Mixed, required: true },
        notes: text(1000),
        revision,
      },
      opts,
    ),
    Conversation: new Schema(
      {
        owner,
        kind: {
          type: String,
          enum: ["support", "application", "assignment", "order"],
          required: true,
        },
        contextId: { type: oid, required: true },
        lastMessageAt: Date,
        readAt: { type: Schema.Types.Mixed, default: {} },
      },
      opts,
    ),
    Message: new Schema(
      {
        conversation: {
          type: oid,
          ref: "Conversation",
          required: true,
          index: true,
        },
        sender: owner,
        clientId: { type: String, required: true },
        text: text(4000),
        attachmentIds,
        requestHash: { type: String, required: true },
      },
      opts,
    ),
    SupportTicket: new Schema(
      {
        owner,
        ticketNumber: { type: String, required: true, unique: true },
        clientId: { type: String, required: true },
        requestHash: { type: String, required: true },
        kind: {
          type: String,
          enum: ["assistance", "complaint"],
          required: true,
        },
        category: { type: String, required: true },
        subject: text(160),
        description: text(4000),
        orderId: { type: oid, ref: "Order" },
        draftId: String,
        context: { type: Schema.Types.Mixed, default: {} },
        contextShared: { type: Boolean, default: false },
        preferredContact: { type: String, enum: ["in_app"], default: "in_app" },
        callbackAvailability: text(300),
        attachmentIds,
        status: { type: String, default: "open" },
        assignedTo: { type: oid, ref: "User", default: null },
        conversationId: { type: oid, ref: "Conversation" },
        responseDueAt: Date,
        firstHumanResponseAt: Date,
        resolution: text(2000),
        timeline,
        revision,
      },
      opts,
    ),
    SupportProposal: new Schema(
      {
        owner,
        ticketId: {
          type: oid,
          ref: "SupportTicket",
          required: true,
          index: true,
        },
        draftId: { type: oid, ref: "Draft", required: true },
        staff: { type: oid, ref: "User", required: true },
        clientId: { type: String, required: true },
        requestHash: { type: String, required: true },
        baseDraftRevision: { type: Number, required: true },
        summary: text(2000),
        pricingImpact: text(1000),
        measurementImpact: text(1000),
        changes: { type: Schema.Types.Mixed, required: true },
        beforeEstimate: Schema.Types.Mixed,
        afterEstimate: Schema.Types.Mixed,
        status: {
          type: String,
          enum: ["pending", "accepted", "declined", "superseded"],
          default: "pending",
        },
        decidedAt: Date,
        decidedBy: { type: oid, ref: "User" },
        acceptedDraftRevision: Number,
        revision,
      },
      opts,
    ),
    WorkerApplication: new Schema(
      {
        owner,
        clientId: { type: String, required: true },
        requestHash: { type: String, required: true },
        name: text(100),
        phone: text(20),
        city: text(100),
        skills: [String],
        garments: [String],
        experience: text(1000),
        availability: text(500),
        capacity: text(300),
        equipment: text(1000),
        introduction: text(2000),
        portfolioMediaIds: attachmentIds,
        termsVersion: text(80),
        status: { type: String, default: "submitted" },
        conversationId: { type: oid, ref: "Conversation" },
        internalNotes: { ...text(4000), select: false },
        reason: text(2000),
        timeline,
        revision,
      },
      opts,
    ),
    WorkerProfile: new Schema(
      {
        owner: { ...owner, unique: true },
        applicationId: { type: oid, ref: "WorkerApplication" },
        skills: [String],
        garments: [String],
        active: { type: Boolean, default: true },
        assistancePermission: { type: Boolean, default: false },
        revision,
      },
      opts,
    ),
    WorkAssignment: new Schema(
      {
        orderId: { type: oid, ref: "Order", required: true, index: true },
        createdBy: { type: oid, ref: "User" },
        idempotencyKey: String,
        requestHash: String,
        worker: { type: oid, ref: "User", required: true, index: true },
        active: { type: Boolean, default: true },
        requirements: text(3000),
        deadline: Date,
        conversationId: { type: oid, ref: "Conversation" },
        progress: { type: [Schema.Types.Mixed], default: [] },
        history: { type: [Schema.Types.Mixed], default: [] },
        revision,
      },
      opts,
    ),
    Review: new Schema(
      {
        owner,
        orderId: { type: oid, ref: "Order", required: true, unique: true },
        rating: { type: Number, min: 1, max: 5, required: true },
        text: text(2000),
        consent: { type: Boolean, required: true },
        status: {
          type: String,
          enum: ["pending", "published", "hidden", "rejected"],
          default: "pending",
        },
        moderationReason: { ...text(1000), select: false },
        revision,
      },
      opts,
    ),
    Notification: new Schema(
      {
        owner,
        kind: { type: String, required: true },
        resourceId: { type: String, required: true },
        readAt: Date,
      },
      opts,
    ),
  };
  for (const name of [
    "MeasurementProfile",
    "SupportTicket",
    "WorkerApplication",
    "Notification",
  ])
    schemas[name].index({ owner: 1, createdAt: -1, _id: -1 });
  schemas.Message.index(
    { conversation: 1, sender: 1, clientId: 1 },
    { unique: true },
  );
  schemas.PasswordAction.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  schemas.AccountIdentity.index(
    { googleSubject: 1 },
    {
      unique: true,
      partialFilterExpression: { googleSubject: { $type: "string" } },
    },
  );
  schemas.Message.index({ conversation: 1, createdAt: -1, _id: -1 });
  schemas.SupportTicket.index({ owner: 1, clientId: 1 }, { unique: true });
  schemas.SupportTicket.index({ status: 1, responseDueAt: 1 });
  schemas.SupportProposal.index(
    { ticketId: 1, staff: 1, clientId: 1 },
    { unique: true },
  );
  schemas.SupportProposal.index({ owner: 1, createdAt: -1, _id: -1 });
  schemas.WorkerApplication.index({ owner: 1, clientId: 1 }, { unique: true });
  schemas.WorkAssignment.index({ worker: 1, active: 1 });
  schemas.WorkAssignment.index(
    { createdBy: 1, idempotencyKey: 1 },
    {
      unique: true,
      partialFilterExpression: { idempotencyKey: { $type: "string" } },
    },
  );
  schemas.Conversation.index({ owner: 1, lastMessageAt: -1 });
  schemas.Review.index({ status: 1, createdAt: -1, _id: -1 });
  return schemas;
}
