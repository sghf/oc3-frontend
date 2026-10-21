import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { RelatedCount } from "./RelatedCount";
import { PROPERTIES_TAB, type RelatedTab, type RelatedTabGroup } from "./related-tabs";

/** A group with the tabs the panel has, in its order. */
export interface ResolvedGroup extends RelatedTabGroup {
  entries: RelatedTab[];
}

/**
 * The navigation of a panel whose tabs are grouped, always on display above the
 * content: the properties and every tab of every group as tiles, a box per group
 * with its name set in the top border, each tile with its counts and, as its
 * tooltip, what it holds. The tab on display is the current tile.
 *
 * Buttons, not tabs: a tile opens its tab, which the URL names. The tiles line up
 * from one column of boxes to the next (`tileColumns`, `groupTracks`).
 */
export function RelatedTileNav({
  groups,
  active,
  objectId,
  onSelect,
  label,
  propertiesIcon,
}: {
  groups: ResolvedGroup[];
  /** The tab on display, PROPERTIES_TAB for the properties. */
  active: string;
  objectId: string | undefined;
  onSelect: (tab: string | undefined) => void;
  /** Accessible name of the navigation. */
  label: string;
  propertiesIcon: ReactNode;
}) {
  const { t } = useTranslation();
  const columns = tileColumns(groups);
  // The rows every column shares, for the tiles to line up across them.
  const tracks = Math.max(
    ...columns.map((column) => column.reduce((sum, group) => sum + groupTracks(group), 0)),
  );

  return (
    <nav
      aria-label={label}
      // Scrolls sideways in a narrow panel rather than widening it.
      data-panel-fit="scroll"
      className="grid auto-cols-max grid-flow-col gap-x-1.5 gap-y-1 overflow-x-auto border-b border-line px-2 pt-3 pb-2"
      style={{ gridTemplateRows: `repeat(${String(tracks)}, auto)` }}
    >
      {columns.map((column) => (
        <div
          key={column.map((group) => group.key).join()}
          className="grid grid-rows-subgrid"
          style={{ gridRow: `span ${String(tracks)}` }}
        >
          {column.map((group, position) => (
            // A named group, not a section: no landmark per box.
            <div
              key={group.key}
              role="group"
              aria-label={t(group.labelKey)}
              className={`grid grid-rows-subgrid rounded-(--radius-panel) border border-line px-1.5 pb-3 ${position > 0 ? "mt-1" : ""}`}
              style={{ gridRow: `span ${String(groupTracks(group))}` }}
            >
              <span
                aria-hidden="true"
                className="-mt-2 flex h-4 w-fit items-center bg-surface-raised px-1 text-[0.6875rem] font-semibold tracking-wider whitespace-nowrap text-ink-muted uppercase"
              >
                {t(group.labelKey)}
              </span>
              <ul
                className={`grid grid-rows-subgrid ${TILE_GRID[tileWidth(group) - 1] ?? ""}`}
                style={{ gridRow: `span ${String(groupTracks(group) - 1)}` }}
              >
                {rowSeparators(group).map((row) => (
                  // Decorative: a dotted line between two rows of tiles of a box.
                  <li
                    key={`separator-${String(row)}`}
                    aria-hidden="true"
                    style={{ gridRow: row, gridColumn: "1 / -1" }}
                    className="translate-y-1 self-end border-t border-dotted border-line-strong"
                  />
                ))}
                {group.key === OVERVIEW_GROUP && (
                  <li style={tilePlace(0)} className={tileCell(0)}>
                    <button
                      type="button"
                      aria-current={active === PROPERTIES_TAB ? "page" : undefined}
                      onClick={() => {
                        onSelect(undefined);
                      }}
                      className={tileClass(active === PROPERTIES_TAB)}
                    >
                      <span className="shrink-0">{propertiesIcon}</span>
                      {t("related.properties")}
                    </button>
                  </li>
                )}
                {group.entries.map((entry, index) => {
                  const rank = index + (group.key === OVERVIEW_GROUP ? 1 : 0);
                  const current = entry.key === active;
                  const description =
                    entry.descriptionKey === undefined ? undefined : t(entry.descriptionKey);
                  return (
                    <li key={entry.key} style={tilePlace(rank)} className={tileCell(rank)}>
                      <button
                        type="button"
                        title={description}
                        aria-current={current ? "page" : undefined}
                        onClick={() => {
                          onSelect(entry.key);
                        }}
                        className={tileClass(current)}
                      >
                        <span className="shrink-0">{entry.icon}</span>
                        {t(entry.labelKey)}
                        {entry.hideCount !== true && (
                          <RelatedCount tab={entry} id={objectId} active={current} />
                        )}
                        {description !== undefined && (
                          <span className="sr-only">{description}</span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      ))}
    </nav>
  );
}

/**
 * The group holding the properties, which have no tab, first of its tiles. A
 * panel names it among its groups to add tabs after them (the notes).
 */
export const OVERVIEW_GROUP = "overview";

/** The tiles of a group, the properties included in the overview. */
const tileCount = (group: ResolvedGroup) =>
  group.entries.length + (group.key === OVERVIEW_GROUP ? 1 : 0);

/** At most this many tiles side by side in a group, the rest on more rows. */
const TILES_PER_ROW = 3;

// Literal classes, for Tailwind to see them. The tiles share the width of their box.
const TILE_GRID = ["grid-cols-[auto]", "grid-cols-[repeat(2,auto)]", "grid-cols-[repeat(3,auto)]"];

const tileWidth = (group: ResolvedGroup) => Math.max(1, Math.min(TILES_PER_ROW, tileCount(group)));

const tileRows = (group: ResolvedGroup) => Math.max(1, Math.ceil(tileCount(group) / TILES_PER_ROW));

/**
 * The grid rows of a group: its heading, then its rows of tiles, each after the
 * first behind an empty row, level with the headings of the other columns.
 */
const groupTracks = (group: ResolvedGroup) => 2 * tileRows(group);

/** Where a tile sits in the rows of its group, skipping the heading rows. */
const tilePlace = (rank: number) => ({
  gridRow: 2 * Math.floor(rank / TILES_PER_ROW) + 1,
  gridColumn: (rank % TILES_PER_ROW) + 1,
});

/**
 * The grid rows of a group's tiles after which a dotted line runs. The line sits
 * at the bottom of the row, a gap lower: about midway to the next row of tiles,
 * the row of the headings of the other columns lying between them.
 */
const rowSeparators = (group: ResolvedGroup) =>
  Array.from({ length: tileRows(group) - 1 }, (_, index) => 2 * index + 1);

/** A dotted line before each tile but the first of its row, in place of a box around each. */
const tileCell = (rank: number) =>
  `flex self-start px-0.5 ${rank % TILES_PER_ROW > 0 ? "border-l border-dotted border-line-strong" : ""}`;

const tileClass = (current: boolean) =>
  `flex w-full items-center gap-1 rounded-(--radius-control) px-1.5 py-0.5 text-left text-xs leading-tight font-medium whitespace-nowrap text-ink ${
    current ? "bg-accent-soft font-semibold" : "hover:bg-surface-sunken"
  }`;

/**
 * Lays the groups out in columns of two tile rows: a group of several rows
 * alone, the groups of one row in pairs, the narrowest together (or each alone,
 * on one row, when there are three of them at most and none taller), so that the
 * columns are about as wide as their groups. The columns keep the order of
 * their first group, and the groups of a column their own order.
 */
function tileColumns(groups: ResolvedGroup[]): ResolvedGroup[][] {
  const overview: ResolvedGroup = groups.find((group) => group.key === OVERVIEW_GROUP) ?? {
    key: OVERVIEW_GROUP,
    labelKey: "related.groups.overview",
    tabs: [],
    entries: [],
  };
  const all = [overview, ...groups.filter((group) => group.key !== OVERVIEW_GROUP)];
  const order = new Map(all.map((group, index) => [group.key, index]));
  const rank = (group: ResolvedGroup | undefined) =>
    group === undefined ? 0 : (order.get(group.key) ?? 0);
  const tall = all.filter((group) => tileCount(group) > TILES_PER_ROW).map((group) => [group]);
  const low = all
    .filter((group) => tileCount(group) <= TILES_PER_ROW)
    .sort((a, b) => tileWidth(a) - tileWidth(b) || rank(a) - rank(b));
  // Few groups of one row, and none taller: one row of boxes is enough.
  if (tall.length === 0 && low.length <= 3)
    return low.map((group) => [group]).sort((a, b) => rank(a[0]) - rank(b[0]));
  const pairs: ResolvedGroup[][] = [];
  for (let i = 0; i < low.length; i += 2)
    pairs.push(low.slice(i, i + 2).sort((a, b) => rank(a) - rank(b)));
  return [...tall, ...pairs].sort((a, b) => rank(a[0]) - rank(b[0]));
}
