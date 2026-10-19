import { useId, useState, type ChangeEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { SlideOver } from "@/components/ui/SlideOver";
import { DownloadIcon, UploadIcon } from "@/components/ui/icons";
import { download } from "@/lib/export/table";
import { recordVersion, type RecordedVersion } from "./commit";
import {
  DUMP_KINDS,
  exportCompliance,
  exportFileName,
  importDump,
  parseDump,
  type DumpKind,
} from "./compliance-dump";
import { BUTTON } from "./ui";

/** Names listed per kind in the preview; the others are counted. */
const NAMES_SHOWN = 30;

/** What the last import did: the collector's lines, and the version it recorded. */
export interface ImportResult {
  at: number;
  info: string[];
  version: RecordedVersion;
}

/**
 * Exporting the compliance as JSON, and importing a compliance dump, from one
 * panel: the export downloads what the collector holds, in the format the import
 * reads.
 *
 * The import, as the historical designer's importer did: the JSON
 * of an export (the designer's, a ruleset's or a moduleset's, or the historical
 * collector's), pasted or loaded from a file, read before it is sent so that what
 * it holds shows by name. The collector imports it all or nothing, reusing the
 * objects existing by name; the import is then recorded as a version of the
 * compliance history, and the designer reads the collector again.
 *
 * Refused while the sandbox holds pending changes: the import writes to the
 * collector directly, under them.
 */
export function ImportExportPanel({
  open,
  onClose,
  pendingCount,
  result,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  /** The changes of the sandbox not committed yet. */
  pendingCount: number;
  /** The outcome of the last import, kept by the page across the reload it brings. */
  result: ImportResult | null;
  onImported: (result: ImportResult) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [text, setText] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const parsed = parseDump(text);

  // The download of the compliance as the collector holds it, in the import's format.
  const exporting = useMutation({
    mutationFn: async () => {
      const dump = await exportCompliance();
      download(
        new Blob([`${JSON.stringify(dump, null, 2)}\n`], { type: "application/json" }),
        exportFileName(new Date()),
      );
    },
  });

  const run = useMutation({
    mutationFn: async () => {
      if (!parsed.ok) return;
      const en = i18n.getFixedT("en");
      // The export as found first: what changed since the last version came from
      // elsewhere, and must not be counted as the import's.
      await recordVersion(en("designer.import.baseline"), "elsewhere");
      const info = await importDump(parsed.dump);
      const counts = DUMP_KINDS.map(({ key }) => parsed.names[key].length);
      const subject = en("designer.import.subject", {
        filtersets: counts[0],
        rulesets: counts[1],
        modulesets: counts[2],
      });
      const version = await recordVersion(
        [subject, "", ...info.map((line) => `- ${line}`)].join("\n"),
        "designer",
      );
      setText("");
      onImported({ at: Date.now(), info, version });
    },
  });

  const onFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file === undefined) return;
    setFileError(null);
    file
      .text()
      .then(setText)
      .catch((error: unknown) => {
        setFileError(error instanceof Error ? error.message : String(error));
      });
  };

  const problem = !parsed.ok && parsed.reason !== "empty" ? parseProblem(t, parsed) : null;
  const blocked = pendingCount > 0;

  return (
    <SlideOver
      open={open}
      title={t("designer.dump.title")}
      onClose={onClose}
      closeLabel={t("detail.close")}
      resizeLabel={t("detail.resize")}
      leading={<UploadIcon className="h-4 w-4" />}
    >
      <div className="flex flex-col gap-3 p-4">
        <section aria-labelledby={`${id}-export`} className="flex flex-col gap-2">
          <h3 id={`${id}-export`} className="font-semibold">
            {t("designer.export.title")}
          </h3>
          <p className="text-ink-muted">{t("designer.export.hint")}</p>
          <div>
            <button
              type="button"
              disabled={exporting.isPending}
              className={BUTTON}
              onClick={() => {
                exporting.mutate();
              }}
            >
              <DownloadIcon className="h-3.5 w-3.5" />
              {exporting.isPending ? t("designer.export.running") : t("designer.export.open")}
            </button>
          </div>
          {exporting.isError && (
            <p role="alert" className="text-state-down">
              ■ {t("designer.export.failed", { message: exporting.error.message })}
            </p>
          )}
        </section>
        <h3 className="border-t border-line pt-3 font-semibold">{t("designer.import.title")}</h3>
        <p className="text-ink-muted">{t("designer.import.intro")}</p>
        {result !== null && (
          <section
            aria-labelledby={`${id}-result`}
            className="rounded-(--radius-panel) border border-line p-3"
          >
            <h3 id={`${id}-result`} className="font-semibold text-state-up">
              ● {t("designer.import.done", { count: result.info.length })}
            </h3>
            <ul className="mt-1 max-h-48 list-disc overflow-y-auto pl-5">
              {result.info.map((line, index) => (
                <li key={`${String(index)}:${line}`}>{line}</li>
              ))}
            </ul>
            <p className="mt-1 text-ink-muted">
              {"error" in result.version
                ? t("designer.history.failed", { message: result.version.error })
                : result.version.changed
                  ? t("designer.history.recorded", { commit: result.version.commit.slice(0, 7) })
                  : t("designer.import.unchanged")}
            </p>
          </section>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <label className={`${BUTTON} cursor-pointer focus-within:outline-2`}>
            <UploadIcon className="h-3.5 w-3.5" />
            {t("designer.import.file")}
            <input
              type="file"
              accept=".json,application/json"
              onChange={onFile}
              className="sr-only"
            />
          </label>
          <span className="text-ink-muted">{t("designer.import.orPaste")}</span>
        </div>
        {fileError !== null && (
          <p role="alert" className="text-state-down">
            ■ {fileError}
          </p>
        )}
        <label htmlFor={`${id}-text`} className="font-medium">
          {t("designer.import.text")}
        </label>
        <textarea
          id={`${id}-text`}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
          }}
          spellCheck={false}
          aria-describedby={problem === null ? undefined : `${id}-problem`}
          aria-invalid={problem !== null}
          className="h-56 rounded-(--radius-control) border border-line bg-surface p-2 font-mono text-data"
        />
        {problem !== null && (
          <p id={`${id}-problem`} className="text-state-down">
            ■ {problem}
          </p>
        )}
        {parsed.ok && (
          <section aria-labelledby={`${id}-preview`} className="flex flex-col gap-1">
            <h3 id={`${id}-preview`} className="font-semibold">
              {t("designer.import.preview")}
            </h3>
            {DUMP_KINDS.map(({ key }) => (
              <PreviewLine key={key} kind={key} names={parsed.names[key]} />
            ))}
            {parsed.ignored.length > 0 && (
              <p className="text-state-warn">
                ▲ {t("designer.import.ignored", { keys: parsed.ignored.join(", ") })}
              </p>
            )}
          </section>
        )}
        {blocked && (
          <p role="note" className="text-state-warn">
            ▲ {t("designer.import.pending", { count: pendingCount })}
          </p>
        )}
        {run.isError && (
          <p role="alert" className="text-state-down">
            ■ {t("designer.import.failed", { message: run.error.message })}
          </p>
        )}
        <div>
          <button
            type="button"
            disabled={!parsed.ok || blocked || run.isPending}
            onClick={() => {
              run.mutate();
            }}
            className="h-8 rounded-(--radius-control) bg-accent px-3 font-medium text-accent-ink disabled:opacity-60"
          >
            {run.isPending ? t("designer.import.running") : t("designer.import.submit")}
          </button>
        </div>
      </div>
    </SlideOver>
  );
}

/** The objects of one kind a dump holds, by name, the first ones listed. */
function PreviewLine({ kind, names }: { kind: DumpKind; names: string[] }) {
  const { t } = useTranslation();
  if (names.length === 0) return null;
  const more = names.length - NAMES_SHOWN;
  return (
    <p>
      {t("designer.import.line", {
        kind: t(`designer.import.kinds.${kind}`, { count: names.length }),
        names: names.slice(0, NAMES_SHOWN).join(", "),
      })}
      {more > 0 && ` ${t("designer.import.more", { count: more })}`}
    </p>
  );
}

/** Why a text cannot be imported, in words. */
function parseProblem(
  t: (key: string, options?: Record<string, unknown>) => string,
  parsed: { reason: "json" | "shape" | "nothing" | "empty"; detail?: string },
): string {
  if (parsed.reason === "json")
    return t("designer.import.notJson", { message: parsed.detail ?? "" });
  if (parsed.reason === "shape") return t("designer.import.badShape");
  return t("designer.import.nothing");
}
