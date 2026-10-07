import { useId, useRef, useState, type KeyboardEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";
import { hasPrivilege, useEffectivePrivileges } from "@/lib/api/effective-privileges";
import { useFiltersets } from "@/lib/api/filtersets";
import { useSessionFilterset } from "@/lib/api/session-filterset";
import type { ColumnFilters } from "@/lib/column-filters";
import {
  FILTERSET_NAME_MAX,
  entryLabel,
  suggestFiltersetName,
  toFiltersetEntries,
  type FiltersetNewEntry,
  type FiltersetSource,
} from "@/lib/filterset-entries";
import { TransientNotice } from "@/components/ui/TransientNotice";
import { nextNoticeId } from "@/components/ui/use-auto-dismiss";
import { PlusIcon } from "@/components/ui/icons";
import { useAnchoredPlacement } from "@/components/ui/use-anchored-placement";
import { usePeek } from "./use-peek";

/**
 * Button of the filter bar of a list saving its filters as a filterset, with the
 * dialog that names it and shows what will be stored: one entry per filter, those
 * with no filterset equivalent struck out with the reason, and the session filter
 * nested on demand so that the filterset selects what the list shows. Shown to the
 * users allowed to create filtersets (CompManager).
 *
 * The filterset, its new filters and its entries are created by one call, in one
 * transaction; a notice then offers to open it on the nodes it selects.
 */
export function SaveAsFilterset({
  filters,
  source,
  describe,
}: {
  filters: ColumnFilters;
  source: FiltersetSource;
  /** A filter as the filter bar shows it, for those that cannot be stored. */
  describe: (prop: string, expr: string) => string;
}) {
  const { t } = useTranslation();
  const privileges = useEffectivePrivileges();
  const allowed = privileges.data !== undefined && hasPrivilege(privileges.data, ["CompManager"]);
  const menu = useRef<HTMLDetailsElement>(null);
  const summary = useRef<HTMLElement>(null);
  const panel = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const nameField = useRef<HTMLInputElement>(null);
  const nameId = useId();
  const [name, setName] = useState("");
  const [stats, setStats] = useState(false);
  const [withSession, setWithSession] = useState(false);
  const [notice, setNotice] = useState<{ id: number; fsetId: string; name: string } | null>(null);
  const names = useFiltersets();
  const session = useSessionFilterset();
  const queryClient = useQueryClient();
  const peek = usePeek();

  const translated = toFiltersetEntries(filters, source);
  const stored = translated.flatMap((item) => ("entry" in item ? [item.entry] : []));
  const sessionName = session.data?.fset_name ?? undefined;
  const entries: FiltersetNewEntry[] =
    withSession && sessionName !== undefined
      ? [...stored, { f_log_op: "AND", filterset: sessionName }]
      : stored;
  const trimmed = name.trim();
  const taken = names.data?.includes(trimmed) === true;

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST("/filtersets", {
        body: { fset_name: trimmed, fset_stats: stats ? "T" : "F", entries },
      });
      if (error !== undefined) throw new Error(problemText(error));
      const rows = Array.isArray(data.data) ? data.data : [];
      return rows[0]?.id;
    },
    onSuccess: async (id) => {
      if (menu.current !== null) menu.current.open = false;
      if (id !== undefined) setNotice({ id: nextNoticeId(), fsetId: String(id), name: trimmed });
      await queryClient.invalidateQueries({ queryKey: ["filtersets"] });
      await queryClient.invalidateQueries({ queryKey: ["filters"] });
    },
  });

  // Fixed and placed under the button, kept inside the window: the filter bar wraps,
  // and the button can sit anywhere along it.
  useAnchoredPlacement(open, summary, panel, { matchWidth: false });

  if (!allowed) return null;

  function onToggle() {
    setOpen(menu.current?.open === true);
    if (menu.current?.open !== true) return;
    // Each opening starts again from the filters on display.
    setName(suggestFiltersetName(source.table, translated));
    setStats(false);
    setWithSession(false);
    create.reset();
    window.requestAnimationFrame(() => {
      nameField.current?.select();
    });
  }

  function onKeyDown(event: KeyboardEvent<HTMLDetailsElement>) {
    if (event.key !== "Escape" || menu.current === null) return;
    event.stopPropagation();
    menu.current.open = false;
    menu.current.querySelector("summary")?.focus();
  }

  const blocked = trimmed === "" || taken || stored.length === 0 || create.isPending;

  return (
    <>
      <details ref={menu} onToggle={onToggle} onKeyDown={onKeyDown} className="relative">
        <summary
          ref={summary}
          className="flex h-6 cursor-pointer list-none items-center gap-1 rounded-(--radius-control) border border-line px-2 text-ink-muted hover:text-ink"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          {t("list.saveFilterset.label")}
        </summary>
        <form
          ref={panel}
          onSubmit={(event) => {
            event.preventDefault();
            if (!blocked) create.mutate();
          }}
          className="fixed z-30 flex w-[30rem] max-w-[calc(100vw-2rem)] flex-col gap-3 overflow-auto rounded-(--radius-panel) border border-line bg-surface-raised p-3 shadow-lg"
        >
          <div className="flex flex-col gap-1">
            <label htmlFor={nameId} className="text-ink-muted">
              {t("list.saveFilterset.name")}
            </label>
            <input
              ref={nameField}
              id={nameId}
              value={name}
              maxLength={FILTERSET_NAME_MAX}
              onChange={(event) => {
                setName(event.target.value);
              }}
              aria-invalid={taken}
              className="h-7 rounded-(--radius-control) border border-line bg-surface px-2 text-ink outline-none focus:border-accent aria-invalid:border-state-down"
            />
            {taken && (
              <p role="alert" className="text-state-down">
                ■ {t("list.saveFilterset.taken")}
              </p>
            )}
          </div>

          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={stats}
              onChange={(event) => {
                setStats(event.target.checked);
              }}
            />
            {t("filtersets.fields.fset_stats")}
          </label>

          <div className="flex flex-col gap-1">
            <p className="text-ink-muted">{t("list.saveFilterset.entries")}</p>
            <ol className="flex flex-col gap-1 text-data">
              {translated.map((item) =>
                "entry" in item ? (
                  <li key={item.prop} className="flex gap-2">
                    <span className="w-4 shrink-0 text-right text-ink-muted">
                      {stored.indexOf(item.entry) + 1}
                    </span>
                    <span className="w-16 shrink-0 font-medium">{item.entry.f_log_op}</span>
                    <code className="break-all">{entryLabel(item.entry)}</code>
                  </li>
                ) : (
                  <li key={item.prop} className="flex gap-2 text-ink-muted">
                    <span className="w-4 shrink-0 text-right">–</span>
                    <span className="flex flex-col">
                      <code className="break-all line-through">
                        {describe(item.prop, item.expr)}
                      </code>
                      <span>▲ {t(`list.saveFilterset.unstorable.${item.reason}`)}</span>
                    </span>
                  </li>
                ),
              )}
              {withSession && sessionName !== undefined && (
                <li className="flex gap-2">
                  <span className="w-4 shrink-0 text-right text-ink-muted">
                    {stored.length + 1}
                  </span>
                  <span className="w-16 shrink-0 font-medium">AND</span>
                  <code className="break-all">{sessionName}</code>
                </li>
              )}
            </ol>
          </div>

          {sessionName !== undefined && (
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={withSession}
                onChange={(event) => {
                  setWithSession(event.target.checked);
                }}
              />
              {t("list.saveFilterset.withSession", { name: sessionName })}
            </label>
          )}

          <p className="text-ink-muted">{t(`list.saveFilterset.selects.${source.selects}`)}</p>

          {stored.length === 0 && (
            <p role="alert" className="text-state-warn">
              ▲ {t("list.saveFilterset.nothing")}
            </p>
          )}
          {create.isError && (
            <p role="alert" className="text-state-down">
              ■ {create.error.message}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                if (menu.current !== null) menu.current.open = false;
              }}
              className="h-7 rounded-(--radius-control) border border-line px-3 text-ink-muted hover:text-ink"
            >
              {t("detail.cancel")}
            </button>
            <button
              type="submit"
              disabled={blocked}
              className="h-7 rounded-(--radius-control) bg-accent px-3 font-medium text-accent-ink disabled:opacity-60"
            >
              {create.isPending ? t("list.saveFilterset.creating") : t("list.saveFilterset.create")}
            </button>
          </div>
        </form>
      </details>

      {notice !== null && (
        <TransientNotice
          id={notice.id}
          tone="success"
          text={t("list.saveFilterset.created", { name: notice.name })}
          dismissLabel={t("list.export.dismiss")}
          onDismiss={() => {
            setNotice(null);
          }}
        >
          {t("list.saveFilterset.created", { name: notice.name })}{" "}
          <button
            type="button"
            onClick={() => {
              peek("filterset", notice.fsetId, "nodes");
            }}
            className="font-medium underline underline-offset-2"
          >
            {t("list.saveFilterset.open")}
          </button>
        </TransientNotice>
      )}
    </>
  );
}
