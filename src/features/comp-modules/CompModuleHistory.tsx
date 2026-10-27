import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { DateTime } from "@/components/ui/DateTime";
import { UnifiedDiff } from "@/components/ui/UnifiedDiff";
import { CaretRightIcon, HistoryIcon } from "@/components/ui/icons";
import { WriteError } from "./CompModuleFiles";
import {
  restoreCompModule,
  useCompModuleDiff,
  type CompModuleDetail,
  type CompModuleFileDiff,
} from "./comp-modules-api";
import { useModuleWrite } from "./use-module-write";

/**
 * The commits that changed a module, folded by default: each earlier version
 * compared with the current one, file by file, and restored by a CompManager
 * as a new commit, which leaves every version in the history.
 */
export function ModuleHistory({ module, canEdit }: { module: CompModuleDetail; canEdit: boolean }) {
  const { t } = useTranslation();
  const write = useModuleWrite(module);
  const [open, setOpen] = useState(false);
  // The version compared with the current one.
  const [compared, setCompared] = useState<string | undefined>();
  const current = module.history[0]?.id;

  return (
    <section className="flex flex-col gap-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
        }}
        className="flex w-fit items-center gap-1.5 font-medium hover:underline"
      >
        <CaretRightIcon
          className={`h-3 w-3 text-ink-muted transition-transform ${open ? "rotate-90" : ""}`}
        />
        <HistoryIcon className="h-4 w-4 text-ink-muted" />
        {t("compModules.history.title", { count: module.history.length })}
      </button>
      {open && (
        <>
          <WriteError error={write.error} onReload={write.reload} />
          <ol className="flex flex-col gap-2">
            {module.history.map((c) => (
              <li key={c.id} className="flex flex-col gap-1">
                <span className="font-medium">
                  {c.subject}
                  {c.id === current && (
                    <span className="ml-2 font-normal text-ink-muted">
                      ({t("compModules.history.current")})
                    </span>
                  )}
                </span>
                <span className="text-ink-muted">
                  <DateTime value={c.date} /> · {c.author} ·{" "}
                  <span className="font-mono">{c.id.slice(0, 12)}</span>
                </span>
                {c.id !== current && (
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      aria-expanded={compared === c.id}
                      onClick={() => {
                        setCompared(compared === c.id ? undefined : c.id);
                      }}
                      className="text-accent hover:underline"
                    >
                      {compared === c.id
                        ? t("compModules.history.hideCompare")
                        : t("compModules.history.compare")}
                    </button>
                    {canEdit && (
                      <ConfirmButton
                        label={t("compModules.history.restore")}
                        question={t("compModules.history.restoreQuestion", {
                          version: c.id.slice(0, 12),
                        })}
                        confirmLabel={t("compModules.history.restoreConfirm")}
                        cancelLabel={t("detail.cancel")}
                        pendingLabel={t("compModules.edit.saving")}
                        pending={write.pending}
                        inline
                        onConfirm={() => {
                          void write
                            .run((base) => restoreCompModule(module.name, base, c.id))
                            .then((next) => {
                              if (next !== undefined) setCompared(undefined);
                            });
                        }}
                      />
                    )}
                  </div>
                )}
                {compared === c.id && <VersionDiff name={module.name} rev={c.id} />}
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

function VersionDiff({ name, rev }: { name: string; rev: string }) {
  const { t } = useTranslation();
  const diff = useCompModuleDiff(name, rev);
  if (diff.isPending) return <p className="text-ink-muted">{t("list.loading")}</p>;
  if (diff.isError) {
    return (
      <p role="alert" className="text-state-down">
        ■ {diff.error.message}
      </p>
    );
  }
  if (diff.data.files.length === 0) {
    return <p className="text-ink-muted">{t("compModules.history.same")}</p>;
  }
  return (
    <div className="flex flex-col gap-2 rounded-(--radius-panel) border border-line p-2">
      <p className="text-ink-muted">
        {t("compModules.history.since", { version: rev.slice(0, 12) })}
      </p>
      {diff.data.files.map((f) => (
        <FileDiff key={`${f.status}:${f.path}`} file={f} />
      ))}
    </div>
  );
}

function FileDiff({ file }: { file: CompModuleFileDiff }) {
  const { t } = useTranslation();
  const mode =
    file.was_executable !== undefined && file.is_executable !== undefined
      ? t("compModules.history.mode", {
          from: file.was_executable
            ? t("compModules.executable")
            : t("compModules.history.notExecutable"),
          to: file.is_executable
            ? t("compModules.executable")
            : t("compModules.history.notExecutable"),
        })
      : undefined;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono font-medium">
          {file.path === "" ? t("compModules.script") : file.path}
        </span>
        <span className="text-ink-muted">{t(`compModules.history.status.${file.status}`)}</span>
        {(file.added > 0 || file.deleted > 0) && (
          <span className="font-mono text-ink-muted">
            +{file.added} −{file.deleted}
          </span>
        )}
        {mode !== undefined && <span className="text-ink-muted">{mode}</span>}
      </div>
      {file.binary ? (
        <p className="text-ink-muted">{t("compModules.history.binary")}</p>
      ) : (
        file.diff !== "" && (
          <>
            <UnifiedDiff
              diff={file.diff}
              labels={{
                added: t("compModules.history.added"),
                removed: t("compModules.history.removed"),
                showAll: (count) => t("compModules.history.showAll", { count }),
              }}
            />
            {file.truncated && <p className="text-ink-muted">{t("compModules.truncated")}</p>}
          </>
        )
      )}
    </div>
  );
}
