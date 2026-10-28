import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { CrossLink } from "@/components/opensvc/CrossLink";
import { ObjectIcon } from "@/components/opensvc/ObjectIcon";
import { Combobox } from "@/components/ui/Combobox";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { SlideOver } from "@/components/ui/SlideOver";
import { TrashIcon } from "@/components/ui/icons";
import { useAppCodes } from "@/features/apps/use-app-codes";
import { formatCapacityMiB } from "@/lib/format";
import { QuotaUsage, SizeInput } from "./quota-parts";
import { sizeMiB, toSizeValue } from "./quota-size";
import { changeQuota, deleteQuota, useQuota, type QuotaRow } from "./use-quotas";

/**
 * A quota: where it is, for which application, how much of it the
 * application's disks use, and the disk group around it. A StorageManager
 * changes its size or its application, and deletes it.
 */
export function QuotaDetailPanel({
  quotaId,
  canManage,
  onClose,
}: {
  quotaId: string | undefined;
  canManage: boolean;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const quota = useQuota(quotaId);
  const row = quota.data ?? undefined;
  return (
    <SlideOver
      open={quotaId !== undefined}
      title={
        row === undefined
          ? t("quotas.detail.title")
          : t("quotas.detail.name", { app: row.app, array: row.array_name, dg: row.dg_name })
      }
      onClose={onClose}
      closeLabel={t("detail.close")}
      resizeLabel={t("detail.resize")}
      leading={<ObjectIcon kind="disk" />}
    >
      {quota.isPending ? (
        <p className="text-ink-muted">{t("detail.loading")}</p>
      ) : quota.isError ? (
        <p role="alert" className="text-state-down">
          ■ {t("detail.error", { message: quota.error.message })}
        </p>
      ) : row === undefined ? (
        <p className="text-ink-muted">{t("quotas.detail.missing")}</p>
      ) : (
        <QuotaDetail
          key={row.id}
          row={row}
          canManage={canManage}
          locale={i18n.language}
          onDeleted={onClose}
        />
      )}
    </SlideOver>
  );
}

function QuotaDetail({
  row,
  canManage,
  locale,
  onDeleted,
}: {
  row: QuotaRow;
  canManage: boolean;
  locale: string;
  onDeleted: () => void;
}) {
  const { t } = useTranslation();
  const size = (mib: number | undefined) => formatCapacityMiB(mib, locale) || "0";
  const reservable = row.dg_reservable ?? 0;
  return (
    <div className="flex flex-col gap-5">
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5">
        <dt className="text-ink-muted">{t("quotas.fields.array_name")}</dt>
        <dd>
          {row.array_name}
          {row.array_model !== undefined && row.array_model !== "" && (
            <span className="text-ink-muted"> · {row.array_model}</span>
          )}
        </dd>
        <dt className="text-ink-muted">{t("quotas.fields.dg_name")}</dt>
        <dd>{row.dg_name}</dd>
        <dt className="text-ink-muted">{t("quotas.fields.app")}</dt>
        <dd>
          <CrossLink kind="app" id={row.app}>
            {row.app}
          </CrossLink>
        </dd>
        <dt className="text-ink-muted">{t("quotas.fields.quota")}</dt>
        <dd className="tabular-nums">{size(row.quota)}</dd>
        <dt className="text-ink-muted">{t("quotas.fields.quota_used")}</dt>
        <dd>
          <QuotaUsage used={row.quota_used} quota={row.quota} locale={locale} wide />
        </dd>
      </dl>

      <section className="flex flex-col gap-2">
        <h3 className="font-medium">{t("quotas.detail.diskGroup")}</h3>
        <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 tabular-nums">
          <dt className="text-ink-muted">{t("quotas.fields.dg_size")}</dt>
          <dd>{size(row.dg_size)}</dd>
          <dt className="text-ink-muted">{t("quotas.fields.dg_used")}</dt>
          <dd>{size(row.dg_used)}</dd>
          <dt className="text-ink-muted">{t("quotas.fields.dg_free")}</dt>
          <dd>{size(row.dg_free)}</dd>
          <dt className="text-ink-muted">{t("quotas.fields.dg_reserved")}</dt>
          <dd>{size(row.dg_reserved)}</dd>
          <dt className="text-ink-muted">{t("quotas.fields.dg_reservable")}</dt>
          <dd className={reservable < 0 ? "text-state-down" : ""}>
            {reservable < 0 ? (
              <>
                <span aria-hidden="true">■ </span>
                {t("quotas.detail.overReserved", { size: size(-reservable) })}
              </>
            ) : (
              size(reservable)
            )}
          </dd>
        </dl>
      </section>

      {canManage && <QuotaEdit row={row} locale={locale} onDeleted={onDeleted} />}
    </div>
  );
}

/** The size and the application of a quota changed, or the quota deleted. */
function QuotaEdit({
  row,
  locale,
  onDeleted,
}: {
  row: QuotaRow;
  locale: string;
  onDeleted: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const apps = useAppCodes();
  const [value, setValue] = useState(() => toSizeValue(row.quota));
  const [app, setApp] = useState(row.app ?? "");
  const [done, setDone] = useState<string | null>(null);
  const mib = sizeMiB(value);
  const changed = (mib !== undefined && mib !== row.quota) || (app !== "" && app !== row.app);

  const save = useMutation({
    mutationFn: () =>
      changeQuota(row, {
        ...(mib !== undefined && mib !== row.quota ? { quota: mib } : {}),
        ...(app !== "" && app !== row.app ? { app } : {}),
      }),
    onSuccess: async () => {
      // Said in the units of the page: the server's info counts in MiB, as the
      // audit log records it.
      setDone(
        t("quotas.edit.done", {
          size: formatCapacityMiB(mib, locale) || "0",
          app: app !== "" ? app : row.app,
        }),
      );
      await queryClient.invalidateQueries({ queryKey: ["quotas"] });
    },
  });
  const remove = useMutation({
    mutationFn: () => deleteQuota(row),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["quotas"] });
      onDeleted();
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!changed || mib === undefined || save.isPending) return;
    setDone(null);
    save.mutate();
  }

  return (
    <section className="flex flex-col gap-3 border-t border-line pt-4">
      <h3 className="font-medium">{t("quotas.edit.title")}</h3>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <div>
          <span className="mb-1 block text-ink-muted">{t("quotas.fields.quota")}</span>
          <SizeInput
            value={value}
            onChange={setValue}
            label={t("quotas.fields.quota")}
            unitLabel={t("quotas.size.unit")}
            disabled={save.isPending}
          />
          {mib === undefined && value.amount.trim() !== "" && (
            <p className="mt-1 text-state-warn">
              <span aria-hidden="true">▲ </span>
              {t("quotas.size.invalid")}
            </p>
          )}
          {mib !== undefined && mib !== row.quota && (
            <p className="mt-1 text-ink-muted">
              {t("quotas.edit.from", {
                from: formatCapacityMiB(row.quota, locale) || "0",
                to: formatCapacityMiB(mib, locale) || "0",
              })}
            </p>
          )}
        </div>
        <div className="max-w-64">
          <span className="mb-1 block text-ink-muted">{t("quotas.fields.app")}</span>
          <Combobox
            options={(apps.data ?? []).map((code) => ({ value: code, label: code }))}
            value={app}
            onChange={setApp}
            freeText
            label={t("quotas.fields.app")}
            placeholder={t("quotas.fields.app")}
            emptyText={t("detail.noMatch")}
            className="w-full"
          />
        </div>
        {save.isError && (
          <p role="alert" className="text-state-down">
            ■ {save.error.message}
          </p>
        )}
        {done !== null && (
          <p role="status" className="text-ink-muted">
            <span aria-hidden="true">✓ </span>
            {done}
          </p>
        )}
        <div>
          <button
            type="submit"
            disabled={!changed || mib === undefined || save.isPending}
            className="h-8 rounded-(--radius-control) bg-accent px-3 font-medium text-accent-ink disabled:opacity-60"
          >
            {save.isPending ? t("quotas.edit.saving") : t("quotas.edit.save")}
          </button>
        </div>
      </form>
      <div>
        <ConfirmButton
          icon={<TrashIcon />}
          label={t("quotas.delete.label")}
          question={t("quotas.delete.question", {
            app: row.app,
            array: row.array_name,
            dg: row.dg_name,
          })}
          confirmLabel={t("detail.deleteConfirm")}
          cancelLabel={t("detail.cancel")}
          pendingLabel={t("detail.deleting")}
          pending={remove.isPending}
          onConfirm={() => {
            remove.mutate();
          }}
        />
        {remove.isError && (
          <p role="alert" className="mt-2 text-state-down">
            ■ {remove.error.message}
          </p>
        )}
      </div>
    </section>
  );
}
