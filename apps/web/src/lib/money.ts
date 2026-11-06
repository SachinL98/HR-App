export const money = (n: number, currency: string) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(n);

export const monthLabel = (iso: string, tag = "en-GB") =>
  new Date(iso).toLocaleDateString(tag, { month: "long", year: "numeric", timeZone: "UTC" });
