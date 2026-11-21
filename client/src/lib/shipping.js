export function requestParcel(value) {
  if (!value || typeof value !== "object") return undefined;
  const keys = ["weightGrams","lengthCm","widthCm","heightCm"], parcel = {};
  for (const key of keys) {
    const raw = value[key];
    if (raw === "" || raw === undefined || raw === null) return undefined;
    const number = Number(raw);
    if (!Number.isFinite(number) || number <= 0 || number > (key === "weightGrams" ? 30000 : 200) || key === "weightGrams" && !Number.isInteger(number)) return undefined;
    parcel[key] = number;
  }
  if (value.declaredValuePaise !== undefined && value.declaredValuePaise !== "") {
    const amount = Number(value.declaredValuePaise);
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 100000000) return undefined;
    parcel.declaredValuePaise = amount;
  }
  return parcel;
}
export function requestLogistics(value = {}) {
  return Object.fromEntries(["inbound","outbound"].map(direction => {
    const leg = value[direction] || {}, business = leg.method === "business", parcel = business ? requestParcel(leg.parcel) : undefined;
    return [direction, { method: leg.method, ...(leg.address ? { address: leg.address } : {}), ...(parcel ? { parcel } : {}) }];
  }));
}
