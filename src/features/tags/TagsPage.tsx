import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { DateTime } from "@/components/ui/DateTime";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { SelectionDeleteMenu } from "@/components/opensvc/SelectionDeleteMenu";
import { problemText } from "@/lib/api/problem";
import { api } from "@/lib/api/client";
import { toPage } from "@/lib/api/page";
import { CollectorList, type ListColumn } from "@/components/opensvc/CollectorList";
import { ObjectIcon } from "@/components/opensvc/ObjectIcon";
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
import { TagCreatePanel } from "./TagCreatePanel";
import { TagDetailPanel } from "./TagDetailPanel";
import { toTagRows, type TagRow } from "./tag-row";
import { useTag } from "./use-tag";

const DEFAULT_SORT = ["tag_name"];

/**
 * Props exposed by apicollector for a tag. `id`, the integer id, is refused by the
 * API ("prop "id" is not allowed"), although it is what editing and deletion expect:
 * this view therefore lists and creates, but neither edits nor deletes. See notes.md.
 */
const TAG_PROPS = ["tag_name", "tag_exclude", "tag_data", "tag_created", "tag_id"] as const;

const DEFAULT_COLS: string[] = ["tag_name", "tag_exclude", "tag_created"];

const FAMILY: Record<string, "team" | "time"> = {
  tag_name: "team",
  tag_exclude: "team",
  tag_data: "team",
  tag_id: "team",
  tag_created: "time",
};

const COLUMNS: ListColumn<TagRow>[] = TAG_PROPS.map((prop) => ({
  prop,
  labelKey: `tags.fields.${prop}`,
  family: FAMILY[prop] ?? "team",
  render: (row: TagRow) =>
    prop === "tag_created" ? <DateTime value={row.tag_created} /> : row[prop],
}));

const ALL_PROPS = COLUMNS.map((column) => column.prop);

function queryProps(cols: string[] | undefined): string {
  return [...new Set(["tag_id", ...visibleProps(cols, DEFAULT_COLS, ALL_PROPS)])].join(",");
}

/**
 * One page of the list, read with the sort, the filters and the columns of `search`.
 * The view reads the page on display with it, and the export every page in turn.
 */
async function fetchTags(search: ResolvedListSearch) {
  // One row more than the page: apicollector does not return the total of a selection.
  const { data, error } = await api.GET("/tags", {
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
  const all = toTagRows(data.data);
  return toPage(all, data.meta, search.limit);
}

/**
 * The distribution of a column's values over the tags the filters given keep,
 * for its filter: the pagination does not apply.
 */
async function tagStats(prop: string, filters: ColumnFilters): Promise<ValueStats> {
  const query = { props: prop, stats: "1", limit: STATS_LIMIT, filter: filterQuery(filters) };
  const response = await api.GET("/tags", { params: { query } });
  if (response.error !== undefined) throw new Error(problemText(response.error));
  return toValueStats(response.data.data, response.data.meta, prop);
}

function useTags(search: ResolvedListSearch) {
  return useQuery({
    queryKey: [
      "tags",
      search.sort,
      search.offset,
      search.limit,
      search.cols,
      filtersKey(search.filters),
    ],
    // The rows on display stay while the next ones load: typing a filter must not
    // empty the table under the field.
    placeholderData: keepPreviousData,
    queryFn: () => fetchTags(search),
  });
}

export function TagsPage() {
  const { t } = useTranslation();
  const prefs = useViewPrefs("tags");
  const search = resolveListSearch(
    withSavedSearch(useSearch({ from: "/tags" }), prefs),
    DEFAULT_SORT,
  );
  const navigate = useNavigate({ from: "/tags" });
  const { data, isPending, isError, error, isFetching } = useTags(search);
  // The rows checked, and those just deleted, for the list to untick them.
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleted, setDeleted] = useState<string[]>([]);
  // Names from the page on display: a selection extended to the following pages does
  // not have them all, so the id then serves as a fallback in the messages.
  const names = new Map<string, string>();
  for (const row of data?.rows ?? []) {
    const id = row.tag_id;
    if (id !== undefined && row.tag_name !== undefined) names.set(id, row.tag_name);
  }

  /** Ids of the whole selection, filters included, without pagination. */
  async function allIds(): Promise<string[]> {
    const { data, error } = await api.GET("/tags", {
      params: { query: { props: "tag_id", limit: 0, filter: filterQuery(search.filters) } },
    });
    if (error !== undefined) throw new Error(JSON.stringify(error));
    return toTagRows(data.data).map((row) => row.tag_id);
  }

  function update(next: Partial<ResolvedListSearch>) {
    // Choosing a row ends a creation in progress: the row's detail takes the right
    // edge, where the two drawers would otherwise overlap.
    if (next.sel !== undefined) setCreating(false);
    // Columns, sort, filters and page size follow the account, the other states
    // stay in the URL.
    prefs.saveSearch(next);
    void navigate({
      search: (previous) => mergeSearch(previous, next),
      resetScroll: resetsScroll(next),
    });
  }

  const [creating, setCreating] = useState(false);
  // The detail reads the whole tag: the page row only holds the visible columns, and
  // a tag outside the page, such as one just created, is not among them.
  const pageRow = data?.rows.find((row) => row.tag_id === search.sel);
  const full = useTag(search.sel);
  const selected = full.tag ?? pageRow;

  return (
    <section>
      <div className="mb-3 flex items-center gap-3">
        <h1 className="flex items-center gap-2 text-title font-semibold">
          <ObjectIcon kind="tags" className="h-5 w-5" />
          {t("tags.title")}
        </h1>
        <button
          type="button"
          onClick={() => {
            // The drawers share the right edge: opening the creation closes the detail.
            update({ sel: undefined });
            setCreating(true);
          }}
          className="h-7 rounded-(--radius-control) bg-accent px-3 font-medium text-accent-ink"
        >
          {t("tags.create.open")}
        </button>
        {/* On the rows checked in the list; nothing checked, no menu. */}
        <SelectionDeleteMenu
          targets={selectedIds.map((id) => ({ id, name: names.get(id) ?? id }))}
          prefix="tags.actions"
          privileges={["TagManager"]}
          remove={async (id) => {
            const { error } = await api.DELETE("/tags/{tag_id}", {
              params: { path: { tag_id: id } },
            });
            return error === undefined ? null : problemText(error);
          }}
          invalidate={[["tags"]]}
          onDeleted={(ids) => {
            setDeleted(ids);
            // The detail of a deleted object has nothing left to show.
            if (search.sel !== undefined && ids.includes(search.sel)) update({ sel: undefined });
          }}
        />
      </div>

      <CollectorList
        viewPrefs={prefs}
        valueStats={tagStats}
        columns={COLUMNS}
        defaultCols={DEFAULT_COLS}
        rows={data?.rows ?? []}
        rowId={(row) => row.tag_id}
        search={search}
        onChange={update}
        isPending={isPending}
        isFetching={isFetching}
        errorMessage={isError ? error.message : null}
        hasMore={data?.hasMore ?? false}
        exportPage={(page) => fetchTags({ ...search, ...page })}
        total={data?.total}
        selectAllMatching={allIds}
        onSelectionChange={setSelectedIds}
        unselect={deleted}
        filterable
      />

      <TagCreatePanel
        open={creating}
        onClose={() => {
          setCreating(false);
        }}
        onCreated={(tagId) => {
          // The new tag opens in the detail.
          if (tagId !== undefined && tagId !== "") update({ sel: tagId });
        }}
      />

      <TagDetailPanel
        tag={creating ? undefined : selected}
        onClose={() => {
          update({ sel: undefined });
        }}
      />
    </section>
  );
}
