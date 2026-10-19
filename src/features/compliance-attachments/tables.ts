/**
 * The four tables of the attachments, as the historical collector's Compliance
 * menu had them (`comp_modulesets_nodes` and the like): nodes or services, with
 * the modulesets or the rulesets attached to them.
 */
export const TABLE_KEYS = [
  "modulesets_nodes",
  "rulesets_nodes",
  "modulesets_services",
  "rulesets_services",
] as const;
export type TableKey = (typeof TABLE_KEYS)[number];

export interface TableDef {
  key: TableKey;
  target: "node" | "service";
  object: "moduleset" | "ruleset";
  /** The props of the target's id and name, and of the object's. */
  targetIdProp: "node_id" | "svc_id";
  targetNameProp: "nodename" | "svcname";
  objectIdProp: "modset_id" | "ruleset_id";
  objectNameProp: "modset_name" | "ruleset_name";
}

export const TABLES: Record<TableKey, TableDef> = {
  modulesets_nodes: {
    key: "modulesets_nodes",
    target: "node",
    object: "moduleset",
    targetIdProp: "node_id",
    targetNameProp: "nodename",
    objectIdProp: "modset_id",
    objectNameProp: "modset_name",
  },
  rulesets_nodes: {
    key: "rulesets_nodes",
    target: "node",
    object: "ruleset",
    targetIdProp: "node_id",
    targetNameProp: "nodename",
    objectIdProp: "ruleset_id",
    objectNameProp: "ruleset_name",
  },
  modulesets_services: {
    key: "modulesets_services",
    target: "service",
    object: "moduleset",
    targetIdProp: "svc_id",
    targetNameProp: "svcname",
    objectIdProp: "modset_id",
    objectNameProp: "modset_name",
  },
  rulesets_services: {
    key: "rulesets_services",
    target: "service",
    object: "ruleset",
    targetIdProp: "svc_id",
    targetNameProp: "svcname",
    objectIdProp: "ruleset_id",
    objectNameProp: "ruleset_name",
  },
};

export function toTableKey(value: unknown): TableKey {
  return TABLE_KEYS.find((key) => key === value) ?? "modulesets_nodes";
}

/** A value of a row, as the API returns them. */
export type CellValue = string | number | boolean | null | undefined;

/**
 * A row of a table: a node or a service and an object attached to it, none on the
 * row of a target that has none; `slave` for the encapsulated part of a service.
 */
export interface AttachmentRow {
  targetId: string;
  targetName: string;
  objectId: string | undefined;
  objectName: string | undefined;
  slave: boolean;
  values: Readonly<Record<string, CellValue>>;
}

export function toAttachmentRow(table: TableDef, values: Record<string, CellValue>): AttachmentRow {
  const text = (value: CellValue) =>
    value === null || value === undefined || value === "" ? undefined : String(value);
  return {
    targetId: text(values[table.targetIdProp]) ?? "",
    targetName: text(values[table.targetNameProp]) ?? text(values[table.targetIdProp]) ?? "",
    objectId: text(values[table.objectIdProp]),
    objectName: text(values[table.objectNameProp]),
    slave: values.slave === "T",
    values,
  };
}

/** One row per target, object and part: the id of the selection. */
export function attachmentRowId(row: AttachmentRow): string {
  return `${row.targetId}|${row.objectId ?? ""}|${row.slave ? "T" : ""}`;
}

/** "node · moduleset", or the node alone when it has none: names a row in the reports. */
export function attachmentRowName(row: AttachmentRow): string {
  return row.objectName === undefined ? row.targetName : `${row.targetName} · ${row.objectName}`;
}

/** The columns shown by default, those of the historical tables plus the app. */
export function defaultColumns(table: TableDef): string[] {
  return table.target === "node"
    ? [table.targetNameProp, table.objectNameProp, "app", "node_env"]
    : [table.targetNameProp, "slave", table.objectNameProp, "svc_app"];
}

/** The props a page asks for: those shown, plus the ids naming a row. */
export function queryProps(table: TableDef, shown: readonly string[]): string {
  const ids: string[] = [
    table.targetIdProp,
    table.targetNameProp,
    table.objectIdProp,
    table.objectNameProp,
  ];
  if (table.target === "service") ids.push("slave");
  return [...new Set([...ids, ...shown])].join(",");
}
