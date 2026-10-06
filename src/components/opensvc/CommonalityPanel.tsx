import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  compareRows,
  dateValue,
  numericValue,
  valueRange,
  type Attribute,
  type ValueGroup,
} from "@/lib/commonality";
import { copyText } from "@/lib/clipboard";
import { labelMatches, normalizeSearch } from "@/lib/label-search";
import { SlideOver } from "@/components/ui/SlideOver";
import { CheckIcon, SearchIcon } from "@/components/ui/icons";
import type { ListColumn } from "./CollectorList";
import { ColumnFamilyIcon } from "./ColumnFamily";
import { ObjectIcon, type ObjectKind } from "./ObjectIcon";

/** Rows compared at most: beyond, the browser would read too much. */
export const COMPARE_MAX = 1000;
/** Values of a differing attribute shown; the others are counted. */
const VALUES_SHOWN = 3;
/** Rows named as differing from the most held value, at most. */
const OUTLIERS_SHOWN = 5;

type Show = "all" | "shared" | "differing";

/**
 * The comparison of the rows selected in a list: each attribute with its
 * commonality, the share of the rows holding its most held value, the most
 * common first. A shared attribute shows its value; a differing one its most
 * held values with their count and share, the range of a number or a date, and
 * the rows standing apart from the others by name. The attributes empty in every
 * row are folded at the end.
 *
 * The values are rendered as the cells of the list render them. Each value of a
 * differing attribute narrows the selection: "Keep" ticks only its rows,
 * "Exclude" unticks them, for an action on the rows that remain. Read-only
 * otherwise; the rows are read again with every column, as the list on display
 * holds only its own.
 */
export function CommonalityPanel<T>({
  open,
  onClose,
  kind,
  noun,
  ids,
  queryKey,
  fetchRows,
  columns,
  exclude,
  rowId,
  rowName,
  onOpenRow,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  kind: ObjectKind;
  /** The rows, counted: "12 nodes". */
  noun: (count: number) => string;
  ids: readonly string[];
  /** Cache key of the rows, the ids aside. */
  queryKey: readonly unknown[];
  /** Reads the rows of `ids` with every column. */
  fetchRows: (ids: readonly string[]) => Promise<T[]>;
  columns: readonly ListColumn<T>[];
  /** Props left out: those holding one value per row, ids and names. */
  exclude: ReadonlySet<string>;
  rowId: (row: T) => string | undefined;
  rowName: (row: T) => string;
  onOpenRow: (id: string) => void;
  /** Ticks these rows in place of the selection. */
  onSelect: (ids: string[]) => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const [show, setShow] = useState<Show>("all");
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle");
  const tooMany = ids.length > COMPARE_MAX;

  const rows = useQuery({
    queryKey: [...queryKey, "compare", [...ids].sort().join(",")],
    queryFn: () => fetchRows(ids),
    enabled: open && ids.length >= 2 && !tooMany,
    staleTime: 30 * 1000,
  });

  const compared = useMemo(
    () => columns.filter((column) => !exclude.has(column.prop)),
    [columns, exclude],
  );
  const byProp = useMemo(
    () => new Map(compared.map((column) => [column.prop, column])),
    [compared],
  );
  const attributes = useMemo(
    () =>
      rows.data === undefined
        ? []
        : compareRows(
            rows.data,
            compared.map((column) => column.prop),
          ),
    [rows.data, compared],
  );

  const filled = attributes.filter((attribute) => !attribute.empty);
  const empty = attributes.filter((attribute) => attribute.empty);
  const sharedCount = filled.filter((attribute) => attribute.shared).length;
  // An attribute is found by its name in English or in French, without case nor accents.
  const needle = normalizeSearch(query.trim());
  const listed = filled.filter((attribute) => {
    if (show === "shared" && !attribute.shared) return false;
    if (show === "differing" && attribute.shared) return false;
    const column = byProp.get(attribute.prop);
    return needle === "" || (column !== undefined && labelMatches(i18n, column.labelKey, needle));
  });
  const total = rows.data?.length ?? 0;
  const percent = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 });

  function idsOf(group: ValueGroup<T>): string[] {
    return group.rows.flatMap((row) => {
      const id = rowId(row);
      return id === undefined ? [] : [id];
    });
  }

  function copy() {
    if (rows.data === undefined) return;
    const text = listed
      .map((attribute) => {
        const column = byProp.get(attribute.prop);
        const label = column === undefined ? attribute.prop : t(column.labelKey);
        const values = attribute.groups
          .map((group) => `${group.key ?? t("commonality.empty")} (${String(group.rows.length)})`)
          .join(", ");
        return `${label}\t${percent.format(attribute.share)}\t${values}`;
      })
      .join("\n");
    copyText(`${noun(total)}\n${text}\n`).then(
      () => {
        setCopied("copied");
      },
      () => {
        setCopied("failed");
      },
    );
    window.setTimeout(() => {
      setCopied("idle");
    }, 2000);
  }

  const shows: { key: Show; label: string }[] = [
    { key: "all", label: t("commonality.show.all", { count: filled.length }) },
    { key: "shared", label: t("commonality.show.shared", { count: sharedCount }) },
    {
      key: "differing",
      label: t("commonality.show.differing", { count: filled.length - sharedCount }),
    },
  ];

  return (
    <SlideOver
      open={open}
      title={t("commonality.title", { what: noun(ids.length) })}
      onClose={onClose}
      closeLabel={t("detail.close")}
      resizeLabel={t("detail.resize")}
      leading={<ObjectIcon kind={kind} />}
      size="wide"
      subheader={
        rows.data === undefined ? undefined : (
          <div className="flex flex-wrap items-center gap-2">
            <div role="radiogroup" aria-label={t("commonality.show.label")} className="flex gap-1">
              {shows.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  role="radio"
                  aria-checked={show === option.key}
                  onClick={() => {
                    setShow(option.key);
                  }}
                  className="h-7 rounded-(--radius-control) border border-line px-2 aria-checked:border-accent aria-checked:bg-accent-soft aria-checked:font-medium"
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="flex h-7 min-w-40 flex-1 items-center gap-1.5 rounded-(--radius-control) border border-line bg-surface px-2 text-ink-muted">
              <SearchIcon />
              <input
                type="search"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                }}
                placeholder={t("commonality.search")}
                aria-label={t("commonality.search")}
                className="w-full bg-transparent text-ink outline-none placeholder:text-ink-muted"
              />
            </div>
          </div>
        )
      }
    >
      {ids.length < 2 ? (
        <p className="text-ink-muted">{t("commonality.tooFew")}</p>
      ) : tooMany ? (
        <p role="alert" className="text-state-warn">
          ▲ {t("commonality.tooMany", { count: ids.length, max: COMPARE_MAX })}
        </p>
      ) : rows.isPending ? (
        <p className="text-ink-muted">{t("detail.loading")}</p>
      ) : rows.isError ? (
        <p role="alert" className="text-state-down">
          ■ {rows.error.message}
        </p>
      ) : (
        <>
          <p className="mb-3 text-ink-muted">
            {t("commonality.summary", {
              rows: noun(total),
              shared: sharedCount,
              differing: filled.length - sharedCount,
              empty: empty.length,
            })}
          </p>
          {total < ids.length && (
            <p className="mb-3 text-state-warn">
              ▲ {t("commonality.missing", { count: ids.length - total })}
            </p>
          )}
          {listed.length === 0 && <p className="text-ink-muted">{t("commonality.noMatch")}</p>}
          <ul className="flex flex-col divide-y divide-line">
            {listed.map((attribute) => {
              const column = byProp.get(attribute.prop);
              if (column === undefined) return null;
              return (
                <AttributeLine
                  key={attribute.prop}
                  attribute={attribute}
                  column={column}
                  total={total}
                  locale={locale}
                  percent={percent}
                  rowId={rowId}
                  rowName={rowName}
                  onOpenRow={onOpenRow}
                  onKeep={(group) => {
                    onSelect(idsOf(group));
                  }}
                  onExclude={(group) => {
                    const gone = new Set(idsOf(group));
                    onSelect(ids.filter((id) => !gone.has(id)));
                  }}
                  t={t}
                />
              );
            })}
          </ul>
          {empty.length > 0 && show !== "shared" && needle === "" && (
            <details className="mt-3 text-ink-muted">
              <summary className="cursor-pointer">
                {t("commonality.emptyInAll", { count: empty.length })}
              </summary>
              <p className="mt-1">
                {empty
                  .map((attribute) => {
                    const column = byProp.get(attribute.prop);
                    return column === undefined ? attribute.prop : t(column.labelKey);
                  })
                  .join(", ")}
              </p>
            </details>
          )}
          <div className="mt-4 flex items-center gap-2 border-t border-line pt-3">
            <button
              type="button"
              onClick={copy}
              className="h-7 rounded-(--radius-control) border border-line px-2"
            >
              <span aria-live="polite">
                {copied === "copied"
                  ? t("commonality.copied")
                  : copied === "failed"
                    ? t("commonality.copyFailed")
                    : t("commonality.copy")}
              </span>
            </button>
          </div>
        </>
      )}
    </SlideOver>
  );
}

/** One attribute: its name, its commonality, and its values. */
function AttributeLine<T>({
  attribute,
  column,
  total,
  locale,
  percent,
  rowId,
  rowName,
  onOpenRow,
  onKeep,
  onExclude,
  t,
}: {
  attribute: Attribute<T>;
  column: ListColumn<T>;
  total: number;
  locale: string;
  percent: Intl.NumberFormat;
  rowId: (row: T) => string | undefined;
  rowName: (row: T) => string;
  onOpenRow: (id: string) => void;
  onKeep: (group: ValueGroup<T>) => void;
  onExclude: (group: ValueGroup<T>) => void;
  t: TFunction;
}) {
  const [first] = attribute.groups;
  if (first === undefined) return null;
  const label = t(column.labelKey);
  const shown = attribute.groups.slice(0, VALUES_SHOWN);
  const others = attribute.groups.length - shown.length;
  const range =
    attribute.shared || attribute.groups.length < 3
      ? undefined
      : column.numeric === true
        ? valueRange(
            attribute.groups.flatMap((g) => g.rows),
            attribute.prop,
            numericValue,
          )
        : column.family === "time"
          ? valueRange(
              attribute.groups.flatMap((g) => g.rows),
              attribute.prop,
              dateValue,
            )
          : undefined;
  // The rows apart from the most held value, when they are few: by name.
  const apart = attribute.groups.slice(1).flatMap((group) => group.rows);
  const outliers = attribute.shared || apart.length > OUTLIERS_SHOWN ? [] : apart;

  return (
    <li className="py-2">
      <div className="flex items-start gap-2">
        <ColumnFamilyIcon family={column.family} />
        <span className="w-44 shrink-0 font-medium">{label}</span>
        <div className="min-w-0 flex-1">
          {attribute.shared ? (
            <ValueView group={first} column={column} locale={locale} t={t} />
          ) : (
            <ul className="flex flex-col gap-1">
              {shown.map((group) => (
                <li key={group.key ?? ""} className="group flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate">
                    <ValueView group={group} column={column} locale={locale} t={t} />
                  </span>
                  <span
                    aria-hidden="true"
                    className="h-2 w-20 shrink-0 rounded-full bg-surface-sunken"
                  >
                    <span
                      className="block h-full rounded-full bg-accent"
                      style={{ width: `${String((group.rows.length / total) * 100)}%` }}
                    />
                  </span>
                  <span className="w-8 shrink-0 text-right tabular-nums">{group.rows.length}</span>
                  <span className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        onKeep(group);
                      }}
                      title={t("commonality.keepHint", { count: group.rows.length })}
                      className="h-6 rounded-(--radius-control) border border-line px-1.5 text-ink-muted hover:text-ink"
                    >
                      {t("commonality.keep")}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onExclude(group);
                      }}
                      title={t("commonality.excludeHint", { count: group.rows.length })}
                      className="h-6 rounded-(--radius-control) border border-line px-1.5 text-ink-muted hover:text-ink"
                    >
                      {t("commonality.exclude")}
                    </button>
                  </span>
                </li>
              ))}
              {others > 0 && (
                <li className="text-ink-muted">{t("commonality.others", { count: others })}</li>
              )}
              {range !== undefined && (
                <li className="flex flex-wrap items-center gap-1 text-ink-muted">
                  {t("commonality.rangeFrom")}
                  <span className="text-ink">{column.render(range.min, locale)}</span>
                  {t("commonality.rangeTo")}
                  <span className="text-ink">{column.render(range.max, locale)}</span>
                </li>
              )}
              {outliers.length > 0 && (
                <li className="flex flex-wrap items-center gap-1 text-ink-muted">
                  {t("commonality.apart", { count: outliers.length })}
                  {outliers.map((row) => {
                    const id = rowId(row);
                    return (
                      <button
                        key={id ?? rowName(row)}
                        type="button"
                        disabled={id === undefined}
                        onClick={() => {
                          if (id !== undefined) onOpenRow(id);
                        }}
                        className="rounded-(--radius-control) border border-line bg-surface px-1.5 text-ink hover:border-accent"
                      >
                        {rowName(row)}
                      </button>
                    );
                  })}
                </li>
              )}
            </ul>
          )}
        </div>
        <Commonality share={attribute.share} shared={attribute.shared} percent={percent} t={t} />
      </div>
    </li>
  );
}

/** The share of the most held value, with a mark for a value every row shares. */
function Commonality({
  share,
  shared,
  percent,
  t,
}: {
  share: number;
  shared: boolean;
  percent: Intl.NumberFormat;
  t: TFunction;
}) {
  return (
    <span
      title={t(shared ? "commonality.sharedHint" : "commonality.shareHint")}
      className={`flex w-16 shrink-0 items-center justify-end gap-1 tabular-nums ${shared ? "font-medium text-state-up" : "text-ink-muted"}`}
    >
      {shared && <CheckIcon className="h-3.5 w-3.5" />}
      {percent.format(share)}
    </span>
  );
}

/** A value as the cells of the list show it, or "(empty)". */
function ValueView<T>({
  group,
  column,
  locale,
  t,
}: {
  group: ValueGroup<T>;
  column: ListColumn<T>;
  locale: string;
  t: TFunction;
}): ReactNode {
  const [row] = group.rows;
  if (group.key === null || row === undefined)
    return <span className="text-ink-muted italic">{t("commonality.empty")}</span>;
  return column.render(row, locale);
}
