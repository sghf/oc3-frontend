import { useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { CollectorList, type ListColumn } from "@/components/opensvc/CollectorList";
import type { ColumnFamily } from "@/components/opensvc/ColumnFamily";
import { FLAG_FILTER_OPTIONS } from "@/components/opensvc/filter-options";
import { ObjectIcon } from "@/components/opensvc/ObjectIcon";
import { DateTime } from "@/components/ui/DateTime";
import { API_BASE } from "@/lib/api/client";
import { hasPrivilege, useEffectivePrivileges } from "@/lib/api/effective-privileges";
import { localPage, localValueStats, type ReadProp } from "@/lib/local-list";
import {
  mergeSearch,
  resetsScroll,
  resolveListSearch,
  type ResolvedListSearch,
} from "@/lib/list-search";
import { useViewPrefs, withSavedSearch } from "@/lib/user-prefs";
import { CompModulePanel, Runnable } from "./CompModulePanel";
import { useCompModules, type CompModule } from "./comp-modules-api";

/** A module as a row of the list: the last commit flattened into columns. */
interface CompModuleRow {
  name: string;
  path: string;
  order: number;
  kind: string;
  entry: string;
  /** "T" or "F", as the flags of the other lists. */
  runnable: string;
  issue: CompModule["issue"];
  changed_date?: string;
  changed_author?: string;
  changed_subject?: string;
  changed_id?: string;
}

function toRow(m: CompModule): CompModuleRow {
  return {
    name: m.name,
    path: m.path,
    order: m.order,
    kind: m.kind,
    entry: m.entry,
    runnable: m.runnable ? "T" : "F",
    issue: m.issue,
    changed_date: m.changed?.date,
    changed_author: m.changed?.author,
    changed_subject: m.changed?.subject,
    changed_id: m.changed?.id,
  };
}

const PROPS = [
  "name",
  "path",
  "order",
  "kind",
  "entry",
  "runnable",
  "changed_date",
  "changed_author",
  "changed_subject",
  "changed_id",
] as const satisfies readonly (keyof CompModuleRow)[];

const DEFAULT_COLS: string[] = [
  "name",
  "order",
  "kind",
  "runnable",
  "changed_date",
  "changed_author",
  "changed_subject",
];

const DEFAULT_SORT = ["order", "name"];

const FAMILY: Record<string, ColumnFamily> = {
  changed_date: "time",
  changed_author: "team",
};

const read: ReadProp<CompModuleRow> = (row, prop) =>
  (row as unknown as Record<string, string | number | undefined>)[prop];

/**
 * The compliance modules: the scripts the agents run to check and fix a node,
 * kept by oc3 in a git repository and served to the nodes as the archive om
 * node updatecomp installs. The modulesets name them. A CompManager creates
 * one from a script.
 *
 * The API lists them whole, from git: the filters, the sort and the pages of
 * the list apply in the browser (`local-list`), with the meaning the API gives
 * them on the other lists.
 */
export function CompModulesPage() {
  const { t } = useTranslation();
  const prefs = useViewPrefs("compModules");
  const search = resolveListSearch(
    withSavedSearch(useSearch({ from: "/compliance/modules" }), prefs),
    DEFAULT_SORT,
  );
  const navigate = useNavigate({ from: "/compliance/modules" });
  const modules = useCompModules();
  const privileges = useEffectivePrivileges();
  const canCreate = privileges.data !== undefined && hasPrivilege(privileges.data, ["CompManager"]);
  const [creating, setCreating] = useState(false);

  const all = (modules.data ?? []).map(toRow);
  const page = localPage(all, search, read);

  function update(next: Partial<ResolvedListSearch>) {
    // Choosing a row ends a creation in progress: the two drawers would overlap.
    if (next.sel !== undefined) setCreating(false);
    prefs.saveSearch(next);
    void navigate({
      search: (previous) => mergeSearch(previous, next),
      resetScroll: resetsScroll(next),
    });
  }

  const columns: ListColumn<CompModuleRow>[] = PROPS.map((prop) => ({
    prop,
    labelKey: `compModules.fields.${prop}`,
    numeric: prop === "order",
    family: FAMILY[prop] ?? "state",
    filter:
      prop === "kind"
        ? {
            kind: "enum" as const,
            options: [
              { value: "script", labelKey: "compModules.kind.script" },
              { value: "directory", labelKey: "compModules.kind.directory" },
            ],
          }
        : prop === "runnable"
          ? { kind: "enum" as const, options: FLAG_FILTER_OPTIONS }
          : undefined,
    render: (row: CompModuleRow) => {
      switch (prop) {
        case "name":
        case "path":
        case "entry":
          return <span className="font-mono">{row[prop]}</span>;
        case "kind":
          return t(`compModules.kind.${row.kind}`);
        case "runnable":
          return <Runnable runnable={row.runnable === "T"} issue={row.issue} />;
        case "changed_date":
          return <DateTime value={row.changed_date} />;
        case "changed_id":
          return <span className="font-mono">{row.changed_id?.slice(0, 12)}</span>;
        default:
          return row[prop];
      }
    },
  }));

  return (
    <section>
      <div className="mb-3 flex items-center gap-3">
        <h1 className="flex items-center gap-2 text-title font-semibold">
          <ObjectIcon kind="compModule" className="h-5 w-5" />
          {t("compModules.title")}
        </h1>
        {canCreate && (
          <button
            type="button"
            onClick={() => {
              update({ sel: undefined });
              setCreating(true);
            }}
            className="h-7 rounded-(--radius-control) bg-accent px-3 font-medium text-accent-ink"
          >
            {t("compModules.new")}
          </button>
        )}
      </div>
      <p className="mb-3 max-w-3xl text-ink-muted">{t("compModules.intro")}</p>

      <CollectorList
        viewPrefs={prefs}
        valueStats={(prop, filters) => Promise.resolve(localValueStats(all, prop, filters, read))}
        columns={columns}
        defaultCols={DEFAULT_COLS}
        rows={page.rows}
        rowId={(row) => row.name}
        search={search}
        onChange={update}
        isPending={modules.isPending}
        isFetching={modules.isFetching}
        errorMessage={modules.isError ? modules.error.message : null}
        hasMore={page.hasMore}
        total={page.total}
        exportPage={(p) => Promise.resolve(localPage(all, { ...search, ...p }, read))}
        filterable
      />

      <p className="mt-4 max-w-3xl text-ink-muted">
        {t("compModules.distribution", {
          url: `${window.location.origin}${API_BASE}/compliance/modules_repo`,
        })}
      </p>

      <CompModulePanel
        name={creating ? undefined : search.sel}
        creating={creating}
        canEdit={canCreate}
        onClose={() => {
          setCreating(false);
          update({ sel: undefined });
        }}
        onCreated={(name) => {
          setCreating(false);
          update({ sel: name });
        }}
        onRenamed={(name) => {
          update({ sel: name });
        }}
      />
    </section>
  );
}
