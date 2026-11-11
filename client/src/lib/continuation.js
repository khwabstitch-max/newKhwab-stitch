const permitted =
  /^\/(?:request|account(?:\/(?:orders|tracking|drafts|measurements|profile|support|reviews|work|security))?|orders(?:\/[a-f\d]{24})?|profile|worker|admin(?:\/(?:orders(?:\/[a-f\d]{24})?|designs|categories|options|media|customers|settings|audit|support|reviews|work|services))?)(?:\?|$)/i;
const unsafeCharacters = (value) =>
  [...value].some((c) => c.charCodeAt(0) <= 32 || c === "\\" || c === "#");

// Return routes contain identifiers and navigation state only, never form payloads.
export function safeReturnTo(value, fallback = "/account") {
  if (
    typeof value !== "string" ||
    value.length > 600 ||
    unsafeCharacters(value)
  )
    return fallback;
  if (!permitted.test(value) || value.startsWith("//")) return fallback;
  try {
    const url = new URL(value, "https://khwab.invalid");
    if (url.origin !== "https://khwab.invalid") return fallback;
    const allowed = new Set([
      "draft",
      "step",
      "edit",
      "order",
      "ticket",
      "application",
      "job",
      "garment",
      "design",
      "help",
      "assistance",
      "page",
    ]);
    for (const [key, item] of url.searchParams) {
      if (!allowed.has(key) || item.length > 100 || unsafeCharacters(item))
        return fallback;
    }
    return url.pathname + url.search;
  } catch {
    return fallback;
  }
}
