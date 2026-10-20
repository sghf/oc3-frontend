import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { FlashRow } from "./Flash";

export interface RelatedColumn<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  numeric?: boolean;
  /** Column that takes the remaining width, typically a description. */
  grow?: boolean;
  /** Long text allowed to wrap, without taking the remaining width. */
  wrap?: boolean;
  /**
   * With `blockKey`, a cell written once per block of rows, spanning them: a
   * property the rows of the block share. The first such column heads the block
   * (`<th scope="rowgroup">`), for screen readers too.
   */
  spanBlock?: boolean;
  /** Content of a `spanBlock` cell, from the rows of its block; `render` of the first row by default. */
  renderBlock?: (rows: T[]) => ReactNode;
  /** A faint rule before the column, setting it apart from those on its left. */
  divider?: boolean;
}

export interface RelatedGroup<T> {
  key: string;
  label: string;
  rows: T[];
}

/**
 * Compact list of data attached to an object, in a detail panel: no pagination nor
 * column picker, the volumes stay modest there. Rows may be grouped, each group under
 * its heading and its count, so that a long list stays readable at a glance.
 */
export function RelatedTable<T>({
  columns,
  groups,
  rowKey,
  isPending,
  errorMessage,
  empty,
  caption,
  headerTop,
  blockKey,
  flashSignature = JSON.stringify,
  onRowOpen,
}: {
  columns: RelatedColumn<T>[];
  groups: RelatedGroup<T>[];
  rowKey: (row: T) => string;
  isPending: boolean;
  errorMessage: string | null;
  /** Text shown when there is no row. */
  empty: string;
  /** Accessible name of the table. */
  caption: string;
  /**
   * Offset of the sticky header row, a CSS length, when something else sticks
   * above the table in the panel.
   */
  headerTop?: string;
  /**
   * Rows of a group that follow each other with the same key form a block: one
   * `<tbody>` of their own, the `spanBlock` cells written once, without separators
   * inside, an accent bar along a block of several rows, the block lit as a whole
   * under the pointer. The rows come in the order the blocks need.
   */
  blockKey?: (row: T) => string;
  /**
   * What a live update must change in a row to flash it, the whole row by
   * default. A row dated by each report leaves its date out: every report would
   * otherwise flash every row.
   */
  flashSignature?: (row: T) => string;
  /**
   * Makes each row open something, its details in a window say: a click anywhere
   * on it, or Enter or Space once it has the focus. A link or a button inside the
   * row keeps its own action. Rows in blocks (`blockKey`) do not open.
   */
  onRowOpen?: (row: T) => void;
}) {
  const { t } = useTranslation();
  // Ids of the headers, which the cells of a block name (`headers`).
  const tableId = useId();
  const colId = (index: number) => `${tableId}-col${String(index)}`;
  // True once the table has shown its rows: a row mounted afterwards is one the
  // collector gained, not the first display.
  const shownOnce = useRef(false);
  useEffect(() => {
    if (!isPending) shownOnce.current = true;
  }, [isPending]);
  if (isPending) return <p className="text-ink-muted">{t("detail.loading")}</p>;
  if (errorMessage !== null)
    return (
      <p role="alert" className="text-state-down">
        ■ {t("detail.error", { message: errorMessage })}
      </p>
    );
  const total = groups.reduce((sum, group) => sum + group.rows.length, 0);
  if (total === 0) return <p className="text-ink-muted">{empty}</p>;
  const grouped = groups.length > 1;
  // The column heading each block, its cells and its header given the width of
  // the block's accent bar, so that they line up.
  const headColumn = columns.find((column) => column.spanBlock === true)?.key;

  return (
    <table className="w-full border-collapse text-data">
      <caption className="sr-only">{caption}</caption>
      <thead
        className="sticky -top-3 bg-surface-raised"
        style={headerTop === undefined ? undefined : { top: headerTop }}
      >
        <tr className="border-b border-line text-left text-ink-muted">
          {columns.map((column, index) => (
            <th
              key={column.key}
              id={colId(index)}
              scope="col"
              className={`px-2 py-1 font-medium ${column.numeric === true ? "text-right" : ""} ${column.grow === true ? "w-full" : "whitespace-nowrap"} ${column.divider === true ? "border-l border-line/60" : ""} ${blockKey !== undefined && column.key === headColumn ? "border-l-2 border-l-transparent" : ""}`}
            >
              {column.label}
            </th>
          ))}
        </tr>
      </thead>
      {groups.map((group, groupIndex) => {
        if (group.rows.length === 0) return null;
        const heading = grouped && (
          <tr>
            <th
              scope="colgroup"
              colSpan={columns.length}
              className="bg-surface px-2 pt-3 pb-1 text-left font-semibold text-ink-muted"
            >
              {group.label} <span className="font-normal tabular-nums">({group.rows.length})</span>
            </th>
          </tr>
        );
        if (blockKey === undefined)
          return (
            <tbody key={group.key}>
              {heading}
              {group.rows.map((row) => (
                // A live update changing the row, or bringing it, flashes it.
                <FlashRow
                  key={rowKey(row)}
                  signature={flashSignature(row)}
                  appear={shownOnce.current}
                  className={`border-b border-line/60 align-top last:border-b-0 ${onRowOpen === undefined ? "" : OPENING_ROW}`}
                  {...(onRowOpen === undefined
                    ? {}
                    : openingRow(() => {
                        onRowOpen(row);
                      }))}
                >
                  {columns.map((column) => (
                    <td key={column.key} className={cellClass(column)}>
                      {column.render(row)}
                    </td>
                  ))}
                </FlashRow>
              ))}
            </tbody>
          );
        return [
          heading === false ? null : <tbody key={`${group.key}:heading`}>{heading}</tbody>,
          ...toBlocks(group.rows, blockKey).map((block, blockIndex) => {
            // Each cell names its column and the head of its block: the row group
            // header alone is not tied to the rows after the first by every
            // browser, Chromium among them.
            const headId = `${tableId}-g${String(groupIndex)}b${String(blockIndex)}`;
            return (
              <tbody
                key={`${group.key}:${block.key}`}
                className="border-b border-line/60 last:border-b-0 hover:bg-surface-sunken/60"
              >
                {block.rows.map((row, index) => (
                  <FlashRow
                    key={rowKey(row)}
                    signature={flashSignature(row)}
                    appear={shownOnce.current}
                    className="align-top"
                  >
                    {columns.map((column, columnIndex) => {
                      const headers =
                        headColumn === undefined ? undefined : `${colId(columnIndex)} ${headId}`;
                      if (column.spanBlock !== true)
                        return (
                          <td key={column.key} headers={headers} className={cellClass(column)}>
                            {column.render(row)}
                          </td>
                        );
                      // Written once, on the first row of the block.
                      if (index > 0) return null;
                      const content =
                        column.renderBlock === undefined
                          ? column.render(row)
                          : column.renderBlock(block.rows);
                      const several = block.rows.length > 1;
                      return column.key === headColumn ? (
                        <th
                          key={column.key}
                          id={headId}
                          headers={colId(columnIndex)}
                          scope="rowgroup"
                          rowSpan={block.rows.length}
                          // The bar's width on every block, transparent on a single row:
                          // the heads of all blocks line up.
                          className={`${cellClass(column)} border-l-2 text-left font-normal ${several ? "border-l-line-strong" : "border-l-transparent"}`}
                        >
                          {content}
                        </th>
                      ) : (
                        <td
                          key={column.key}
                          headers={headers}
                          rowSpan={block.rows.length}
                          className={cellClass(column)}
                        >
                          {content}
                        </td>
                      );
                    })}
                  </FlashRow>
                ))}
              </tbody>
            );
          }),
        ];
      })}
    </table>
  );
}

const OPENING_ROW =
  "cursor-pointer hover:bg-surface-sunken/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent";

/** The handlers of a row that opens: a click beside its links and buttons, Enter or Space. */
function openingRow(open: () => void) {
  return {
    tabIndex: 0,
    "aria-haspopup": "dialog" as const,
    onClick: (event: MouseEvent<HTMLTableRowElement>) => {
      if (event.target instanceof Element && event.target.closest("a, button, input") !== null)
        return;
      open();
    },
    onKeyDown: (event: KeyboardEvent<HTMLTableRowElement>) => {
      if (event.target !== event.currentTarget) return;
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      open();
    },
  };
}

function cellClass<T>(column: RelatedColumn<T>): string {
  return `px-2 py-1 ${column.numeric === true ? "text-right tabular-nums" : ""} ${column.grow === true || column.wrap === true ? "" : "whitespace-nowrap"} ${column.divider === true ? "border-l border-line/60" : ""}`;
}

/** The rows cut into the blocks of rows that follow each other with the same key. */
function toBlocks<T>(rows: T[], blockKey: (row: T) => string): { key: string; rows: T[] }[] {
  const blocks: { key: string; rows: T[] }[] = [];
  let previous: string | undefined;
  for (const row of rows) {
    const key = blockKey(row);
    const last = blocks.at(-1);
    if (last !== undefined && key === previous) last.rows.push(row);
    // The position keeps the React key unique should a key come back later on.
    else blocks.push({ key: `${key}:${String(blocks.length)}`, rows: [row] });
    previous = key;
  }
  return blocks;
}
