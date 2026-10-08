/** Whether one of `fields` holds `needle`, lowercase already; an empty needle keeps all. */
export function matchesSearch(
  needle: string,
  ...fields: (string | number | null | undefined)[]
): boolean {
  if (needle === "") return true;
  return fields.some(
    (field) =>
      field !== null && field !== undefined && String(field).toLowerCase().includes(needle),
  );
}
