import { readProp } from "@/lib/row";

/**
 * Shape of a tag row.
 *
 * A deliberate departure from the "fix the spec on the oc3 side rather than work
 * around it on the frontend" rule: `GET /tags` returns the generic `ListResponse`,
 * whose rows are typed `Record<string, never>`, and it was asked that the API be left
 * alone. The type is therefore described here, in a single place, with a defensive
 * read rather than a blind cast. To be removed the day the spec types the response.
 */
export interface TagRow {
  tag_id: string;
  tag_name: string;
  tag_exclude: string;
  /** Free data attached to the tag; the API returns it already decoded. */
  tag_data: string;
  tag_created: string;
  /**
   * The data of one attachment, in the tags of a node or a service; empty
   * elsewhere, and for an attachment without data.
   */
  tag_attach_data: string;
}

function asText(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function toTagRows(data: unknown): TagRow[] {
  if (!Array.isArray(data)) return [];
  return data.map((row) => ({
    tag_id: asText(readProp(row, "tag_id")),
    tag_name: asText(readProp(row, "tag_name")),
    tag_exclude: asText(readProp(row, "tag_exclude")),
    tag_data: asText(readProp(row, "tag_data")),
    tag_created: asText(readProp(row, "tag_created")),
    tag_attach_data: asText(readProp(row, "tag_attach_data")),
  }));
}
