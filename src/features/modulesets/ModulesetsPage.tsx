import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { components } from "@/lib/api/schema";
import { api } from "@/lib/api/client";
import { toPage } from "@/lib/api/page";
import { problemText } from "@/lib/api/problem";
import { CollectorList, type ListColumn } from "@/components/opensvc/CollectorList";
import { ObjectIcon } from "@/components/opensvc/ObjectIcon";
import type { ColumnFamily } from "@/components/opensvc/ColumnFamily";
import { DateTime } from "@/components/ui/DateTime";
import { FlagSwitch } from "@/components/opensvc/FlagSwitch";
import { FLAG_FILTER_OPTIONS } from "@/components/opensvc/filter-options";
import { TeamLinks } from "@/features/groups/TeamLink";
import { UserLink } from "@/features/users/UserLink";
import {
  resolveListSearch,
  resetsScroll,
  mergeSearch,
  visibleProps,
  type ResolvedListSearch,
} from "@/lib/list-search";
import { filterQuery, filtersKey } from "@/lib/column-filters";
import { useViewPrefs, withSavedSearch } from "@/lib/user-prefs";
import { ModulesetDetailPanel } from "./ModulesetDetailPanel";

/** A module of a moduleset, or a moduleset without module on a row of its own. */
type ModulesetRow = components["schemas"]["ModulesetsModuleRow"];

const DEFAULT_SORT = ["modset_name", "modset_mod_name"];

/**
 * Props exposed by apicollector, in the order of `meta.available_props`.
 * `satisfies` confronts them with the generated schema.
 */
const MODULESET_PROPS = [
  "id",
  "modset_id",
  "modset_name",
  "teams_responsible",
  "teams_publication",
  "modset_mod_name",
  "autofix",
  "modset_mod_updated",
  "modset_mod_author",
  "modset_author",
  "modset_updated",
] as const satisfies readonly (keyof ModulesetRow)[];

type ModulesetProp = (typeof MODULESET_PROPS)[number];

/** The columns of the historical view, in its order. */
const DEFAULT_COLS: string[] = [
  "modset_name",
  "teams_responsible",
  "teams_publication",
  "modset_mod_name",
  "autofix",
  "modset_mod_updated",
  "modset_mod_author",
];

const FAMILY: Partial<Record<ModulesetProp, ColumnFamily>> = {
  modset_author: "team",
  modset_updated: "time",
  modset_mod_author: "team",
  modset_mod_updated: "time",
  teams_responsible: "team",
  teams_publication: "team",
};

/** The id props, keys of the rows. */
const KEY_PROPS = ["id", "modset_id"];

function renderCell(prop: ModulesetProp, row: ModulesetRow, locale: string) {
  switch (prop) {
    case "modset_updated":
    case "modset_mod_updated":
      return <DateTime value={row[prop]} locale={locale} />;
    case "teams_responsible":
    case "teams_publication":
      return <TeamLinks value={row[prop]} />;
    case "autofix":
      return <FlagSwitch value={row.autofix} labelKey="modulesets.fields.autofix" />;
    case "modset_author":
    case "modset_mod_author":
      return <UserLink name={row[prop]} />;
    case "id":
      // A moduleset without module has no module id.
      return row.id === 0 ? null : row.id;
    default:
      return row[prop];
  }
}

const COLUMNS: ListColumn<ModulesetRow>[] = MODULESET_PROPS.map((prop) => ({
  prop,
  labelKey: `modulesets.fields.${prop}`,
  numeric: KEY_PROPS.includes(prop),
  family: FAMILY[prop] ?? "moduleset",
  filter: prop === "autofix" ? { kind: "enum" as const, options: FLAG_FILTER_OPTIONS } : undefined,
  render: (row, locale) => renderCell(prop, row, locale),
}));

const ALL_PROPS: string[] = [...MODULESET_PROPS];

/** Columns shown, plus the ids the rows are keyed by. */
function queryProps(cols: string[] | undefined): string {
  return [...new Set([...KEY_PROPS, ...visibleProps(cols, DEFAULT_COLS, ALL_PROPS)])].join(",");
}

/**
 * A module row is keyed by its module id, which is 0 for every moduleset without
 * module: the moduleset id keeps those apart.
 */
function rowKey(row: ModulesetRow): string | undefined {
  return row.id === undefined || row.modset_id === undefined
    ? undefined
    : `${String(row.modset_id)}:${String(row.id)}`;
}

/**
 * One page of the list, read with the sort, the filters and the columns of `search`.
 * The view reads the page on display with it, and the export every page in turn.
 */
async function fetchModulesets(search: ResolvedListSearch) {
  // One row more than the page: apicollector does not return the total of a selection.
  const { data, error } = await api.GET("/compliance/modulesets_modules", {
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
  // `data` holds the rows, or the counts when `stats` is asked for.
  const all: ModulesetRow[] = Array.isArray(data.data) ? data.data : [];
  return toPage(all, data.meta, search.limit);
}

function useModulesets(search: ResolvedListSearch) {
  return useQuery({
    queryKey: [
      "modulesets",
      search.sort,
      search.offset,
      search.limit,
      search.cols,
      filtersKey(search.filters),
    ],
    // The rows on display stay while the next ones load: typing a filter must not
    // empty the table under the field.
    placeholderData: keepPreviousData,
    queryFn: () => fetchModulesets(search),
  });
}

/** The moduleset of a selected row, whose key is "<moduleset id>:<module id>". */
function modsetOf(sel: string | undefined): string | undefined {
  const id = sel?.split(":")[0];
  return id === undefined || id === "" ? undefined : id;
}

/**
 * The modules of the compliance modulesets published to the user's groups, one row
 * per module with its moduleset and the moduleset's teams, as the collector's
 * modulesets view. The rows are filtered and sorted by the server; a row opens
 * the panel of its moduleset, where it is read and edited.
 */
export function ModulesetsPage() {
  const { t } = useTranslation();
  const prefs = useViewPrefs("modulesets");
  const search = resolveListSearch(
    withSavedSearch(useSearch({ from: "/compliance/modulesets" }), prefs),
    DEFAULT_SORT,
  );
  const navigate = useNavigate({ from: "/compliance/modulesets" });
  const { data, isPending, isError, error, isFetching } = useModulesets(search);
  const selected = data?.rows.find((row) => rowKey(row) === search.sel);

  /** Ids of the whole selection, filters included, without pagination. */
  async function allIds(): Promise<string[]> {
    const { data, error } = await api.GET("/compliance/modulesets_modules", {
      params: {
        query: { props: KEY_PROPS.join(","), limit: 0, filter: filterQuery(search.filters) },
      },
    });
    if (error !== undefined) throw new Error(problemText(error));
    const rows: ModulesetRow[] = Array.isArray(data.data) ? data.data : [];
    return rows.flatMap((row) => {
      const key = rowKey(row);
      return key === undefined ? [] : [key];
    });
  }

  function update(next: Partial<ResolvedListSearch>) {
    // Columns, sort, filters and page size follow the account, the other states
    // stay in the URL.
    prefs.saveSearch(next);
    void navigate({
      search: (previous) => mergeSearch(previous, next),
      resetScroll: resetsScroll(next),
    });
  }

  return (
    <section>
      <h1 className="mb-3 flex items-center gap-2 text-title font-semibold">
        <ObjectIcon kind="moduleset" className="h-5 w-5" />
        {t("modulesets.title")}
      </h1>

      <CollectorList
        columns={COLUMNS}
        defaultCols={DEFAULT_COLS}
        rows={data?.rows ?? []}
        rowId={rowKey}
        search={search}
        onChange={update}
        isPending={isPending}
        isFetching={isFetching}
        errorMessage={isError ? error.message : null}
        hasMore={data?.hasMore ?? false}
        exportPage={(page) => fetchModulesets({ ...search, ...page })}
        total={data?.total}
        selectAllMatching={allIds}
        filterable
      />

      <ModulesetDetailPanel
        modsetId={modsetOf(search.sel)}
        label={selected?.modset_name ?? ""}
        onClose={() => {
          update({ sel: undefined });
        }}
      />
    </section>
  );
}
