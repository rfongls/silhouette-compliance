export function noEmDash(value: string) {
  return value
    .replace(/\u2014/g, " - ")
    .replace(/\u2013/g, " - ")
    .replace(/\u2012/g, " - ")
    .replace(/\u2015/g, " - ")
    .replace(/\u2011/g, "-")
    .replace(/\uFEFF/g, "");
}

export function sanitizeForExport<T>(value: T): T {
  if (typeof value === "string") return noEmDash(value) as T;
  if (Array.isArray(value)) return value.map(sanitizeForExport) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, sanitizeForExport(v)])) as T;
  }
  return value;
}

export function slugify(value: string) {
  return noEmDash(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "silhouette";
}
