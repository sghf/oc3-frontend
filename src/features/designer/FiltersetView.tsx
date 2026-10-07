import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { components } from "@/lib/api/schema";
import { ObjectIcon } from "@/components/opensvc/ObjectIcon";
import { useFiltersetEntries, useFiltersetMatches } from "@/features/filtersets/filterset-api";
import { useDesigner } from "./designer-context";
import { useDraggable } from "./drag";
import { ObjectLink, Section } from "./parts";
import { useDesignerFiltersets } from "./use-designer-data";

type FiltersetExportEntry = components["schemas"]["FiltersetExportEntry"];

/**
 * A filterset as the designer shows it, read only: what it selects and which
 * rulesets of the draft it makes contextual. Its content is edited in the
 * Filtersets view; here it is dragged onto rulesets.
 */
export function FiltersetView({ id }: { id: number }) {
  const { t } = useTranslation();
  const designer = useDesigner();
  const filtersets = useDesignerFiltersets();
  const entries = useFiltersetEntries(String(id));
  const matches = useFiltersetMatches(String(id));
  const filterset = filtersets.data?.find((f) => f.id === id);
  const drag = useDraggable(
    { type: "filterset", id, name: filterset?.name ?? "" },
    filterset?.name ?? "",
  );
  if (filtersets.isPending) return <p className="text-ink-muted">{t("designer.loading")}</p>;
  if (filterset === undefined)
    return <p className="text-state-warn">▲ {t("designer.welcome.missing")}</p>;
  const users = Object.values(designer.draft.rulesets)
    .filter((r) => r.filterset === filterset.name)
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="space-y-3">
      <header className="flex flex-wrap items-center gap-2">
        <span
          {...drag}
          title={t("designer.filtersetDragHint")}
          className="flex cursor-grab items-center gap-2"
        >
          <ObjectIcon kind="filterset" className="h-5 w-5" />
          <h2 className="text-title font-semibold">{filterset.name}</h2>
        </span>
        <span className="text-ink-muted">{t("designer.kind.filterset")}</span>
        <Link
          to="/filtersets"
          search={{ sel: String(id) }}
          className="ml-auto underline decoration-line underline-offset-2"
        >
          {t("designer.editInFiltersets")}
        </Link>
      </header>
      <p className="text-ink-muted">{t("designer.filtersetReadOnly")}</p>
      <Section title={t("designer.filtersetEntries")} count={entries.data?.length}>
        {entries.isPending && <p className="text-ink-muted">{t("designer.loading")}</p>}
        {entries.isError && <p className="text-state-down">■ {entries.error.message}</p>}
        {entries.data !== undefined && entries.data.length === 0 && (
          <p className="text-ink-muted">{t("designer.none")}</p>
        )}
        <ol className="space-y-1">
          {entries.data?.map((entry, i) => (
            <li
              key={`${String(entry.f_order)}:${entryText(entry)}`}
              className="flex flex-wrap items-center gap-2"
            >
              {i > 0 && (
                <span className="w-16 shrink-0 font-mono text-ink-muted">{entry.f_log_op}</span>
              )}
              {i === 0 && entry.f_log_op.includes("NOT") && (
                <span className="w-16 shrink-0 font-mono text-ink-muted">NOT</span>
              )}
              {entry.filter !== null && entry.filter !== undefined ? (
                <code className="font-mono">{entryText(entry)}</code>
              ) : (
                <span className="inline-flex items-center gap-1">
                  <ObjectIcon kind="filterset" className="h-3.5 w-3.5" />
                  {entry.filterset}
                </span>
              )}
            </li>
          ))}
        </ol>
      </Section>
      <Section title={t("designer.filtersetSelects")}>
        {matches.isPending && <p className="text-ink-muted">{t("designer.loading")}</p>}
        {matches.isError && <p className="text-state-down">■ {matches.error.message}</p>}
        {matches.data !== undefined && (
          <p className="flex flex-wrap gap-x-4 gap-y-1">
            <span>{t("filtersets.matches.nodes", { count: matches.data.nodes })}</span>
            <span>{t("filtersets.matches.services", { count: matches.data.services })}</span>
          </p>
        )}
      </Section>
      <Section
        title={t("designer.filtersetUsedBy")}
        count={users.length}
        hint={t("designer.filtersetDragHint")}
      >
        {users.length === 0 ? (
          <p className="text-ink-muted">{t("designer.unused")}</p>
        ) : (
          <div className="flex flex-wrap gap-1">
            {users.map((r) => (
              <ObjectLink key={r.id} refTo={{ kind: "ruleset", id: r.id }} />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

/** A filter entry as the Filtersets view writes it: "table.field op value". */
function entryText(entry: FiltersetExportEntry): string {
  const f = entry.filter;
  return f !== null && f !== undefined
    ? `${f.f_table}.${f.f_field} ${f.f_op} ${f.f_value}`
    : (entry.filterset ?? "");
}
