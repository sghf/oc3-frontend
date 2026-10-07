import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api/client";
import { toPage } from "@/lib/api/page";
import {
  CollectorList,
  type ColumnFilterOption,
  type ListColumn,
} from "@/components/opensvc/CollectorList";
import { CrossLink } from "@/components/opensvc/CrossLink";
import { ObjectIcon } from "@/components/opensvc/ObjectIcon";
import type { ColumnFamily } from "@/components/opensvc/ColumnFamily";
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
import { teamsOf, useClaimMapping, type ClaimMappingRow } from "./claim-mapping-api";
import { ClaimMappingDetailPanel } from "./ClaimMappingDetailPanel";
import { ClaimMappingFormPanel } from "./ClaimMappingFormPanel";
import type { ClaimMappingDraft } from "./claim-mapping-draft";
import { CurrentClaims } from "./CurrentClaims";

/** By claim then value: the rules on one claim follow each other. */
const DEFAULT_SORT = ["claim", "value"];

const PROPS = [
  "claim",
  "value",
  "allow_access",
  "group_roles",
  "author",
  "updated",
  "id",
  "group_ids",
] as const satisfies readonly (keyof ClaimMappingRow)[];

const DEFAULT_COLS: string[] = [
  "claim",
  "value",
  "allow_access",
  "group_roles",
  "author",
  "updated",
];

const NUMERIC_PROPS = new Set<string>(["id"]);

const FAMILY: Record<string, ColumnFamily> = {
  claim: "state",
  value: "state",
  allow_access: "security",
  group_roles: "team",
  author: "team",
  updated: "time",
  id: "state",
  group_ids: "team",
};

/** Whether the rule allows signing in, said with a mark and a word. */
function AccessCell({ value }: { value: string | undefined }) {
  const { t } = useTranslation();
  return value === "T" ? (
    <span>
      <span aria-hidden="true" className="text-state-up">
        ●
      </span>{" "}
      {t("claimMappings.access.yes")}
    </span>
  ) : (
    <span className="text-ink-muted">{t("claimMappings.access.no")}</span>
  );
}

const ACCESS_OPTIONS: ColumnFilterOption[] = [
  { value: "T", labelKey: "claimMappings.access.yes" },
  { value: "F", labelKey: "claimMappings.access.no" },
];

const COLUMNS: ListColumn<ClaimMappingRow>[] = PROPS.map((prop) => ({
  prop,
  labelKey: `claimMappings.fields.${prop}`,
  numeric: NUMERIC_PROPS.has(prop),
  family: FAMILY[prop] ?? "state",
  filter: prop === "allow_access" ? { kind: "enum", options: ACCESS_OPTIONS } : undefined,
  render: (row: ClaimMappingRow, locale: string) => {
    if (prop === "updated") return <DateTime value={row.updated} locale={locale} />;
    if (prop === "allow_access") return <AccessCell value={row.allow_access} />;
    // The claim and its value read in a monospace font: a space must not go unnoticed.
    if (prop === "claim" || prop === "value")
      return <code className="whitespace-pre">{row[prop]}</code>;
    // One badge per team, each opening its record.
    if (prop === "group_roles") {
      const teams = teamsOf(row);
      return teams.length === 0 ? undefined : (
        <span className="flex flex-wrap gap-1">
          {teams.map((team) => (
            <CrossLink key={team.id} kind="group" id={String(team.id)}>
              {team.role}
            </CrossLink>
          ))}
        </span>
      );
    }
    const value = row[prop];
    return value === null ? undefined : value;
  },
}));

const ALL_PROPS = COLUMNS.map((column) => column.prop);

function queryProps(cols: string[] | undefined): string {
  // The team badges need the teams' ids.
  return [...new Set(["id", "group_ids", ...visibleProps(cols, DEFAULT_COLS, ALL_PROPS)])].join(
    ",",
  );
}

/** One page of the rules, with the sort, filters and columns of `search`. */
async function fetchMappings(search: ResolvedListSearch) {
  const { data, error } = await api.GET("/oidc_mappings", {
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
  if (error !== undefined) throw new Error(JSON.stringify(error));
  const all: ClaimMappingRow[] = Array.isArray(data.data) ? data.data : [];
  return toPage(all, data.meta, search.limit);
}

function useMappings(search: ResolvedListSearch) {
  return useQuery({
    queryKey: [
      "claim-mappings",
      search.sort,
      search.offset,
      search.limit,
      search.cols,
      filtersKey(search.filters),
    ],
    placeholderData: keepPreviousData,
    queryFn: () => fetchMappings(search),
  });
}

/**
 * Claim mappings: the rules translating the claims an OpenID Connect provider sends
 * into access to the collector and teams. Above the list, the claims of the current
 * sign-in, each value a shortcut to a new rule.
 */
export function ClaimMappingsPage() {
  const { t } = useTranslation();
  const prefs = useViewPrefs("claimMappings");
  const search = resolveListSearch(
    withSavedSearch(useSearch({ from: "/claim-mappings" }), prefs),
    DEFAULT_SORT,
  );
  const navigate = useNavigate({ from: "/claim-mappings" });
  const { data, isPending, isError, error, isFetching } = useMappings(search);
  // A single form: creation when nothing is selected, editing otherwise.
  const [form, setForm] = useState<"create" | "edit" | null>(null);
  const [initial, setInitial] = useState<Partial<ClaimMappingDraft> | undefined>(undefined);
  const selectedMapping = useClaimMapping(form === "edit" ? search.sel : undefined);

  async function allIds(): Promise<string[]> {
    const { data, error } = await api.GET("/oidc_mappings", {
      params: { query: { props: "id", limit: 0, filter: filterQuery(search.filters) } },
    });
    if (error !== undefined) throw new Error(JSON.stringify(error));
    const rows: ClaimMappingRow[] = Array.isArray(data.data) ? data.data : [];
    return rows
      .map((row) => row.id)
      .filter((id): id is number => id !== undefined)
      .map(String);
  }

  function update(next: Partial<ResolvedListSearch>) {
    // Choosing a row ends a creation in progress: the two drawers share an edge.
    if (next.sel !== undefined && form === "create") setForm(null);
    prefs.saveSearch(next);
    void navigate({
      search: (previous) => mergeSearch(previous, next),
      resetScroll: resetsScroll(next),
    });
  }

  function create(start?: Partial<ClaimMappingDraft>) {
    update({ sel: undefined });
    setInitial(start);
    setForm("create");
  }

  const selected = data?.rows.find((row) => String(row.id) === search.sel);

  return (
    <section>
      <div className="mb-3 flex items-center gap-3">
        <h1 className="flex items-center gap-2 text-title font-semibold">
          <ObjectIcon kind="claimMapping" className="h-5 w-5" />
          {t("claimMappings.title")}
        </h1>
        <button
          type="button"
          onClick={() => {
            create();
          }}
          className="h-7 rounded-(--radius-control) bg-accent px-3 font-medium text-accent-ink"
        >
          {t("claimMappings.form.open")}
        </button>
      </div>
      <p className="mb-3 max-w-3xl text-ink-muted">{t("claimMappings.intro")}</p>

      <CurrentClaims
        onMap={(claim, value) => {
          create({ claim, value });
        }}
      />

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
        exportPage={(page) => fetchMappings({ ...search, ...page })}
        total={data?.total}
        selectAllMatching={allIds}
        filterable
      />

      <ClaimMappingDetailPanel
        mappingId={form === null ? search.sel : undefined}
        label={selected === undefined ? "" : `${selected.claim ?? ""} = ${selected.value ?? ""}`}
        onClose={() => {
          update({ sel: undefined });
        }}
        onEdit={() => {
          setForm("edit");
        }}
      />

      <ClaimMappingFormPanel
        open={form === "create" || (form === "edit" && selectedMapping.data !== undefined)}
        mapping={form === "edit" ? selectedMapping.data : undefined}
        initial={initial}
        onClose={() => {
          setForm(null);
        }}
        onSaved={(id) => {
          if (form === "create" && id !== undefined) update({ sel: String(id) });
        }}
      />
    </section>
  );
}
