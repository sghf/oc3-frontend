import { useEffect, useId, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";
import { SlideOver } from "@/components/ui/SlideOver";
import { ObjectIcon } from "@/components/opensvc/ObjectIcon";
import { isPattern, parseInteger, useCheckTypes } from "./check-admin";

interface Fields {
  chk_type: string;
  chk_inst: string;
  chk_prio: string;
  chk_low: string;
  chk_high: string;
}

const EMPTY: Fields = { chk_type: "", chk_inst: "", chk_prio: "0", chk_low: "", chk_high: "" };

const INPUT = "h-8 w-full rounded-(--radius-control) border border-line bg-surface px-2";

/**
 * Adding default thresholds, the historical "Add default thresholds" form: the
 * check type, the pattern of the instances they apply to (empty: every instance),
 * their priority among the defaults of the type that match, and the thresholds.
 * The API requires CheckManager and refuses defaults of the same type and pattern;
 * the checks of the type take them in the background.
 */
export function CreateCheckDefaultPanel({
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

  // Every opening starts from an empty panel.
  useEffect(() => {
    if (open) setFields(EMPTY);
  }, [open]);

  const low = parseInteger(fields.chk_low);
  const high = parseInteger(fields.chk_high);
  const prio = parseInteger(fields.chk_prio);
  const invalid = {
    pattern: !isPattern(fields.chk_inst),
    low: Number.isNaN(low),
    high: Number.isNaN(high),
    prio: Number.isNaN(prio),
    order: low !== undefined && high !== undefined && low > high,
  };
  const blocked = Object.values(invalid).some(Boolean) || fields.chk_type.trim() === "";

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST("/checks/defaults", {
        body: {
          chk_type: fields.chk_type.trim(),
          chk_inst: fields.chk_inst,
          chk_prio: prio ?? 0,
          chk_low: low,
          chk_high: high,
        },
      });
      if (error !== undefined) throw new Error(problemText(error));
      return data.id;
    },
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ["check-defaults"] });
      onCreated(created);
      onClose();
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!blocked) create.mutate();
  }

  function input(key: keyof Fields, extra: { numeric?: boolean; mono?: boolean; list?: string }) {
    const wrong =
      (key === "chk_inst" && invalid.pattern) ||
      (key === "chk_low" && (invalid.low || invalid.order)) ||
      (key === "chk_high" && (invalid.high || invalid.order)) ||
      (key === "chk_prio" && invalid.prio);
    return (
      <div className="mb-3">
        <label className="mb-1 block font-medium" htmlFor={`${id}-${key}`}>
          {t(`checkDefaults.fields.${key}`)}
        </label>
        <input
          id={`${id}-${key}`}
          required={key === "chk_type"}
          maxLength={key === "chk_type" ? 10 : undefined}
          inputMode={extra.numeric === true ? "numeric" : undefined}
          list={extra.list}
          value={fields[key]}
          aria-invalid={wrong}
          aria-describedby={`${id}-${key}-hint`}
          onChange={(event) => {
            setFields((previous) => ({ ...previous, [key]: event.target.value }));
          }}
          className={`${INPUT} ${extra.mono === true ? "font-mono" : ""} aria-invalid:border-state-down`}
        />
        <p id={`${id}-${key}-hint`} className="mt-1 text-ink-muted">
          {wrong ? (
            <span className="text-state-down">■ {t(`checkDefaults.create.invalid.${key}`)}</span>
          ) : (
            t(`checkDefaults.create.hints.${key}`)
          )}
        </p>
      </div>
    );
  }

  return (
    <SlideOver
      open={open}
      title={t("checkDefaults.create.title")}
      onClose={onClose}
      closeLabel={t("detail.close")}
      resizeLabel={t("detail.resize")}
      leading={<ObjectIcon kind="check" />}
    >
      <p className="mb-3 text-ink-muted">{t("checkDefaults.create.intro")}</p>
      <form onSubmit={onSubmit}>
        {input("chk_type", { mono: true, list: `${id}-types` })}
        <datalist id={`${id}-types`}>
          {(types.data ?? []).map((type) => (
            <option key={type} value={type} />
          ))}
        </datalist>
        {input("chk_inst", { mono: true })}
        {input("chk_prio", { numeric: true })}
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
            ? t("checkDefaults.create.submitting")
            : t("checkDefaults.create.submit")}
        </button>
      </form>
    </SlideOver>
  );
}
