import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { components } from "@/lib/api/schema";
import { api } from "@/lib/api/client";
import { toPage } from "@/lib/api/page";
import {
  CollectorList,
  type ColumnFilterOption,
  type ListColumn,
} from "@/components/opensvc/CollectorList";
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
import { filterQuery, filtersKey, type ColumnFilters } from "@/lib/column-filters";
import { STATS_LIMIT, toValueStats, type ValueStats } from "@/lib/api/value-stats";
import { useViewPrefs, withSavedSearch } from "@/lib/user-prefs";
import { useEffectivePrivileges } from "@/lib/api/effective-privileges";
import { FieldConstraintPanel } from "./FieldConstraintPanel";
import { KINDS, KIND_INFO, isKind } from "./kinds";
import {
  FIELD_CONSTRAINTS_KEY,
  useFieldConstraints,
  type FieldConstraintMode,
} from "./use-field-constraints";

type FieldConstraintRow = components["schemas"]["FieldConstraintRow"];

/** Values shown in the cell before the rest is summed up. */
const PREVIEW = 4;

const DEFAULT_SORT = ["object_kind", "field"];

const PROPS = [
  "object_kind",
  "field",
  "mode",
  "allowed",
  "value_count",
  "updated",
  "updated_by",
  "pattern",
  "values",
] as const satisfies readonly (keyof FieldConstraintRow)[];

const DEFAULT_COLS: string[] = [
  "object_kind",
  "field",
  "mode",
  "allowed",
  "value_count",
  "updated",
  "updated_by",
];

const NUMERIC_PROPS = new Set<string>(["value_count"]);

const FAMILY: Record<string, ColumnFamily> = {
  field: "node",
  mode: "state",
  allowed: "state",
  value_count: "state",
  pattern: "state",
  values: "state",
  object_kind: "node",
  updated: "time",
  updated_by: "team",
};

const MODES: FieldConstraintMode[] = ["suggest", "strict", "regex"];

const MODE_OPTIONS: ColumnFilterOption[] = MODES.map((mode) => ({
  value: mode,
  labelKey: `fieldConstraints.modes.${mode}`,
}));

const KIND_OPTIONS: ColumnFilterOption[] = KINDS.map((kind) => ({
  value: kind,
  labelKey: KIND_INFO[kind].labelKey,
}));

/** The id of a row, and of the constraint in the URL: its kind and its attribute. */
function rowKey(kind: string | undefined, field: string | undefined): string | undefined {
  return kind === undefined || field === undefined ? undefined : `${kind}.${field}`;
}

/** The kind of object of a constraint: the name of its view, then its table. */
function KindLabel({ kind }: { kind: string | undefined }) {
  const { t } = useTranslation();
  if (!isKind(kind)) return kind;
  return (
    <span>
      {t(KIND_INFO[kind].labelKey)} <code className="text-ink-muted">{KIND_INFO[kind].table}</code>
    </span>
  );
}

/** A symbol per mode, beside its name. */
const MODE_SYMBOLS: Record<FieldConstraintMode, string> = {
  suggest: "▤",
  strict: "■",
  regex: "✱",
};

function isMode(value: string | undefined): value is FieldConstraintMode {
  return value === "suggest" || value === "strict" || value === "regex";
}

/** The mode in words, marked by a symbol as well. */
function ModeLabel({ mode }: { mode: string | undefined }) {
  const { t } = useTranslation();
  if (!isMode(mode)) return mode;
  return (
    <span className="font-medium">
      <span aria-hidden="true">{MODE_SYMBOLS[mode]} </span>
      {t(`fieldConstraints.modes.${mode}`)}
    </span>
  );
}

/** The attribute: its name in its detail panel, then its column. */
function FieldLabel({ kind, field }: { kind: string | undefined; field: string | undefined }) {
  const { t } = useTranslation();
  if (field === undefined) return undefined;
  return (
    <span>
      {isKind(kind) && (
        <span className="font-medium">{t(`${KIND_INFO[kind].fieldPrefix}.${field}`)}</span>
      )}{" "}
      <code className="text-ink-muted">{field}</code>
    </span>
  );
}

/** The values of a list, from the JSON of the row. */
function parseValues(raw: string | undefined): string[] {
  if (raw === undefined) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

/** What the constraint allows: its pattern, or the first values of its list. */
function AllowedCell({ row }: { row: FieldConstraintRow }) {
  const { t } = useTranslation();
  if (row.mode === "regex") return <code className="break-all">{row.pattern ?? row.allowed}</code>;
  const values = parseValues(row.values);
  const rest = values.length - PREVIEW;
  return (
    <span>
      {values.slice(0, PREVIEW).join(", ")}
      {rest > 0 && (
        <span className="text-ink-muted"> {t("fieldConstraints.more", { count: rest })}</span>
      )}
    </span>
  );
}

const COLUMNS: ListColumn<FieldConstraintRow>[] = PROPS.map((prop) => ({
  prop,
  labelKey: `fieldConstraints.fields.${prop}`,
  numeric: NUMERIC_PROPS.has(prop),
  family: FAMILY[prop] ?? "state",
  filter:
    prop === "mode"
      ? { kind: "enum", options: MODE_OPTIONS }
      : prop === "object_kind"
        ? { kind: "enum", options: KIND_OPTIONS }
        : undefined,
  render: (row: FieldConstraintRow, locale: string) => {
    if (prop === "object_kind") return <KindLabel kind={row.object_kind} />;
    if (prop === "field") return <FieldLabel kind={row.object_kind} field={row.field} />;
    if (prop === "mode") return <ModeLabel mode={row.mode} />;
    if (prop === "allowed") return <AllowedCell row={row} />;
    if (prop === "updated") return <DateTime value={row.updated} locale={locale} />;
    // A pattern has no list: no count rather than 0.
    if (prop === "value_count" && row.mode === "regex") return undefined;
    if (prop === "pattern" || prop === "values")
      return row[prop] === "" ? undefined : <code className="break-all">{row[prop]}</code>;
    const value = row[prop];
    return value === null ? undefined : value;
  },
}));

const ALL_PROPS = COLUMNS.map((column) => column.prop);

function queryProps(cols: string[] | undefined): string {
  // The cell of what is allowed needs the mode, the pattern and the values.
  return [
    ...new Set([
      "object_kind",
      "field",
      "mode",
      "pattern",
      "values",
      ...visibleProps(cols, DEFAULT_COLS, ALL_PROPS),
    ]),
  ].join(",");
}

/** One page of the constraints, with the sort, filters and columns of `search`. */
async function fetchConstraints(search: ResolvedListSearch) {
  const { data, error } = await api.GET("/field_constraints", {
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
  const all: FieldConstraintRow[] = Array.isArray(data.data) ? data.data : [];
  return toPage(all, data.meta, search.limit);
}

/**
 * The distribution of a column's values over the constraints the filters given
 * keep, for its filter: the pagination does not apply.
 */
async function constraintStats(prop: string, filters: ColumnFilters): Promise<ValueStats> {
  const query = { props: prop, stats: "1", limit: STATS_LIMIT, filter: filterQuery(filters) };
  const response = await api.GET("/field_constraints", { params: { query } });
  if (response.error !== undefined) throw new Error(JSON.stringify(response.error));
  return toValueStats(response.data.data, response.data.meta, prop);
}

/**
 * The attributes whose values are constrained, of nodes, services and apps, in the
 * collector list of the other views: per attribute, a list of values (suggested or
 * strict) or a pattern.
 * An attribute without a constraint is free text, the default, and has no row: a
 * Manager adds a constraint to one, or removes it, which makes it free text again.
 * The row chosen opens its panel; the others read it there.
 *
 * The historical collector had no such constraints: an extension, see MIGRATION.md.
 */
export function FieldConstraintsPage() {
  const { t } = useTranslation();
  const prefs = useViewPrefs("fieldConstraints");
  const search = resolveListSearch(
    withSavedSearch(useSearch({ from: "/field-constraints" }), prefs),
    DEFAULT_SORT,
  );
  const navigate = useNavigate({ from: "/field-constraints" });
  const list = useQuery({
    queryKey: [
      FIELD_CONSTRAINTS_KEY,
      "list",
      search.sort,
      search.offset,
      search.limit,
      search.cols,
      filtersKey(search.filters),
    ],
    placeholderData: keepPreviousData,
    queryFn: () => fetchConstraints(search),
  });
  // The constraint opened, typed, from the constraints of its kind.
  const [selKind, selField] = (search.sel ?? "").split(".", 2);
  const openKind = isKind(selKind) ? selKind : undefined;
  const constraints = useFieldConstraints(openKind);
  const privileges = useEffectivePrivileges();
  const canEdit = privileges.data?.has("Manager") === true;
  const [creating, setCreating] = useState(false);
  const current = creating ? undefined : constraints.data?.data.find((c) => c.field === selField);

  function update(next: Partial<ResolvedListSearch>) {
    // Choosing a row ends a creation in progress: the drawers share an edge.
    if (next.sel !== undefined) setCreating(false);
    prefs.saveSearch(next);
    void navigate({
      search: (previous) => mergeSearch(previous, next),
      resetScroll: resetsScroll(next),
    });
  }

  return (
    <section>
      <div className="mb-3 flex items-center gap-3">
        <h1 className="flex items-center gap-2 text-title font-semibold">
          <ObjectIcon kind="fieldConstraint" className="h-5 w-5" />
          {t("fieldConstraints.title")}
        </h1>
        {canEdit && (
          <button
            type="button"
            onClick={() => {
              update({ sel: undefined });
              setCreating(true);
            }}
            className="h-7 rounded-(--radius-control) bg-accent px-3 font-medium text-accent-ink disabled:opacity-60"
          >
            {t("fieldConstraints.add")}
          </button>
        )}
      </div>
      <p className="mb-3 max-w-3xl text-ink-muted">{t("fieldConstraints.intro")}</p>

      <CollectorList
        valueStats={constraintStats}
        columns={COLUMNS}
        defaultCols={DEFAULT_COLS}
        rows={list.data?.rows ?? []}
        rowId={(row) => rowKey(row.object_kind, row.field)}
        search={search}
        onChange={update}
        isPending={list.isPending}
        isFetching={list.isFetching}
        errorMessage={list.isError ? list.error.message : null}
        hasMore={list.data?.hasMore ?? false}
        exportPage={(page) => fetchConstraints({ ...search, ...page })}
        total={list.data?.total}
        filterable
      />

      <FieldConstraintPanel
        open={creating || current !== undefined}
        constraint={current}
        canEdit={canEdit}
        onClose={() => {
          setCreating(false);
          update({ sel: undefined });
        }}
      />
    </section>
  );
}
