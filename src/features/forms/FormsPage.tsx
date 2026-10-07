import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";
import { toPage } from "@/lib/api/page";
import {
  CollectorList,
  type ColumnFilterOption,
  type ListColumn,
} from "@/components/opensvc/CollectorList";
import { ObjectIcon } from "@/components/opensvc/ObjectIcon";
import type { ColumnFamily } from "@/components/opensvc/ColumnFamily";
import { DateTime } from "@/components/ui/DateTime";
import { filterQuery, filtersKey } from "@/lib/column-filters";
import {
  resolveListSearch,
  resetsScroll,
  mergeSearch,
  visibleProps,
  type ResolvedListSearch,
} from "@/lib/list-search";
import { useViewPrefs, withSavedSearch } from "@/lib/user-prefs";
import { FormDetailPanel } from "./FormDetailPanel";
import { FormFormPanel } from "./FormFormPanel";
import { FORM_TYPES, useForm, type FormRow } from "./use-form";

/** Grouped by folder, as the historical forms tree. */
const DEFAULT_SORT = ["form_folder", "form_name"];

const FORM_PROPS = [
  "form_name",
  "form_type",
  "form_folder",
  "form_author",
  "form_created",
  "id",
] as const satisfies readonly (keyof FormRow)[];

const DEFAULT_COLS: string[] = [
  "form_name",
  "form_type",
  "form_folder",
  "form_author",
  "form_created",
];

const FAMILY: Record<string, ColumnFamily> = {
  form_name: "state",
  form_type: "state",
  form_folder: "state",
  form_author: "team",
  form_created: "time",
  id: "state",
};

/** The types of a form, named in the filter; the cells show the code. */
const TYPE_OPTIONS: ColumnFilterOption[] = FORM_TYPES.map((value) => ({
  value,
  labelKey: `forms.types.${value}`,
}));

const COLUMNS: ListColumn<FormRow>[] = FORM_PROPS.map((prop) => ({
  prop,
  labelKey: `forms.fields.${prop}`,
  numeric: prop === "id",
  family: FAMILY[prop] ?? "state",
  filter: prop === "form_type" ? { kind: "enum" as const, options: TYPE_OPTIONS } : undefined,
  render: (row: FormRow, locale: string) => {
    if (prop === "form_created") return <DateTime value={row.form_created} locale={locale} />;
    if (prop === "form_folder") return <code>{row.form_folder}</code>;
    return row[prop];
  },
}));

const ALL_PROPS = COLUMNS.map((column) => column.prop);

function queryProps(cols: string[] | undefined): string {
  return [...new Set(["id", "form_name", ...visibleProps(cols, DEFAULT_COLS, ALL_PROPS)])].join(
    ",",
  );
}

/**
 * One page of the list, read with the sort, the filters and the columns of `search`.
 * The view reads the page on display with it, and the export every page in turn.
 */
async function fetchForms(search: ResolvedListSearch) {
  const { data, error } = await api.GET("/forms", {
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
  const all: FormRow[] = Array.isArray(data.data) ? data.data : [];
  return toPage(all, data.meta, search.limit);
}

function useForms(search: ResolvedListSearch) {
  return useQuery({
    queryKey: [
      "forms",
      search.sort,
      search.offset,
      search.limit,
      search.cols,
      filtersKey(search.filters),
    ],
    placeholderData: keepPreviousData,
    queryFn: () => fetchForms(search),
  });
}

/**
 * Forms of the collector: their definition, in YAML, describes the inputs a
 * submission expects and the outputs it runs. The list shows the forms published
 * to one of the user's groups, every form for a manager; creating and changing
 * them requires the FormsManager privilege, which the API checks.
 */
export function FormsPage() {
  const { t } = useTranslation();
  const prefs = useViewPrefs("forms");
  const search = resolveListSearch(
    withSavedSearch(useSearch({ from: "/forms" }), prefs),
    DEFAULT_SORT,
  );
  const navigate = useNavigate({ from: "/forms" });
  const { data, isPending, isError, error, isFetching } = useForms(search);
  // A single form: creation when nothing is selected, editing otherwise.
  const [panel, setPanel] = useState<"create" | "edit" | null>(null);
  const selectedForm = useForm(panel === "edit" ? search.sel : undefined);

  async function allIds(): Promise<string[]> {
    const { data, error } = await api.GET("/forms", {
      params: { query: { props: "id", limit: 0, filter: filterQuery(search.filters) } },
    });
    if (error !== undefined) throw new Error(problemText(error));
    const rows: FormRow[] = Array.isArray(data.data) ? data.data : [];
    return rows
      .map((row) => row.id)
      .filter((id): id is number => id !== undefined)
      .map(String);
  }

  function update(next: Partial<ResolvedListSearch>) {
    // Choosing a row ends a creation in progress: the row's detail takes the right
    // edge, where the two drawers would otherwise overlap.
    if (next.sel !== undefined) {
      if (panel === "create") setPanel(null);
    }
    // Columns, sort, filters and page size follow the account, the other states
    // stay in the URL.
    prefs.saveSearch(next);
    void navigate({
      search: (previous) => mergeSearch(previous, next),
      resetScroll: resetsScroll(next),
    });
  }

  const selected = data?.rows.find((row) => String(row.id) === search.sel);

  return (
    <section>
      <div className="mb-3 flex items-center gap-3">
        <h1 className="flex items-center gap-2 text-title font-semibold">
          <ObjectIcon kind="form" className="h-5 w-5" />
          {t("forms.title")}
        </h1>
        <button
          type="button"
          onClick={() => {
            // The drawers share the right edge: opening the creation closes the detail.
            update({ sel: undefined });
            setPanel("create");
          }}
          className="h-7 rounded-(--radius-control) bg-accent px-3 font-medium text-accent-ink"
        >
          {t("forms.form.open")}
        </button>
      </div>
      <p className="mb-3 max-w-3xl text-ink-muted">{t("forms.intro")}</p>

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
        exportPage={(page) => fetchForms({ ...search, ...page })}
        total={data?.total}
        selectAllMatching={allIds}
        filterable
      />

      <FormDetailPanel
        formId={panel === null ? search.sel : undefined}
        name={selected?.form_name ?? ""}
        onClose={() => {
          update({ sel: undefined, tab: undefined });
        }}
        onEdit={() => {
          setPanel("edit");
        }}
        tab={search.tab}
        onTabChange={(tab) => {
          update({ tab });
        }}
      />

      <FormFormPanel
        open={panel === "create" || (panel === "edit" && selectedForm.data !== undefined)}
        form={panel === "edit" ? selectedForm.data : undefined}
        onClose={() => {
          setPanel(null);
        }}
        onSaved={(id) => {
          // After a creation, the new form opens in the detail.
          if (panel === "create" && id !== undefined) update({ sel: String(id) });
        }}
      />
    </section>
  );
}
