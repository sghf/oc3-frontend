import { useEffect, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AnsiText } from "@/components/ui/AnsiText";
import { ChevronDownIcon, CloseIcon, DownloadIcon, SearchIcon } from "@/components/ui/icons";
import { dateTimeFormat } from "@/lib/date-format";
import { parseCollectorDate } from "@/lib/format";
import { LOG_LEVELS, outputEntries, splitSegments, type LogLevel, type LogLine } from "./log-lines";

/** The level in a state colour, the word doubling it. */
const LEVEL_CLASS: Record<LogLevel, string> = {
  error: "text-state-down",
  warn: "text-state-warn",
  info: "text-ink",
  debug: "text-ink-muted",
};

const CONTROL =
  "flex h-7 items-center gap-1 rounded-(--radius-control) border border-line bg-surface px-2";

/**
 * A log, read as the om3 web application reads its logs (`LogsViewer`): a line an
 * entry, on a grid shared by all, its time with its level under it in a colour
 * and a word, then, apart, on a first line what it is about as small badges, the
 * prefixes of the message (`splitPrefixes`) after the `meta` the view gives, and
 * on the next its text, its line breaks and terminal colours kept. Above, a search
 * of the texts, a filter of the levels, the count of the lines shown, and the
 * download of those lines. Clicking a line while filtering shows it in its
 * context: the filters cleared, the line brought into view and lit a moment.
 *
 * A log read once, not followed: the streaming, pause and reading of older lines
 * of the om3 viewer have no use here. The output of a command has neither time
 * nor level: without them, the column on the left goes.
 */
export function LogLines({
  lines,
  filename,
  maxHeight = "24rem",
  plain = false,
}: {
  lines: LogLine[];
  /** The name of the file the lines download as, without extension. */
  filename: string;
  maxHeight?: string;
  /**
   * Lines of a terminal, a table or a tree say: kept unwrapped and without rules
   * between them, for their columns to stay aligned; the log scrolls sideways.
   */
  plain?: boolean;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [levels, setLevels] = useState<LogLevel[]>([]);
  const [lit, setLit] = useState<string | null>(null);
  const levelsId = useId();
  const listId = useId();
  const parsed = useMemo(
    () =>
      lines.map((line) => {
        const [first, ...rest] = splitSegments(line.message);
        // The view's meta often repeats a prefix (the resource id): said once.
        const badges = [...new Set([...(line.meta ?? []), ...(first?.prefixes ?? [])])];
        return {
          ...line,
          badges,
          segments: [
            { extra: [], text: first?.text ?? "" },
            // The next segments name only what they add, "stdout" say.
            ...rest.map((segment) => ({
              extra: segment.prefixes.filter((prefix) => !badges.includes(prefix)),
              text: segment.text,
            })),
          ],
        };
      }),
    [lines],
  );
  const needle = search.trim().toLocaleLowerCase();
  const filtering = needle !== "" || levels.length > 0;
  const shown = parsed.filter(
    (line) =>
      (levels.length === 0 || levels.includes(line.level)) &&
      (needle === "" ||
        line.message.toLocaleLowerCase().includes(needle) ||
        (line.meta ?? []).some((meta) => meta.toLocaleLowerCase().includes(needle))),
  );
  // The levels the log holds: no use filtering on the others.
  const present = LOG_LEVELS.filter((level) => parsed.some((line) => line.level === level));
  const dated = lines.some((line) => line.at !== undefined);
  // A single level and no time: the column would repeat the same word on every line.
  const leftColumn = dated || present.length > 1;
  const time = dateTimeFormat({ hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const lineId = (key: string) => `${listId}-${key}`;

  // A line clicked while filtering, once the filters cleared: brought into view, lit.
  useEffect(() => {
    if (lit === null) return;
    document.getElementById(lineId(lit))?.scrollIntoView({ block: "center" });
    const timer = window.setTimeout(() => {
      setLit(null);
    }, 2000);
    return () => {
      window.clearTimeout(timer);
    };
    // lineId only depends on the stable useId prefix.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lit]);

  function download() {
    const text = shown
      .map((line) => {
        const at = parseCollectorDate(line.at);
        const when = line.at === undefined ? "" : `[${at === null ? line.at : at.toISOString()}] `;
        const level = leftColumn ? `[${line.level.toUpperCase()}] ` : "";
        const where = [...(line.meta ?? [])].map((meta) => `${meta}: `).join("");
        return `${when}${level}${where}${line.message}`;
      })
      .join("\n");
    const url = URL.createObjectURL(new Blob([`${text}\n`], { type: "text/plain" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${filename}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className={`${CONTROL} min-w-48 flex-1 text-ink-muted`}>
          <SearchIcon className="h-3.5 w-3.5 shrink-0" />
          <span className="sr-only">{t("logLines.search")}</span>
          <input
            type="search"
            value={search}
            placeholder={t("logLines.search")}
            onChange={(event) => {
              setSearch(event.target.value);
            }}
            className="w-full bg-transparent text-ink outline-none placeholder:text-ink-muted"
          />
        </label>
        {present.length > 1 && (
          <details className="relative">
            <summary
              aria-describedby={levelsId}
              className={`${CONTROL} cursor-pointer list-none text-ink [&::-webkit-details-marker]:hidden`}
            >
              <span id={levelsId} className="text-ink-muted">
                {t("logLines.levels")}
              </span>
              {levels.length === 0
                ? t("logLines.allLevels")
                : levels.map((level) => t(`logLines.level.${level}`)).join(", ")}
              <ChevronDownIcon className="h-3 w-3 text-ink-muted" />
            </summary>
            <div
              role="group"
              aria-label={t("logLines.levels")}
              className="absolute left-0 z-10 mt-1 flex min-w-32 flex-col gap-1 rounded-(--radius-control) border border-line bg-surface-raised p-2 shadow-lg"
            >
              {present.map((level) => (
                <label key={level} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={levels.includes(level)}
                    onChange={(event) => {
                      setLevels((previous) =>
                        event.target.checked
                          ? [...previous.filter((l) => l !== level), level]
                          : previous.filter((l) => l !== level),
                      );
                    }}
                  />
                  <span className={LEVEL_CLASS[level]}>{t(`logLines.level.${level}`)}</span>
                </label>
              ))}
            </div>
          </details>
        )}
        {filtering && (
          <span className="inline-flex h-7 items-center gap-1 rounded-(--radius-control) border border-line bg-surface-sunken pl-2 text-data">
            {t("logLines.filtered")}
            <button
              type="button"
              title={t("logLines.clearFilters")}
              onClick={() => {
                setSearch("");
                setLevels([]);
              }}
              className="flex h-6 w-6 items-center justify-center rounded-(--radius-control) text-ink-muted hover:text-ink"
            >
              <CloseIcon className="h-3 w-3" />
              <span className="sr-only">{t("logLines.clearFilters")}</span>
            </button>
          </span>
        )}
        <span className="ml-auto text-data text-ink-muted tabular-nums">
          {t("logLines.count", { shown: shown.length, total: lines.length })}
        </span>
        <button
          type="button"
          title={t("logLines.download")}
          disabled={shown.length === 0}
          onClick={download}
          className={`${CONTROL} text-ink-muted hover:text-ink disabled:opacity-40`}
        >
          <DownloadIcon className="h-3.5 w-3.5" />
          <span className="sr-only">{t("logLines.download")}</span>
        </button>
      </div>

      <div
        role="log"
        aria-label={t("logLines.lines")}
        tabIndex={0}
        style={{ maxHeight }}
        className="overflow-auto rounded-(--radius-control) bg-surface-sunken py-1 font-mono text-data"
      >
        {shown.length === 0 ? (
          <p className="px-2 py-3 text-center font-sans text-ink-muted">{t("logLines.noMatch")}</p>
        ) : (
          // The columns shared by every line, for their texts to start at the same place.
          <ol
            className={`grid gap-x-2 ${leftColumn ? "grid-cols-[max-content_minmax(0,1fr)]" : "grid-cols-[minmax(0,1fr)]"} ${
              // As wide as its longest line, for the lit line to span it when scrolled.
              plain ? "w-max min-w-full" : ""
            }`}
          >
            {shown.map((line) => {
              const at = parseCollectorDate(line.at);
              return (
                <li
                  key={line.key}
                  id={lineId(line.key)}
                  onClick={
                    filtering
                      ? () => {
                          setSearch("");
                          setLevels([]);
                          setLit(line.key);
                        }
                      : undefined
                  }
                  title={filtering ? t("logLines.showInContext") : undefined}
                  className={`col-span-full grid grid-cols-subgrid items-baseline px-2 ${
                    plain ? "" : "border-b border-line/40 py-0.5 last:border-b-0"
                  } ${
                    filtering ? "cursor-pointer hover:bg-surface-raised" : ""
                  } ${lit === line.key ? "bg-accent-soft" : ""}`}
                >
                  {/* The time, the level under it in its colour, the word alone. */}
                  {leftColumn && (
                    <span className="flex flex-col">
                      <span className="text-ink-muted tabular-nums">
                        {at === null ? (line.at ?? "") : time.format(at)}
                      </span>
                      <span className={LEVEL_CLASS[line.level]}>
                        {t(`logLines.level.${line.level}`).toUpperCase()}
                      </span>
                    </span>
                  )}
                  {/* What it is about, as badges, then its text. */}
                  <span
                    className={`flex min-w-0 flex-col ${leftColumn ? "border-l border-line pl-2" : ""}`}
                  >
                    {line.badges.length > 0 && (
                      <span className="flex flex-wrap gap-1 font-sans">
                        {line.badges.map((badge) => (
                          <Badge key={badge}>{badge}</Badge>
                        ))}
                      </span>
                    )}
                    {line.segments.map((segment, index) => (
                      <span
                        key={index}
                        className={plain ? "whitespace-pre" : "break-words whitespace-pre-wrap"}
                      >
                        {segment.extra.map((prefix, at) => (
                          <Badge key={`${String(at)}-${prefix}`} inline>
                            {prefix}
                          </Badge>
                        ))}
                        <AnsiText text={segment.text} />
                      </span>
                    ))}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}

/** What a line is about, a prefix of its message say, as a small pill. */
function Badge({ children, inline = false }: { children: string; inline?: boolean }) {
  return (
    <span
      className={`rounded-full border border-line/60 px-1.5 font-sans text-[0.6875rem] leading-4 text-ink-muted ${
        inline ? "mr-1 inline-block align-[0.1em]" : ""
      }`}
    >
      {children}
    </span>
  );
}

/**
 * The output of a command, stdout or stderr, as a log: an entry for each line
 * the agent prefixes, the lines after it without prefix joined to it
 * (`outputEntries`); an output without prefix, as plain lines.
 */
export function OutputLines({
  output,
  filename,
  maxHeight,
}: {
  output: string;
  filename: string;
  maxHeight?: string;
}) {
  const { lines, prefixed } = useMemo(() => {
    const { entries, prefixed } = outputEntries(output);
    return {
      lines: entries.map((message, index): LogLine => ({
        key: String(index),
        at: undefined,
        level: "info",
        message,
      })),
      prefixed,
    };
  }, [output]);
  // Without the agent's prefixes, the output of a command as a terminal shows it.
  return <LogLines lines={lines} filename={filename} maxHeight={maxHeight} plain={!prefixed} />;
}
