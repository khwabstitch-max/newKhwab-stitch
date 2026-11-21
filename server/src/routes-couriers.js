import { z } from "zod";
import { parcelInput } from "./workflow-input.js";
import { audit } from "./route-utils.js";
import { fail } from "./errors.js";
import { courierConnectionStatus, courierAccountQuote, encryptCourierCredentials, prepareCourierConnections } from "./courier-accounts.js";
import { normalizeCourierCredentials } from "./courier-providers.js";
const providerInput = z.enum(["shiprocket", "delhivery", "bluedart"]);
const testInput = z.object({ originPin: z.string().regex(/^[1-9]\d{5}$/), destinationPin: z.string().regex(/^[1-9]\d{5}$/), direction: z.enum(["inbound","outbound"]).default("outbound"), parcel: parcelInput }).strict();
export function courierRoutes(app, ctx, auth, admin) {
  const base = "/api/admin/courier-connections";
  app.get(base, auth, admin, async (_req,res) => res.set("Cache-Control","private, no-store").json({ data: await courierConnectionStatus(ctx) }));
  app.put(base + "/:provider", auth, admin, async (req,res) => {
    const provider = providerInput.parse(req.params.provider);
    if (provider === "bluedart") fail(409,"COURIER_CONTRACT_REQUIRED","Direct Blue Dart account pricing requires its official rate API contract. Blue Dart may be available through Shiprocket.");
    const body = z.object({ credentials: z.record(z.string(), z.unknown()) }).strict().parse(req.body);
    let credentials;
    try { credentials = normalizeCourierCredentials(provider, body.credentials); }
    catch { fail(400,"INVALID_COURIER_CREDENTIALS","Check the required courier account credentials."); }
    let encryptedCredentials;
    try { encryptedCredentials = encryptCourierCredentials(ctx.config, provider, credentials); }
    catch { fail(503,"COURIER_STORAGE_UNAVAILABLE","Courier credential storage is not configured on the server."); }
    await prepareCourierConnections(ctx.models.CourierConnection);
    await ctx.models.CourierConnection.findOneAndUpdate({ provider }, { $set: { encryptedCredentials, updatedBy: req.user._id, lastVerifiedAt: null, lastCheckedAt: null, lastErrorCode: null } }, { upsert:true,runValidators:true,returnDocument:"after" });
    await audit(ctx, req, "courier.connection.saved", "CourierConnection", provider, null, { provider });
    const status = await courierConnectionStatus(ctx);
    res.json({ data: status.providers.find(item => item.provider === provider) });
  });
  app.delete(base + "/:provider", auth, admin, async (req,res) => {
    const provider = providerInput.parse(req.params.provider);
    await ctx.models.CourierConnection.deleteOne({ provider });
    await audit(ctx, req, "courier.connection.removed", "CourierConnection", provider, null, { provider });
    res.json({ data: { provider, configured:false, verified:false } });
  });
  app.post(base + "/:provider/test", auth, admin, async (req,res) => {
    const provider = providerInput.parse(req.params.provider), body = testInput.parse(req.body);
    const quote = await courierAccountQuote(ctx, { provider, ...body });
    if (quote.available !== true) fail(422,"COURIER_QUOTE_UNAVAILABLE","A live courier estimate is unavailable. Check the account, PIN codes and package details.", [{ path:"courier",message:quote.reasonCode || "provider_unavailable" }]);
    res.set("Cache-Control","private, no-store").json({ data: { quote } });
  });
}
