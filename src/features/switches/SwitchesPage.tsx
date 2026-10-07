import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { components } from "@/lib/api/schema";
import { api } from "@/lib/api/client";
import { toPage } from "@/lib/api/page";
import { problemText } from "@/lib/api/problem";
import { CollectorList, type ListColumn } from "@/components/opensvc/CollectorList";
import { CrossLink } from "@/components/opensvc/CrossLink";
import { FlagSwitch } from "@/components/opensvc/FlagSwitch";
import { FLAG_FILTER_OPTIONS } from "@/components/opensvc/filter-options";
import { ObjectIcon } from "@/components/opensvc/ObjectIcon";
import { DateTime } from "@/components/ui/DateTime";
import {
  resolveListSearch,
  resetsScroll,
  mergeSearch,
  visibleProps,
  type ResolvedListSearch,
} from "@/lib/list-search";
import { filterQuery, filtersKey } from "@/lib/column-filters";
import { useViewPrefs, withSavedSearch } from "@/lib/user-prefs";

type SwitchPortRow = components["schemas"]["SwitchPortRow"];

/** By switch, then port index, then port state, as the historical table. */
const DEFAULT_SORT = ["sw_name", "sw_index", "sw_portstate"];

/**
 * Port properties exposed by apicollector, in the order of the historical SAN
 * switches table, then the ids it did not show. `satisfies` confronts them with the
 * generated schema.
 */
const SWITCH_PROPS = [
  "sw_fabric",
  "sw_name",
  "sw_index",
  "sw_slot",
  "sw_port",
  "sw_portspeed",
  "sw_portnego",
  "sw_porttype",
  "sw_portstate",
  "sw_portname",
  "sw_rportname",
  "sw_rname",
  "sw_updated",
  "node_id",
  "id",
] as const satisfies readonly (keyof SwitchPortRow)[];

type SwitchProp = (typeof SWITCH_PROPS)[number];

/** Every column of the historical table is shown by default there. */
const DEFAULT_COLS: string[] = [
  "sw_fabric",
  "sw_name",
  "sw_index",
  "sw_slot",
  "sw_port",
  "sw_portspeed",
  "sw_portnego",
  "sw_porttype",
  "sw_portstate",
  "sw_portname",
  "sw_rportname",
  "sw_rname",
  "sw_updated",
];

const NUMERIC_PROPS: SwitchProp[] = ["sw_index", "sw_slot", "sw_port", "sw_portspeed", "id"];

/** Port names are WWNs or IQNs: compared character by character, hence monospaced. */
const ADDRESS_PROPS: SwitchProp[] = ["sw_fabric", "sw_portname", "sw_rportname"];

function renderCell(prop: SwitchProp, row: SwitchPortRow, locale: string) {
  const value = row[prop];
  if (prop === "sw_rname")
    // What is plugged on the other end is a node when the collector knows its HBA;
    // an array or another switch has no record to show and stays plain text.
    return row.node_id === undefined || row.node_id === "" ? (
      value
    ) : (
      <CrossLink kind="node" id={row.node_id}>
        {value}
      </CrossLink>
    );
  if (prop === "sw_portnego")
    // An unused port reports no negotiation at all: neither yes nor no.
    return value === "T" || value === "F" ? (
      <FlagSwitch value={value} labelKey="switches.fields.sw_portnego" />
    ) : null;
  if (prop === "sw_updated" && typeof value === "string")
    return <DateTime value={value} locale={locale} />;
  if (ADDRESS_PROPS.includes(prop) && typeof value === "string" && value !== "")
    return <code>{value}</code>;
  return value;
}

/**
 * The columns. The historical picker marks them all with the network icon, the
 * date with the clock.
 */
const COLUMNS: ListColumn<SwitchPortRow>[] = SWITCH_PROPS.map((prop) => ({
  prop,
  labelKey: `switches.fields.${prop}`,
  numeric: NUMERIC_PROPS.includes(prop),
  family: prop === "sw_updated" ? "time" : prop === "node_id" ? "node" : "network",
  filter: prop === "sw_portnego" ? { kind: "enum", options: FLAG_FILTER_OPTIONS } : undefined,
  render: (row, locale) => renderCell(prop, row, locale),
}));

const ALL_PROPS: string[] = [...SWITCH_PROPS];

/** Columns shown, plus the row id and the node id the remote name links with. */
function queryProps(cols: string[] | undefined): string {
  return [...new Set(["id", "node_id", ...visibleProps(cols, DEFAULT_COLS, ALL_PROPS)])].join(",");
}

/**
 * One page of the list, read with the sort, the filters and the columns of `search`.
 * The view reads the page on display with it, and the export every page in turn.
 */
async function fetchSwitchPorts(search: ResolvedListSearch) {
  const { data, error } = await api.GET("/san-switches", {
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
  const all: SwitchPortRow[] = Array.isArray(data.data) ? data.data : [];
  return toPage(all, data.meta, search.limit);
}

function useSwitchPorts(search: ResolvedListSearch) {
  return useQuery({
    queryKey: [
      "switches",
      search.sort,
      search.offset,
      search.limit,
      search.cols,
      filtersKey(search.filters),
    ],
    // The rows on display stay while the next ones load: typing a filter must not
    // empty the table under the field.
    placeholderData: keepPreviousData,
    queryFn: () => fetchSwitchPorts(search),
  });
}

/**
 * Ports of the SAN switches the collector inventories: one row per port, with what
 * is plugged on its other end (a node, a storage array or another switch).
 * Read-only; the rows are filtered and sorted by the server.
 */
export function SwitchesPage() {
  const { t } = useTranslation();
  const prefs = useViewPrefs("switches");
  const search = resolveListSearch(
    withSavedSearch(useSearch({ from: "/san-switches" }), prefs),
    DEFAULT_SORT,
  );
  const navigate = useNavigate({ from: "/san-switches" });
  const { data, isPending, isError, error, isFetching } = useSwitchPorts(search);

  /** Ids of the whole selection, filters included, without pagination. */
  async function allIds(): Promise<string[]> {
    const { data, error } = await api.GET("/san-switches", {
      params: { query: { props: "id", limit: 0, filter: filterQuery(search.filters) } },
    });
    if (error !== undefined) throw new Error(problemText(error));
    const rows: SwitchPortRow[] = Array.isArray(data.data) ? data.data : [];
    return rows.flatMap((row) => (row.id === undefined ? [] : [String(row.id)]));
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
        <ObjectIcon kind="switch" className="h-5 w-5" />
        {t("switches.title")}
      </h1>
      <p className="mb-3 max-w-3xl text-ink-muted">{t("switches.intro")}</p>

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
        exportPage={(page) => fetchSwitchPorts({ ...search, ...page })}
        total={data?.total}
        selectAllMatching={allIds}
        filterable
      />
    </section>
  );
}
