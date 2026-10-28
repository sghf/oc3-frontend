/** The share of a quota in use from which it is flagged, before it is full. */
export const QUOTA_WARN_RATIO = 0.8;

/** The units a quota is typed in, in MiB, the unit of the collector. */
export const UNITS = { GiB: 1024, TiB: 1024 * 1024 } as const;
export type Unit = keyof typeof UNITS;

/** A size typed in GiB or TiB, as `SizeInput` holds it before it becomes MiB. */
export interface SizeValue {
  amount: string;
  unit: Unit;
}

/** The size typed as MiB, the unit of the collector; undefined when not a size. */
export function sizeMiB(value: SizeValue): number | undefined {
  const n = Number(value.amount.replace(",", "."));
  if (value.amount.trim() === "" || !Number.isFinite(n) || n < 0) return undefined;
  return Math.round(n * UNITS[value.unit]);
}

/** A size in MiB as a value of `SizeInput`: in TiB when it makes a whole number of them. */
export function toSizeValue(mib: number | undefined): SizeValue {
  if (mib === undefined || mib <= 0) return { amount: "", unit: "TiB" };
  if (mib % UNITS.TiB === 0) return { amount: String(mib / UNITS.TiB), unit: "TiB" };
  return { amount: String(Math.round((mib / UNITS.GiB) * 100) / 100), unit: "GiB" };
}
