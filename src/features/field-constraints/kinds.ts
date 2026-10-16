import type { components } from "@/lib/api/schema";

type FieldConstraintKind = components["schemas"]["FieldConstraintObjectKind"];

/** The kinds of object whose attributes may be constrained, in display order. */
export const KINDS: FieldConstraintKind[] = ["node", "service", "app"];

/**
 * Per kind, the name of its view, the i18n prefix of its attribute labels (the one
 * of its detail panel) and its table in the collector database.
 */
export const KIND_INFO: Record<
  FieldConstraintKind,
  { labelKey: string; fieldPrefix: string; table: string }
> = {
  node: { labelKey: "nav.nodes", fieldPrefix: "nodes.fields", table: "nodes" },
  service: { labelKey: "nav.services", fieldPrefix: "services.fields", table: "services" },
  app: { labelKey: "nav.apps", fieldPrefix: "apps.fields", table: "apps" },
};

export function isKind(value: string | undefined): value is FieldConstraintKind {
  return value === "node" || value === "service" || value === "app";
}
