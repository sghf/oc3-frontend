import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { components } from "@/lib/api/schema";
import { api } from "@/lib/api/client";
import { useFiltersets } from "@/lib/api/filtersets";
import { problemText } from "@/lib/api/problem";
import { ObjectIcon } from "@/components/opensvc/ObjectIcon";
import { CloseIcon } from "@/components/ui/icons";
import type { FilterDefinition } from "@/features/filters/filter-definition";
import { FILTERSET_KEY, LOG_OPS, isLogOp, useFiltersetEntries, type LogOp } from "./filterset-api";
import { NewFilterForm } from "./NewFilterForm";

type FiltersetExportEntry = components["schemas"]["FiltersetExportEntry"];
type FilterRow = components["schemas"]["FilterRow"];

const CONTROL = "h-7 rounded-(--radius-control) border border-line bg-surface px-1";
const ICON_BUTTON =
  "flex h-7 w-7 items-center justify-center rounded-(--radius-control) border border-line text-ink-muted hover:text-ink disabled:opacity-40";

function entryKey(entry: FiltersetExportEntry): string {
  return entry.filter !== null && entry.filter !== undefined
    ? `f:${String(entry.filter.id)}`
    : `s:${entry.filterset ?? ""}`;
}

function entryLabel(entry: FiltersetExportEntry): string {
  const f = entry.filter;
  return f !== null && f !== undefined
    ? `${f.f_table}.${f.f_field} ${f.f_op} ${f.f_value}`
    : (entry.filterset ?? "");
}

function useFilters() {
  return useQuery({
    queryKey: ["filters", "all-labels"],
    queryFn: async () => {
      const { data, error } = await api.GET("/filters", {
        params: { query: { props: "id,f_label", orderby: "f_label", limit: 0 } },
      });
      if (error !== undefined) throw new Error(problemText(error));
      const rows: FilterRow[] = Array.isArray(data.data) ? data.data : [];
      return rows;
    },
  });
}

/**
 * Entries of a filterset, in order: filters and nested filtersets, each joined to the
 * previous one by a logical operator.
 *
 * Every change is an attach call: `POST` on an existing entry updates its position
 * and its operator, `DELETE` detaches it. A filter may also be written in place
 * ("New filter…"), created then attached in one go, or reused when one has its
 * definition already; the entry it makes is highlighted a moment. A move renumbers the whole list from 1 to n
 * and sends only the positions that change: the stored positions may have gaps or
 * duplicates.
 */
export function FiltersetComposition({
  filtersetId,
  filtersetName,
}: {
  filtersetId: string;
  filtersetName: string;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const entries = useFiltersetEntries(filtersetId);
  const filters = useFilters();
  const filtersets = useFiltersets();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [kind, setKind] = useState<"filter" | "filterset" | "new">("filter");
  const kindSelect = useRef<HTMLSelectElement>(null);
  // The entry a written filter has just made, highlighted a moment.
  const [highlight, setHighlight] = useState<string | null>(null);
  useEffect(() => {
    if (highlight === null) return;
    const timer = window.setTimeout(() => {
      setHighlight(null);
    }, 2500);
    return () => {
      window.clearTimeout(timer);
    };
  }, [highlight]);
  const [target, setTarget] = useState("");
  const [newOp, setNewOp] = useState<LogOp>("AND");

  const list = entries.data ?? [];

  async function attach(entry: { filter?: number; filterset?: string }, order: number, op: string) {
    const body = { f_order: order, f_log_op: isLogOp(op) ? op : "AND" };
    const result =
      entry.filter !== undefined
        ? await api.POST("/filtersets/{filterset_id}/filters/{f_id}", {
            params: { path: { filterset_id: filtersetId, f_id: String(entry.filter) } },
            body,
          })
        : await api.POST("/filtersets/{filterset_id}/filtersets/{child_id}", {
            params: { path: { filterset_id: filtersetId, child_id: entry.filterset ?? "" } },
            body,
          });
    if (result.error !== undefined) throw new Error(problemText(result.error));
  }

  function ref(entry: FiltersetExportEntry) {
    return entry.filter !== null && entry.filter !== undefined
      ? { filter: entry.filter.id }
      : { filterset: entry.filterset ?? "" };
  }

  /** Chains calls, then reads again everything the composition influences. */
  async function run(steps: () => Promise<void>) {
    setBusy(true);
    setFailure(null);
    try {
      await steps();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    } finally {
      await queryClient.invalidateQueries({ queryKey: [FILTERSET_KEY] });
      // The lists filtered by this filterset change their content.
      await queryClient.invalidateQueries({ queryKey: ["nodes"] });
      await queryClient.invalidateQueries({ queryKey: ["services"] });
      setBusy(false);
    }
  }

  function move(index: number, offset: number) {
    const reordered = [...list];
    const [moved] = reordered.splice(index, 1);
    if (moved === undefined) return;
    reordered.splice(index + offset, 0, moved);
    void run(async () => {
      for (const [position, entry] of reordered.entries()) {
        if (entry.f_order !== position + 1) await attach(ref(entry), position + 1, entry.f_log_op);
      }
    });
  }

  function changeOp(entry: FiltersetExportEntry, op: string) {
    void run(() => attach(ref(entry), entry.f_order, op));
  }

  function remove(entry: FiltersetExportEntry) {
    void run(async () => {
      const result =
        entry.filter !== null && entry.filter !== undefined
          ? await api.DELETE("/filtersets/{filterset_id}/filters/{f_id}", {
              params: { path: { filterset_id: filtersetId, f_id: String(entry.filter.id) } },
            })
          : await api.DELETE("/filtersets/{filterset_id}/filtersets/{child_id}", {
              params: { path: { filterset_id: filtersetId, child_id: entry.filterset ?? "" } },
            });
      if (result.error !== undefined) throw new Error(problemText(result.error));
    });
  }

  const nextOrder = () => list.reduce((max, entry) => Math.max(max, entry.f_order), 0) + 1;

  // Back from the written filter, the kind list takes the focus once enabled again:
  // it is disabled while the filter is being attached.
  const [refocus, setRefocus] = useState(false);
  useEffect(() => {
    if (!refocus || busy) return;
    kindSelect.current?.focus();
    setRefocus(false);
  }, [refocus, busy]);

  /** Back from the written filter to the add row, its kind list focused. */
  function closeNewFilter() {
    setKind("filter");
    setRefocus(true);
  }

  /** Creates the filter written, unless one has its definition, then attaches it. */
  function addNewFilter(definition: FilterDefinition, existing: number | undefined) {
    void run(async () => {
      let id = existing;
      if (id === undefined) {
        const { data, error } = await api.POST("/filters", { body: definition });
        if (error !== undefined) throw new Error(problemText(error));
        id = Array.isArray(data.data) ? data.data[0]?.id : undefined;
        if (id === undefined) throw new Error(t("filtersets.newFilter.noId"));
        // The Filters view, and the suggestions of the next one, know it.
        await queryClient.invalidateQueries({ queryKey: ["filters"] });
      }
      await attach({ filter: id }, nextOrder(), newOp);
      setHighlight(`f:${String(id)}`);
      closeNewFilter();
    });
  }

  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (target === "" || kind === "new") return;
    const order = nextOrder();
    void run(async () => {
      await attach(
        kind === "filter" ? { filter: Number(target) } : { filterset: target },
        order,
        newOp,
      );
      setTarget("");
    });
  }

  const attachedFilters = new Set(list.flatMap((entry) => (entry.filter ? [entry.filter.id] : [])));
  const attachedFiltersets = new Set(
    list.flatMap((entry) => (entry.filterset ? [entry.filterset] : [])),
  );
  const filterOptions = (filters.data ?? []).filter(
    (row) => row.id !== undefined && !attachedFilters.has(row.id),
  );
  // The table the filterset filters most: where a new filter likely goes.
  const tableCounts = new Map<string, number>();
  for (const entry of list)
    if (entry.filter?.f_table !== undefined)
      tableCounts.set(entry.filter.f_table, (tableCounts.get(entry.filter.f_table) ?? 0) + 1);
  const mostFilteredTable =
    [...tableCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "nodes";

  const filtersetOptions = (filtersets.data ?? []).filter(
    (name) => name !== filtersetName && !attachedFiltersets.has(name),
  );

  return (
    <section aria-busy={busy}>
      <h3 className="mb-1 flex items-center gap-2 font-semibold text-ink-muted">
        <ObjectIcon kind="filter" />
        {t("filtersets.composition.title")}
      </h3>
      <p className="mb-2 text-ink-muted">{t("filtersets.composition.intro")}</p>

      {entries.isPending && <p className="text-ink-muted">{t("detail.loading")}</p>}
      {entries.isError && (
        <p role="alert" className="text-state-down">
          ■ {entries.error.message}
        </p>
      )}
      {entries.isSuccess && list.length === 0 && (
        <p className="text-ink-muted">{t("filtersets.composition.empty")}</p>
      )}

      {list.length > 0 && (
        <ol className="mb-3 flex flex-col gap-1">
          {list.map((entry, index) => {
            const label = entryLabel(entry);
            const isFilterset = entry.filter === null || entry.filter === undefined;
            return (
              <li
                key={entryKey(entry)}
                className={`flex items-center gap-1.5 rounded-(--radius-control) transition-colors duration-700 ${
                  highlight === entryKey(entry) ? "bg-accent-soft" : ""
                }`}
              >
                <span className="w-5 text-right text-ink-muted tabular-nums">{index + 1}</span>
                <select
                  aria-label={t("filtersets.composition.operatorFor", { label })}
                  value={entry.f_log_op}
                  disabled={busy}
                  onChange={(event) => {
                    changeOp(entry, event.target.value);
                  }}
                  className={`${CONTROL} w-24`}
                >
                  {!isLogOp(entry.f_log_op) && (
                    <option value={entry.f_log_op}>{entry.f_log_op}</option>
                  )}
                  {LOG_OPS.map((op) => (
                    <option key={op} value={op}>
                      {op}
                    </option>
                  ))}
                </select>
                <span className="flex min-w-0 flex-1 items-center gap-1.5">
                  <ObjectIcon kind={isFilterset ? "filterset" : "filter"} />
                  {isFilterset ? (
                    <Link
                      to="/filtersets"
                      search={{ sel: entry.filterset ?? "" }}
                      className="truncate underline decoration-line underline-offset-2"
                      title={t("filtersets.composition.openFilterset")}
                    >
                      {label}
                    </Link>
                  ) : (
                    <code className="truncate">{label}</code>
                  )}
                </span>
                <button
                  type="button"
                  disabled={busy || index === 0}
                  onClick={() => {
                    move(index, -1);
                  }}
                  title={t("filtersets.composition.up", { label })}
                  className={ICON_BUTTON}
                >
                  <span aria-hidden="true">↑</span>
                  <span className="sr-only">{t("filtersets.composition.up", { label })}</span>
                </button>
                <button
                  type="button"
                  disabled={busy || index === list.length - 1}
                  onClick={() => {
                    move(index, 1);
                  }}
                  title={t("filtersets.composition.down", { label })}
                  className={ICON_BUTTON}
                >
                  <span aria-hidden="true">↓</span>
                  <span className="sr-only">{t("filtersets.composition.down", { label })}</span>
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    remove(entry);
                  }}
                  title={t("filtersets.composition.remove", { label })}
                  className={ICON_BUTTON}
                >
                  <CloseIcon />
                  <span className="sr-only">{t("filtersets.composition.remove", { label })}</span>
                </button>
              </li>
            );
          })}
        </ol>
      )}

      <form onSubmit={add} className="flex flex-wrap items-center gap-1.5">
        <select
          aria-label={t("filtersets.composition.addOperator")}
          value={newOp}
          disabled={busy}
          onChange={(event) => {
            if (isLogOp(event.target.value)) setNewOp(event.target.value);
          }}
          className={`${CONTROL} w-24`}
        >
          {LOG_OPS.map((op) => (
            <option key={op} value={op}>
              {op}
            </option>
          ))}
        </select>
        <select
          ref={kindSelect}
          aria-label={t("filtersets.composition.addKind")}
          value={kind}
          disabled={busy}
          onChange={(event) => {
            const value = event.target.value;
            setKind(value === "filterset" ? "filterset" : value === "new" ? "new" : "filter");
            setTarget("");
          }}
          className={CONTROL}
        >
          <option value="filter">{t("filtersets.composition.kindFilter")}</option>
          <option value="filterset">{t("filtersets.composition.kindFilterset")}</option>
          <option value="new">{t("filtersets.composition.kindNewFilter")}</option>
        </select>
        {kind !== "new" && (
          <>
            <select
              aria-label={t("filtersets.composition.addTarget")}
              value={target}
              disabled={busy}
              onChange={(event) => {
                setTarget(event.target.value);
              }}
              className={`${CONTROL} min-w-0 flex-1`}
            >
              <option value="">{t("filtersets.composition.choose")}</option>
              {kind === "filter"
                ? filterOptions.map((row) => (
                    <option key={row.id} value={String(row.id)}>
                      {row.f_label}
                    </option>
                  ))
                : filtersetOptions.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
            </select>
            <button
              type="submit"
              disabled={busy || target === ""}
              className="h-7 rounded-(--radius-control) bg-accent px-3 font-medium text-accent-ink disabled:opacity-60"
            >
              {t("filtersets.composition.add")}
            </button>
          </>
        )}
      </form>

      {kind === "new" && (
        <NewFilterForm
          initialTable={mostFilteredTable}
          busy={busy}
          onSubmit={addNewFilter}
          onCancel={closeNewFilter}
        />
      )}

      {failure !== null && (
        <p role="alert" className="mt-2 text-state-down">
          ■ {failure}
        </p>
      )}
    </section>
  );
}
