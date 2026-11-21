import dns from "node:dns/promises";
import { isIP } from "node:net";
const initializedResolvers = new WeakMap();

export function mongoDnsServers(value = "") {
  if (typeof value !== "string") throw Error("Use a comma-separated list of DNS server IP addresses.");
  const servers = value.trim() ? value.trim().split(/[\s,]+/) : [];
  if (servers.length > 4 || servers.some(server => !isIP(server))) throw Error("Use up to four DNS server IP addresses.");
  return [...new Set(servers)];
}
function isSrvUri(uri) { return typeof uri === "string" && uri.startsWith("mongodb+srv://"); }
export function configureMongoDns(config, { resolver = dns, platform = process.platform, logger } = {}) {
  const explicit = mongoDnsServers(config.MONGODB_DNS_SERVERS);
  if (!isSrvUri(config.MONGODB_URI)) return;
  const configuration = explicit.length ? "explicit:" + explicit.join(",") : platform === "win32" ? "windows-system" : null;
  if (!configuration || initializedResolvers.get(resolver) === configuration) return;
  if (explicit.length) {
    resolver.setServers(explicit);
    logger?.info({ event: "mongodb_dns_configured", source: "explicit", serverCount: explicit.length }, "Using configured DNS servers for this Node process.");
  } else if (platform === "win32") {
    // Reinitialize Node's c-ares resolver from the current adapter settings.
    // Windows can otherwise retain stale DNS state across network changes.
    // Preserve system/private DNS; public resolvers are always an explicit opt-in.
    const current = resolver.getServers();
    if (current.length) resolver.setServers(current);
  }
  initializedResolvers.set(resolver, configuration);
}
export function isTransientMongoDnsError(error) {
  const codes = new Set(["ECONNREFUSED", "ETIMEOUT", "ESERVFAIL", "ECONNRESET", "EAI_AGAIN"]);
  for (let cause = error, depth = 0; cause && depth < 4; cause = cause.cause, depth++) {
    if (["querySrv", "queryTxt"].includes(cause.syscall) && codes.has(cause.code)) return true;
  }
  return false;
}
export async function connectDatabase(mongoose, config, options, {
  resolver = dns, platform = process.platform, logger,
  delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
} = {}) {
  configureMongoDns(config, { resolver, platform, logger });
  for (let attempt = 1; ; attempt++) {
    try { return await mongoose.connect(config.MONGODB_URI, options); }
    catch (error) {
      if (!isSrvUri(config.MONGODB_URI) || !isTransientMongoDnsError(error) || attempt >= 3) throw error;
      // Log metadata only: provider error messages and connection strings may contain secrets.
      logger?.warn({ event: "mongodb_dns_retry", attempt }, "Temporary MongoDB DNS failure; retrying the connection.");
      await delay(attempt === 1 ? 250 : 750);
      // Do not reset DNS while the driver may still have a concurrent TXT lookup in flight.
    }
  }
}
