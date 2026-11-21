import { readFile } from "node:fs/promises";
let datasetPromise;
export function loadPostalCentroids() {
  datasetPromise ||= readFile(new URL("../data/india-postal-centroids.json", import.meta.url), "utf8").then(JSON.parse).catch(error => { datasetPromise = undefined; throw error; });
  return datasetPromise;
}
export function geographicDistanceMeters(from, to) {
  if (![from, to].every(point => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite))) return null;
  const rad = value => value * Math.PI / 180;
  const [a, b] = from.map(rad), [c, d] = to.map(rad);
  const h = Math.min(1, Math.max(0, Math.sin((c-a)/2)**2 + Math.cos(a)*Math.cos(c)*Math.sin((d-b)/2)**2));
  return Math.round(6371008.8 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1-h)));
}
export async function resolveTransportDistances(input, settings, { dataset } = {}) {
  const config = settings?.deliveryPricing;
  if (config?.mode !== "distance" || config.distanceBasis && config.distanceBasis !== "pin_area" || !/^[1-9]\d{5}$/.test(config?.originPin || "")) return {};
  const result = {};
  try {
    const data = dataset || await loadPostalCentroids();
    const origin = data.centroids[config.originPin];
    if (!origin) return result;
    for (const direction of ["inbound", "outbound"]) {
      const leg = input.logistics?.[direction], pin = leg?.address?.pin;
      if (leg?.method !== "business" || !/^[1-9]\d{5}$/.test(pin || "") || !data.centroids[pin]) continue;
      const distanceMeters = geographicDistanceMeters(origin, data.centroids[pin]);
      if (distanceMeters === null) continue;
      result[direction] = { distanceMeters, basis: "pin_area", originPin: config.originPin, destinationPin: pin, source: data.source || "GeoNames", sourceVersion: data.sourceVersion };
    }
  } catch { /* An unavailable lookup keeps transport pending. */ }
  return result;
}
