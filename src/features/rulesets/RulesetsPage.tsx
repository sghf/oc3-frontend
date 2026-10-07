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
import { FormValue } from "@/features/forms/FormValue";
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
import { RulesetDetailPanel } from "./RulesetDetailPanel";

/**
 * A variable of a ruleset, its own or one of a ruleset it encapsulates, or a ruleset
 * of the chain without variable on a row of its own.
 */
type RulesetRow = components["schemas"]["RulesetsVariableRow"];

const DEFAULT_SORT = ["ruleset_name", "chain_len", "encap_rset", "var_name"];

/**
 * Props exposed by apicollector, in the order of `meta.available_props`.
 * `satisfies` confronts them with the generated schema.
 */
const RULESET_PROPS = [
  "id",
  "ruleset_id",
  "ruleset_name",
  "ruleset_type",
  "ruleset_public",
  "teams_responsible",
  "teams_publication",
  "fset_name",
  "chain",
  "chain_len",
  "encap_rset",
  "var_class",
  "var_name",
  "var_value",
  "var_updated",
  "var_author",
  "encap_rset_id",
  "fset_id",
] as const satisfies readonly (keyof RulesetRow)[];

type RulesetProp = (typeof RULESET_PROPS)[number];

/** The columns of the historical view, in its order. */
const DEFAULT_COLS: string[] = [
  "ruleset_name",
  "ruleset_type",
  "ruleset_public",
  "teams_responsible",
  "teams_publication",
  "fset_name",
  "encap_rset",
  "var_class",
  "var_name",
  "var_value",
  "var_updated",
  "var_author",
];

const FAMILY: Partial<Record<RulesetProp, ColumnFamily>> = {
  teams_responsible: "team",
  teams_publication: "team",
  fset_name: "filterset",
  fset_id: "filterset",
  var_updated: "time",
  var_author: "team",
};

/** The props a row is keyed by: a variable may be listed under several rulesets. */
const KEY_PROPS = ["id", "ruleset_id", "encap_rset_id"];

/** Always requested: the class names the form that lays out a value. */
const FETCHED_PROPS = [...KEY_PROPS, "var_class"];

const NUMERIC_PROPS: string[] = [...KEY_PROPS, "chain_len", "fset_id"];

/** The two kinds of ruleset: the values are their own labels, as in the cells. */
const TYPE_OPTIONS = [{ value: "explicit" }, { value: "contextual" }];

function renderCell(prop: RulesetProp, row: RulesetRow, locale: string) {
  switch (prop) {
    case "var_updated":
      return <DateTime value={row.var_updated} locale={locale} />;
    case "teams_responsible":
    case "teams_publication":
      return <TeamLinks value={row[prop]} />;
    case "ruleset_public":
      return <FlagSwitch value={row.ruleset_public} labelKey="rulesets.fields.ruleset_public" />;
    case "var_author":
      return <UserLink name={row.var_author} />;
    case "var_value":
      // Laid out by the form its class names, as the collector shows rule values.
      return <FormValue formName={row.var_class ?? ""} value={row.var_value} digest />;
    case "id":
    case "encap_rset_id":
    case "fset_id":
      // 0 stands for no variable, no encapsulated ruleset, no filterset.
      return row[prop] === 0 ? null : row[prop];
    default:
      return row[prop];
  }
}

const COLUMNS: ListColumn<RulesetRow>[] = RULESET_PROPS.map((prop) => ({
  prop,
  labelKey: `rulesets.fields.${prop}`,
  numeric: NUMERIC_PROPS.includes(prop),
  family: FAMILY[prop] ?? "ruleset",
  filter:
    prop === "ruleset_public"
      ? { kind: "enum" as const, options: FLAG_FILTER_OPTIONS }
      : prop === "ruleset_type"
        ? { kind: "enum" as const, options: TYPE_OPTIONS }
        : undefined,
  render: (row, locale) => renderCell(prop, row, locale),
}));

const ALL_PROPS: string[] = [...RULESET_PROPS];

/** Columns shown, plus the ids the rows are keyed by and the class of the values. */
function queryProps(cols: string[] | undefined): string {
  return [...new Set([...FETCHED_PROPS, ...visibleProps(cols, DEFAULT_COLS, ALL_PROPS)])].join(",");
}

/**
 * The ruleset of a selected row, whose key is "<ruleset id>:<encapsulated ruleset
 * id>:<variable id>": the ruleset the row is listed under, even when the variable
 * comes from a ruleset it encapsulates.
 */
function rulesetOf(sel: string | undefined): string | undefined {
  const id = sel?.split(":")[0];
  return id === undefined || id === "" ? undefined : id;
}

function rowKey(row: RulesetRow): string | undefined {
  if (row.id === undefined || row.ruleset_id === undefined) return undefined;
  return `${String(row.ruleset_id)}:${String(row.encap_rset_id ?? 0)}:${String(row.id)}`;
}

/**
 * One page of the list, read with the sort, the filters and the columns of `search`.
 * The view reads the page on display with it, and the export every page in turn.
 */
async function fetchRulesets(search: ResolvedListSearch) {
  // One row more than the page: apicollector does not return the total of a selection.
  const { data, error } = await api.GET("/compliance/rulesets_variables", {
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
  const all: RulesetRow[] = Array.isArray(data.data) ? data.data : [];
  return toPage(all, data.meta, search.limit);
}

function useRulesets(search: ResolvedListSearch) {
  return useQuery({
    queryKey: [
      "rulesets",
      search.sort,
      search.offset,
      search.limit,
      search.cols,
      filtersKey(search.filters),
    ],
    // The rows on display stay while the next ones load: typing a filter must not
    // empty the table under the field.
    placeholderData: keepPreviousData,
    queryFn: () => fetchRulesets(search),
  });
}

/**
 * The variables of the compliance rulesets published to the user's groups, one row
 * per variable with its ruleset, the ruleset's filterset and teams, and the
 * encapsulated ruleset it comes from, as the collector's rulesets view. The rows
 * are filtered and sorted by the server; a row opens the panel of its ruleset,
 * where it is read and edited.
 */
export function RulesetsPage() {
  const { t } = useTranslation();
  const prefs = useViewPrefs("rulesets");
  const search = resolveListSearch(
    withSavedSearch(useSearch({ from: "/compliance/rulesets" }), prefs),
    DEFAULT_SORT,
  );
  const navigate = useNavigate({ from: "/compliance/rulesets" });
  const { data, isPending, isError, error, isFetching } = useRulesets(search);
  const selected = data?.rows.find((row) => rowKey(row) === search.sel);

  /** Ids of the whole selection, filters included, without pagination. */
  async function allIds(): Promise<string[]> {
    const { data, error } = await api.GET("/compliance/rulesets_variables", {
      params: {
        query: { props: KEY_PROPS.join(","), limit: 0, filter: filterQuery(search.filters) },
      },
    });
    if (error !== undefined) throw new Error(problemText(error));
    const rows: RulesetRow[] = Array.isArray(data.data) ? data.data : [];
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
        <ObjectIcon kind="ruleset" className="h-5 w-5" />
        {t("rulesets.title")}
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
        exportPage={(page) => fetchRulesets({ ...search, ...page })}
        total={data?.total}
        selectAllMatching={allIds}
        filterable
      />

      <RulesetDetailPanel
        rsetId={rulesetOf(search.sel)}
        label={selected?.ruleset_name ?? ""}
        onClose={() => {
          update({ sel: undefined });
        }}
      />
    </section>
  );
}
