import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { components } from "@/lib/api/schema";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";
import { toPage } from "@/lib/api/page";
import { CollectorList, type ListColumn } from "@/components/opensvc/CollectorList";
import { CrossLink } from "@/components/opensvc/CrossLink";
import { ObjectIcon } from "@/components/opensvc/ObjectIcon";
import { SelectionDeleteMenu } from "@/components/opensvc/SelectionDeleteMenu";
import type { ColumnFamily } from "@/components/opensvc/ColumnFamily";
import {
  resolveListSearch,
  resetsScroll,
  mergeSearch,
  visibleProps,
  type ResolvedListSearch,
} from "@/lib/list-search";
import { filterQuery, filtersKey } from "@/lib/column-filters";
import { hasPrivilege, useEffectivePrivileges } from "@/lib/api/effective-privileges";
import { useViewPrefs, withSavedSearch } from "@/lib/user-prefs";
import { CheckContextualDetailPanel } from "./CheckContextualDetailPanel";
import { CreateCheckContextualPanel } from "./CreateCheckContextualPanel";

type CheckContextualRow = components["schemas"]["CheckContextualRow"];

/** By filterset, then type and instance. */
const DEFAULT_SORT = ["gen_filtersets.fset_name", "chk_type", "chk_instance"];

const PROPS = [
  "id",
  "fset_id",
  "gen_filtersets.fset_name",
  "chk_type",
  "chk_instance",
  "chk_low",
  "chk_high",
] as const satisfies readonly (keyof CheckContextualRow)[];

const DEFAULT_COLS: string[] = [
  "gen_filtersets.fset_name",
  "chk_type",
  "chk_instance",
  "chk_low",
  "chk_high",
];

const NUMERIC_PROPS = new Set<string>(["id", "fset_id", "chk_low", "chk_high"]);

const FAMILY: Record<string, ColumnFamily> = {
  id: "state",
  fset_id: "filterset",
  "gen_filtersets.fset_name": "filterset",
  chk_type: "state",
  chk_instance: "state",
  chk_low: "alert",
  chk_high: "alert",
};

const COLUMNS: ListColumn<CheckContextualRow>[] = PROPS.map((prop) => ({
  prop,
  labelKey: `checkContextual.fields.${prop}`,
  numeric: NUMERIC_PROPS.has(prop),
  family: FAMILY[prop] ?? "state",
  distribution: prop === "id" || prop === "fset_id" ? false : undefined,
  render: (row: CheckContextualRow) => {
    if (prop === "chk_instance") return <code>{row.chk_instance}</code>;
    if (prop === "gen_filtersets.fset_name")
      return (
        <CrossLink
          kind="filterset"
          id={row.fset_id === undefined ? undefined : String(row.fset_id)}
        >
          {row["gen_filtersets.fset_name"]}
        </CrossLink>
      );
    return row[prop];
  },
}));

const ALL_PROPS = COLUMNS.map((column) => column.prop);

function queryProps(cols: string[] | undefined): string {
  return [...new Set(["id", "fset_id", ...visibleProps(cols, DEFAULT_COLS, ALL_PROPS)])].join(",");
}

async function fetchDefaults(search: ResolvedListSearch) {
  // One row more than the page: apicollector does not return the total of a selection.
  const { data, error } = await api.GET("/checks/contextual_settings", {
    params: {
      query: {
        props: queryProps(search.cols),
        orderby: search.sort.join(","),
        offset: search.offset,
        limit: search.limit + 1,
        filter: filterQuery(search.filters),
      },
    },
  });
  if (error !== undefined) throw new Error(problemText(error));
  const all: CheckContextualRow[] = Array.isArray(data.data) ? data.data : [];
  return toPage(all, data.meta, search.limit);
}

/**
 * The contextual thresholds: those of the checks of a type and of the instances a
 * pattern matches, on the nodes and services a filterset selects, which take
 * precedence over the defaults. The historical collector managed them from its
 * Data management menu; ContextCheckManager adds, edits and deletes them here.
 */
export function CheckContextualPage() {
  const { t } = useTranslation();
  const prefs = useViewPrefs("check-contextual");
  const search = resolveListSearch(
    withSavedSearch(useSearch({ from: "/checks/contextual" }), prefs),
    DEFAULT_SORT,
  );
  const navigate = useNavigate({ from: "/checks/contextual" });
  const privileges = useEffectivePrivileges();
  const manager =
    privileges.data !== undefined && hasPrivilege(privileges.data, ["ContextCheckManager"]);
  const { data, isPending, isError, error, isFetching } = useQuery({
    queryKey: [
      "check-contextual",
      search.sort,
      search.offset,
      search.limit,
      search.cols,
      filtersKey(search.filters),
    ],
    placeholderData: keepPreviousData,
    queryFn: () => fetchDefaults(search),
  });
  const [creating, setCreating] = useState(false);
  // The rows checked, and those just deleted, for the list to untick them.
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleted, setDeleted] = useState<string[]>([]);
  const names = new Map<string, string>();
  for (const row of data?.rows ?? []) {
    if (row.id === undefined || row.chk_type === undefined) continue;
    names.set(
      String(row.id),
      `${row["gen_filtersets.fset_name"] ?? ""} ${row.chk_type}:${row.chk_instance ?? ""}`.trim(),
    );
  }

  async function allIds(): Promise<string[]> {
    const { data, error } = await api.GET("/checks/contextual_settings", {
      params: { query: { props: "id", limit: 0, filter: filterQuery(search.filters) } },
    });
    if (error !== undefined) throw new Error(problemText(error));
    const rows: CheckContextualRow[] = Array.isArray(data.data) ? data.data : [];
    return rows.flatMap((row) => (row.id === undefined ? [] : [String(row.id)]));
  }

  function update(next: Partial<ResolvedListSearch>) {
    prefs.saveSearch(next);
    void navigate({
      search: (previous) => mergeSearch(previous, next),
      resetScroll: resetsScroll(next),
    });
  }

  return (
    <section>
      <div className="mb-3 flex min-h-7 items-center gap-3">
        <h1 className="flex items-center gap-2 text-title font-semibold">
          <ObjectIcon kind="check" className="h-5 w-5" />
          {t("checkContextual.title")}
        </h1>
        {manager && (
          <button
            type="button"
            onClick={() => {
              // The drawers share the right edge: opening the creation closes the detail.
              update({ sel: undefined });
              setCreating(true);
            }}
            className="h-7 rounded-(--radius-control) bg-accent px-3 font-medium text-accent-ink"
          >
            {t("checkContextual.create.open")}
          </button>
        )}
        {/* On the rows checked in the list; nothing checked, no menu. */}
        <SelectionDeleteMenu
          targets={selectedIds.map((id) => ({ id, name: names.get(id) ?? id }))}
          prefix="checkContextual.actions"
          privileges={["ContextCheckManager"]}
          remove={async (id) => {
            const { error } = await api.DELETE("/checks/contextual_settings/{id}", {
              params: { path: { id: Number(id) } },
            });
            return error === undefined ? null : problemText(error);
          }}
          invalidate={[["check-contextual"]]}
          onDeleted={(ids) => {
            setDeleted(ids);
            if (search.sel !== undefined && ids.includes(search.sel)) update({ sel: undefined });
          }}
        />
      </div>
      <p className="mb-3 max-w-3xl text-ink-muted">{t("checkContextual.intro")}</p>

      <CollectorList
        columns={COLUMNS}
        defaultCols={DEFAULT_COLS}
        rows={data?.rows ?? []}
        rowId={(row) => (row.id === undefined ? undefined : String(row.id))}
        search={search}
        onChange={update}
        isPending={isPending}
        isFetching={isFetching}
        errorMessage={isError ? error.message : null}
        hasMore={data?.hasMore ?? false}
        exportPage={(page) => fetchDefaults({ ...search, ...page })}
        total={data?.total}
        selectAllMatching={allIds}
        onSelectionChange={setSelectedIds}
        unselect={deleted}
        filterable
      />

      <CheckContextualDetailPanel
        thresholdsId={search.sel}
        label={search.sel === undefined ? "" : (names.get(search.sel) ?? "")}
        onClose={() => {
          update({ sel: undefined });
        }}
      />
      <CreateCheckContextualPanel
        open={creating}
        onClose={() => {
          setCreating(false);
        }}
        onCreated={(id) => {
          update({ sel: String(id) });
        }}
      />
    </section>
  );
}
