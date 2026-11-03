export const money = (n: number, currency: string) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(n);

export const monthLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
