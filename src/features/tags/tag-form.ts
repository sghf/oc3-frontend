/**
 * Form-based tags, as the historical collector names them: `<form>::<name>`. The
 * data of such a tag, and of each of its attachments, is described by the form
 * named before the `::`; any other tag holds free data.
 */
export function tagFormName(tagName: string): string | null {
  const at = tagName.indexOf("::");
  if (at <= 0) return null;
  return tagName.slice(0, at);
}

/** Parses stored tag data: JSON most of the time, kept as text otherwise. */
export function parseTagData(value: string): unknown {
  if (value === "") return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

/**
 * The text stored for the data a form submits, as the historical collector writes
 * it (`submit_output_tag_data`): a string as it is, anything else as JSON, the
 * empty text fields of a dictionary left out.
 */
export function tagDataText(data: unknown): string {
  if (typeof data === "string") return data;
  if (data !== null && typeof data === "object" && !Array.isArray(data)) {
    const kept = Object.fromEntries(
      Object.entries(data as Record<string, unknown>).filter(([, v]) => v !== ""),
    );
    return JSON.stringify(kept);
  }
  return JSON.stringify(data);
}
