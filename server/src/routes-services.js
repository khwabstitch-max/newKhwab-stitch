import { z } from "zod";
import { GARMENTS, revisionSchema } from "./domain.js";
import { fail } from "./errors.js";
import { pageQuery, pageResult } from "./route-utils.js";
import { assertAdmin, revised } from "./extension-utils.js";

const token = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9_]{0,49}$/);
const namedField = z
  .object({
    key: token,
    label: z.string().trim().min(2).max(100),
    required: z.boolean().default(false),
    instructions: z.string().trim().max(500).default(""),
  })
  .strict();
const stage = z
  .object({ key: token, label: z.string().trim().min(2).max(100) })
  .strict();
export const serviceInput = z
  .object({
    code: token,
    name: z.string().trim().min(2).max(120),
    serviceType: z.enum([
      "stitching",
      "alteration",
      "embroidery",
      "painting",
      "knitting",
      "other",
    ]),
    active: z.boolean().default(false),
    audiences: z.array(z.string().trim().min(2).max(50)).min(1).max(20),
    itemTypes: z.array(token).min(1).max(30),
    componentKinds: z.array(token).max(20).default([]),
    measurementFields: z.array(namedField).max(40).default([]),
    workflowStages: z.array(stage).max(30).default([]),
    workerSkills: z.array(z.string().trim().min(2).max(80)).max(30).default([]),
    materials: z.enum(["customer", "business", "review"]).default("review"),
    materialInstructions: z.string().trim().max(1000).default(""),
    basePricePaise: z.number().int().min(0).max(100000000).optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.active && (!supportedService(v) || v.materials !== "customer"))
      ctx.addIssue({
        code: "custom",
        path: ["active"],
        message:
          "Activation requires a tested service adapter. Current ordering supports customer-fabric stitching and alterations for the existing garment categories.",
      });
    for (const key of ["measurementFields", "workflowStages"])
      if (new Set(v[key].map((item) => item.key)).size !== v[key].length)
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: "Template keys must be unique.",
        });
  });
export function supportedService(service) {
  return (
    ["stitching", "alteration"].includes(service.serviceType) &&
    service.itemTypes?.every((item) => GARMENTS.includes(item))
  );
}
export const builtinServices = [
  {
    code: "stitching",
    name: "Ladies’ custom stitching",
    serviceType: "stitching",
    active: true,
    audiences: ["women"],
    itemTypes: ["kurti", "suit", "blouse"],
    componentKinds: ["neck", "sleeve", "back", "fit", "extra"],
    materials: "customer",
    materialInstructions:
      "Custom stitching on your fabric. Final quote after review.",
    revision: 0,
  },
  {
    code: "alteration",
    name: "Garment alterations",
    serviceType: "alteration",
    active: true,
    audiences: ["women"],
    itemTypes: ["alteration"],
    componentKinds: [],
    materials: "customer",
    materialInstructions:
      "Bring your existing garment. Feasibility and charges require review.",
    revision: 0,
  },
];
export async function assertOrderServiceEnabled(ctx, garment, session) {
  const records = await ctx.models.ServiceDefinition.find({
    $or: [
      { code: { $in: ["stitching", "alteration"] } },
      { itemTypes: garment },
    ],
  })
    .session(session || null)
    .limit(200)
    .lean();
  const byCode = new Map(
    builtinServices.map((service) => [service.code, service]),
  );
  for (const record of records) byCode.set(record.code, record);
  if (
    ![...byCode.values()].some(
      (service) =>
        service.active &&
        supportedService(service) &&
        service.itemTypes.includes(garment),
    )
  )
    fail(
      409,
      "SERVICE_UNAVAILABLE",
      "This service is currently unavailable. Your draft remains saved; contact the atelier for guidance.",
    );
}
export function serviceRoutes(app, ctx, auth) {
  const { models } = ctx;
  app.get("/api/services", async (req, res) => {
    const q = pageQuery(req.query);
    const records = await models.ServiceDefinition.find()
      .sort({ name: 1 })
      .limit(200)
      .lean();
    const byCode = new Map(
      builtinServices.map((service) => [service.code, service]),
    );
    for (const record of records) byCode.set(record.code, record);
    const available = [...byCode.values()].filter(
      (service) => service.active && supportedService(service),
    );
    res.json(
      pageResult(
        available.slice((q.page - 1) * q.limit, q.page * q.limit),
        available.length,
        q,
      ),
    );
  });
  app.get("/api/admin/services", auth, async (req, res) => {
    assertAdmin(req);
    const q = pageQuery(req.query);
    const [items, total] = await Promise.all([
      models.ServiceDefinition.find()
        .sort({ name: 1, _id: 1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit)
        .lean(),
      models.ServiceDefinition.countDocuments(),
    ]);
    res.json({
      ...pageResult(items, total, q),
      builtinDefaults: builtinServices,
      supportedAdapters: ["stitching", "alteration"],
    });
  });
  app.patch("/api/admin/services/:code", auth, async (req, res) => {
    assertAdmin(req);
    const code = token.parse(req.params.code);
    const { revision, ...body } = serviceInput
      .safeExtend({ revision: revisionSchema })
      .parse(req.body);
    if (body.code !== code)
      fail(400, "CODE_MISMATCH", "The service code cannot change.");
    const result = await ctx.transaction(async (session) => {
      let current = await models.ServiceDefinition.findOne({ code }).session(
        session,
      );
      if (!current) {
        if (revision !== 0)
          fail(409, "REVISION_CONFLICT", "Refresh this service before saving.");
        [current] = await models.ServiceDefinition.create(
          [{ ...body, active: false }],
          { session },
        );
      }
      return revised(
        ctx,
        req,
        models.ServiceDefinition,
        current,
        revision,
        body,
        "service.updated",
        session,
      );
    });
    res.json({ data: result });
  });
}
