import { useEffect, useId, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";
import { Combobox, type ComboboxOption } from "@/components/ui/Combobox";
import { SlideOver } from "@/components/ui/SlideOver";
import { ObjectIcon } from "@/components/opensvc/ObjectIcon";
import { isPattern, parseInteger, useCheckTypes } from "./check-admin";

interface Fields {
  fset_id: string;
  chk_type: string;
  chk_instance: string;
  chk_low: string;
  chk_high: string;
}

const EMPTY: Fields = { fset_id: "", chk_type: "", chk_instance: "", chk_low: "", chk_high: "" };

const INPUT = "h-8 w-full rounded-(--radius-control) border border-line bg-surface px-2";

/** Every filterset, by name, for the picker. */
function useFiltersetOptions(enabled: boolean) {
  return useQuery({
    queryKey: ["filtersets", "options"],
    enabled,
    queryFn: async (): Promise<ComboboxOption[]> => {
      const { data, error } = await api.GET("/filtersets", {
        params: { query: { props: "id,fset_name", orderby: "fset_name", limit: 0 } },
      });
      if (error !== undefined) throw new Error(problemText(error));
      const rows = Array.isArray(data.data) ? data.data : [];
      return rows.flatMap((row) =>
        row.id === undefined || row.fset_name === undefined
          ? []
          : [{ value: String(row.id), label: row.fset_name }],
      );
    },
  });
}

/**
 * Adding contextual thresholds, the historical "Add contextual thresholds" form:
 * the filterset selecting the nodes, and services, they apply to, the check type,
 * the pattern of the instances (an unanchored regular expression), and both
 * thresholds, all required. The API requires ContextCheckManager; the checks of
 * the type take them in the background.
 */
export function CreateCheckContextualPanel({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: number) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const id = useId();
  const [fields, setFields] = useState<Fields>(EMPTY);
  const types = useCheckTypes(open);
  const filtersets = useFiltersetOptions(open);

  // Every opening starts from an empty panel.
  useEffect(() => {
    if (open) setFields(EMPTY);
  }, [open]);

  const low = parseInteger(fields.chk_low);
  const high = parseInteger(fields.chk_high);
  const invalid = {
    chk_instance: fields.chk_instance !== "" && !isPattern(fields.chk_instance),
    chk_low: Number.isNaN(low),
    chk_high: Number.isNaN(high),
    order: low !== undefined && high !== undefined && low > high,
  };
  const blocked =
    Object.values(invalid).some(Boolean) ||
    fields.fset_id === "" ||
    fields.chk_type.trim() === "" ||
    fields.chk_instance === "" ||
    low === undefined ||
    high === undefined;

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST("/checks/contextual_settings", {
        body: {
          fset_id: Number(fields.fset_id),
          chk_type: fields.chk_type.trim(),
          chk_instance: fields.chk_instance,
          chk_low: low,
          chk_high: high,
        },
      });
      if (error !== undefined) throw new Error(problemText(error));
      return data.id;
    },
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ["check-contextual"] });
      onCreated(created);
      onClose();
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!blocked) create.mutate();
  }

  function input(
    key: Exclude<keyof Fields, "fset_id">,
    extra: { numeric?: boolean; list?: string },
  ) {
    const wrong =
      (key === "chk_instance" && invalid.chk_instance) ||
      (key === "chk_low" && (invalid.chk_low || invalid.order)) ||
      (key === "chk_high" && (invalid.chk_high || invalid.order));
    return (
      <div className="mb-3">
        <label className="mb-1 block font-medium" htmlFor={`${id}-${key}`}>
          {t(`checkContextual.fields.${key}`)}
        </label>
        <input
          id={`${id}-${key}`}
          required
          maxLength={key === "chk_type" ? 10 : key === "chk_instance" ? 60 : undefined}
          inputMode={extra.numeric === true ? "numeric" : undefined}
          list={extra.list}
          value={fields[key]}
          aria-invalid={wrong}
          aria-describedby={`${id}-${key}-hint`}
          onChange={(event) => {
            setFields((previous) => ({ ...previous, [key]: event.target.value }));
          }}
          className={`${INPUT} ${extra.numeric === true ? "" : "font-mono"} aria-invalid:border-state-down`}
        />
        <p id={`${id}-${key}-hint`} className="mt-1 text-ink-muted">
          {wrong ? (
            <span className="text-state-down">■ {t(`checkContextual.create.invalid.${key}`)}</span>
          ) : (
            t(`checkContextual.create.hints.${key}`)
          )}
        </p>
      </div>
    );
  }

  return (
    <SlideOver
      open={open}
      title={t("checkContextual.create.title")}
      onClose={onClose}
      closeLabel={t("detail.close")}
      resizeLabel={t("detail.resize")}
      leading={<ObjectIcon kind="check" />}
    >
      <p className="mb-3 text-ink-muted">{t("checkContextual.create.intro")}</p>
      <form onSubmit={onSubmit}>
        <div className="mb-3">
          <p className="mb-1 font-medium">{t("checkContextual.fields.gen_filtersets.fset_name")}</p>
          {filtersets.isError ? (
            <p role="alert" className="text-state-down">
              ■ {filtersets.error.message}
            </p>
          ) : (
            <Combobox
              options={filtersets.data ?? []}
              value={fields.fset_id}
              onChange={(value) => {
                setFields((previous) => ({ ...previous, fset_id: value }));
              }}
              label={t("checkContextual.fields.gen_filtersets.fset_name")}
              placeholder={t("checkContextual.create.filtersetPlaceholder")}
              emptyText={t("actionsMenu.choiceNone")}
            />
          )}
          <p className="mt-1 text-ink-muted">{t("checkContextual.create.hints.fset_id")}</p>
        </div>
        {input("chk_type", { list: `${id}-types` })}
        <datalist id={`${id}-types`}>
          {(types.data ?? []).map((type) => (
            <option key={type} value={type} />
          ))}
        </datalist>
        {input("chk_instance", {})}
        {input("chk_low", { numeric: true })}
        {input("chk_high", { numeric: true })}

        {create.isError && (
          <p role="alert" className="mb-3 text-state-down">
            ■ {create.error.message}
          </p>
        )}
        <button
          type="submit"
          disabled={create.isPending || blocked}
          className="h-8 rounded-(--radius-control) bg-accent px-3 font-medium text-accent-ink disabled:opacity-60"
        >
          {create.isPending
            ? t("checkContextual.create.submitting")
            : t("checkContextual.create.submit")}
        </button>
      </form>
    </SlideOver>
  );
}
