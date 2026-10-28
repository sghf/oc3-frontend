import { useId, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ObjectIcon } from "@/components/opensvc/ObjectIcon";
import { Combobox } from "@/components/ui/Combobox";
import { SlideOver } from "@/components/ui/SlideOver";
import { useAppCodes } from "@/features/apps/use-app-codes";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";
import { formatCapacityMiB } from "@/lib/format";
import { SizeInput } from "./quota-parts";
import { sizeMiB, type SizeValue } from "./quota-size";
import { setQuota, useArrays, useDiskGroups, type QuotaRow } from "./use-quotas";

const SELECT = "h-8 w-full rounded-(--radius-control) border border-line bg-surface px-2";

/**
 * A quota given to an application code in a disk group: the array, then one of
 * its disk groups, with what it can still reserve, the application and the size.
 * An application with a quota there already has it replaced, as the API does,
 * and the form says so first.
 */
export function CreateQuotaPanel({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: number) => void;
}) {
  const { t, i18n } = useTranslation();
  const id = useId();
  const queryClient = useQueryClient();
  const arrays = useArrays();
  const apps = useAppCodes();
  const [arrayId, setArrayId] = useState("");
  const [dgId, setDgId] = useState("");
  const [app, setApp] = useState("");
  const [value, setValue] = useState<SizeValue>({ amount: "", unit: "TiB" });
  const diskGroups = useDiskGroups(arrayId === "" ? undefined : arrayId);
  const dg = diskGroups.data?.find((d) => String(d.id) === dgId);
  const existing = useDiskGroupQuotas(arrayId, dgId);
  const current = existing.data?.find((q) => q.app === app);
  const mib = sizeMiB(value);
  const size = (n: number | undefined) => formatCapacityMiB(n, i18n.language) || "0";
  // What the disk group can still reserve once this quota is given: the one the
  // application has there is replaced, not added to.
  const reservable =
    dg === undefined
      ? undefined
      : (dg.dg_size ?? 0) - (dg.dg_reserved ?? 0) + (current?.quota ?? 0);

  const create = useMutation({
    mutationFn: () => setQuota(arrayId, Number(dgId), app, mib ?? 0),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["quotas"] });
      setDgId("");
      setApp("");
      setValue({ amount: "", unit: "TiB" });
      onClose();
      onCreated(result.id);
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (arrayId === "" || dgId === "" || app === "" || mib === undefined || create.isPending)
      return;
    create.mutate();
  }

  return (
    <SlideOver
      open={open}
      title={t("quotas.create.title")}
      onClose={onClose}
      closeLabel={t("detail.close")}
      resizeLabel={t("detail.resize")}
      leading={<ObjectIcon kind="disk" />}
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <div>
          <label className="mb-1 block font-medium" htmlFor={`${id}-array`}>
            {t("quotas.fields.array_name")}
          </label>
          <select
            id={`${id}-array`}
            required
            value={arrayId}
            onChange={(event) => {
              setArrayId(event.target.value);
              setDgId("");
            }}
            className={SELECT}
          >
            <option value="">{t("quotas.create.pickArray")}</option>
            {(arrays.data ?? []).map((a) => (
              <option key={a.id} value={String(a.id)}>
                {a.array_name}
                {a.array_model !== undefined && a.array_model !== "" ? ` · ${a.array_model}` : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block font-medium" htmlFor={`${id}-dg`}>
            {t("quotas.fields.dg_name")}
          </label>
          <select
            id={`${id}-dg`}
            required
            disabled={arrayId === ""}
            value={dgId}
            onChange={(event) => {
              setDgId(event.target.value);
            }}
            className={`${SELECT} disabled:opacity-60`}
          >
            <option value="">{t("quotas.create.pickDiskGroup")}</option>
            {(diskGroups.data ?? []).map((d) => (
              <option key={d.id} value={String(d.id)}>
                {d.dg_name} · {size(d.dg_size)}
              </option>
            ))}
          </select>
          {dg !== undefined && (
            <p className="mt-1 text-ink-muted tabular-nums">
              {t("quotas.create.dgSummary", {
                size: size(dg.dg_size),
                reserved: size(dg.dg_reserved),
                reservable: size((dg.dg_size ?? 0) - (dg.dg_reserved ?? 0)),
              })}
            </p>
          )}
        </div>
        <div>
          <span className="mb-1 block font-medium">{t("quotas.fields.app")}</span>
          <Combobox
            options={(apps.data ?? []).map((code) => ({ value: code, label: code }))}
            value={app}
            onChange={setApp}
            freeText
            label={t("quotas.fields.app")}
            placeholder={t("quotas.create.pickApp")}
            emptyText={t("detail.noMatch")}
            className="w-full"
          />
          {current !== undefined && (
            <p className="mt-1 text-state-warn">
              <span aria-hidden="true">▲ </span>
              {t("quotas.create.replaces", { app, quota: size(current.quota) })}
            </p>
          )}
        </div>
        <div>
          <span className="mb-1 block font-medium">{t("quotas.fields.quota")}</span>
          <SizeInput
            value={value}
            onChange={setValue}
            label={t("quotas.fields.quota")}
            unitLabel={t("quotas.size.unit")}
          />
          {mib === undefined && value.amount.trim() !== "" && (
            <p className="mt-1 text-state-warn">
              <span aria-hidden="true">▲ </span>
              {t("quotas.size.invalid")}
            </p>
          )}
          {mib !== undefined && reservable !== undefined && mib > reservable && (
            <p className="mt-1 text-state-warn">
              <span aria-hidden="true">▲ </span>
              {t("quotas.create.overReservable", { reservable: size(reservable) })}
            </p>
          )}
        </div>
        {create.isError && (
          <p role="alert" className="text-state-down">
            ■ {create.error.message}
          </p>
        )}
        <div>
          <button
            type="submit"
            disabled={
              arrayId === "" || dgId === "" || app === "" || mib === undefined || create.isPending
            }
            className="h-8 rounded-(--radius-control) bg-accent px-3 font-medium text-accent-ink disabled:opacity-60"
          >
            {create.isPending
              ? t("quotas.create.submitting")
              : current !== undefined
                ? t("quotas.create.replace")
                : t("quotas.create.submit")}
          </button>
        </div>
      </form>
    </SlideOver>
  );
}

/** The quotas of a disk group, to tell an application that has one there already. */
function useDiskGroupQuotas(arrayId: string, dgId: string) {
  return useQuery({
    queryKey: ["quotas", "diskgroup", arrayId, dgId],
    enabled: arrayId !== "" && dgId !== "",
    queryFn: async () => {
      const { data, error } = await api.GET("/arrays/{array_id}/diskgroups/{dg_id}/quotas", {
        params: {
          path: { array_id: arrayId, dg_id: Number(dgId) },
          query: { props: "id,app,quota", limit: 0 },
        },
      });
      if (error !== undefined) throw new Error(problemText(error));
      const rows: QuotaRow[] = Array.isArray(data.data) ? data.data : [];
      return rows;
    },
  });
}
