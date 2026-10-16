import { useEffect, useId, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { SlideOver } from "@/components/ui/SlideOver";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { TrashIcon } from "@/components/ui/icons";
import { ObjectIcon } from "@/components/opensvc/ObjectIcon";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";
import { EMPTY_VALUE } from "@/lib/column-filters";
import { matchesPattern } from "@/lib/pattern";
import { toValueStats, type ValueCount } from "@/lib/api/value-stats";
import {
  FIELD_CONSTRAINTS_KEY,
  useFieldConstraints,
  type FieldConstraint,
  type FieldConstraintKind,
  type FieldConstraintMode,
} from "./use-field-constraints";
import { KINDS, KIND_INFO, isKind } from "./kinds";

const MODES: FieldConstraintMode[] = ["suggest", "strict", "regex"];

/** What oc3 accepts: past it, the values are summed up as "other" by the stats. */
const MAX_VALUES = 2000;
const MAX_PATTERN = 1024;

/** Values that do not comply named before the rest is summed up. */
const OUTSIDE_SHOWN = 5;

/**
 * The values a kind of object holds in an attribute, the most frequent first, the
 * empty one left out: from the stats of the list of that kind.
 */
async function heldValues(kind: FieldConstraintKind, field: string): Promise<ValueCount[]> {
  const query = { props: field, stats: "1", limit: MAX_VALUES };
  const response =
    kind === "node"
      ? await api.GET("/nodes", { params: { query } })
      : kind === "service"
        ? await api.GET("/services", { params: { query } })
        : await api.GET("/apps", { params: { query } });
  if (response.error !== undefined) throw new Error(problemText(response.error));
  return toValueStats(response.data.data, response.data.meta, field).values.filter(
    (v) => v.value !== EMPTY_VALUE && v.value !== "",
  );
}

/** One value per line, trimmed, the empty lines and the duplicates left out. */
function parseValues(text: string): string[] {
  const seen = new Set<string>();
  for (const line of text.split("\n")) {
    const value = line.trim();
    if (value !== "") seen.add(value);
  }
  return [...seen];
}

/**
 * The constraint of an attribute, in a drawer: a list of values, typed one per
 * line or filled from the values the objects hold, or a pattern the whole value
 * must match, which a sample value can be tried against. For a new constraint, the
 * panel it applies to is chosen first (nodes, services, apps: a table of the
 * collector each), then the attribute among those of that panel still free text.
 * Before saving, the objects whose value would not comply are counted: they keep
 * it, but a user changing it will have to comply. Removing the constraint makes the
 * attribute free text again.
 */
export function FieldConstraintPanel({
  open,
  constraint,
  canEdit,
  onClose,
}: {
  open: boolean;
  /** The constraint shown; undefined for a new one. */
  constraint: FieldConstraint | undefined;
  canEdit: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const queryClient = useQueryClient();
  const creating = constraint === undefined;
  const [chosenKind, setChosenKind] = useState<FieldConstraintKind | "">("");
  const [chosen, setChosen] = useState("");
  const [mode, setMode] = useState<FieldConstraintMode>("suggest");
  const [text, setText] = useState("");
  const [pattern, setPattern] = useState("");
  const [sample, setSample] = useState("");
  const field = constraint?.field ?? chosen;
  const kind = constraint?.object_kind ?? (chosenKind === "" ? undefined : chosenKind);
  // For a new constraint, the attributes of the panel chosen still free text.
  const ofKind = useFieldConstraints(creating ? kind : undefined);
  const constrained = new Set((ofKind.data?.data ?? []).map((c) => c.field));
  const available = (ofKind.data?.fields ?? []).filter((f) => !constrained.has(f));

  useEffect(() => {
    if (!open) return;
    setChosenKind("");
    setChosen("");
    setMode(constraint?.mode ?? "suggest");
    setText(constraint?.values.join("\n") ?? "");
    setPattern(constraint?.pattern ?? "");
    setSample("");
    // Reset on opening, on another attribute, or when the saved constraint changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, constraint?.field, constraint?.updated]);

  // The values the objects hold, under the root key of their list, refreshed with it.
  const held = useQuery({
    queryKey: [kind === undefined ? "" : KIND_INFO[kind].table, "value-stats", field],
    enabled: open && kind !== undefined && field !== "",
    queryFn: () => heldValues(kind ?? "node", field),
  });

  const regex = mode === "regex";
  const values = parseValues(text);
  const listed = new Set(values);
  const trimmedPattern = pattern.trim();
  // undefined: the browser cannot compile the pattern, the server will say.
  const patternCompiles = regex ? matchesPattern(trimmedPattern, "") !== undefined : true;
  const outside = (held.data ?? []).filter((v) =>
    regex
      ? trimmedPattern !== "" && matchesPattern(trimmedPattern, v.value) === false
      : !listed.has(v.value),
  );
  const outsideNodes = outside.reduce((sum, v) => sum + v.count, 0);
  const sampleMatch =
    regex && sample !== "" && trimmedPattern !== ""
      ? matchesPattern(trimmedPattern, sample)
      : undefined;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: [FIELD_CONSTRAINTS_KEY] });

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await api.POST("/field_constraints/{object_kind}/{field}", {
        params: { path: { object_kind: kind ?? "node", field } },
        body: regex ? { mode, pattern: trimmedPattern } : { mode, values },
      });
      if (error !== undefined) throw new Error(problemText(error));
    },
    onSuccess: async () => {
      await invalidate();
      onClose();
    },
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await api.DELETE("/field_constraints/{object_kind}/{field}", {
        params: { path: { object_kind: kind ?? "node", field } },
      });
      if (error !== undefined) throw new Error(problemText(error));
    },
    onSuccess: async () => {
      await invalidate();
      onClose();
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    save.mutate();
  }

  function importHeld() {
    setText([...values, ...outside.map((v) => v.value)].join("\n"));
  }

  const label =
    field === "" || kind === undefined ? "" : t(`${KIND_INFO[kind].fieldPrefix}.${field}`);
  const tooMany = !regex && values.length > MAX_VALUES;
  const incomplete =
    kind === undefined || field === "" || (regex ? trimmedPattern === "" : values.length === 0);

  return (
    <SlideOver
      open={open}
      title={
        creating
          ? t("fieldConstraints.panel.newTitle")
          : t("fieldConstraints.panel.title", { field: label })
      }
      onClose={onClose}
      closeLabel={t("detail.close")}
      resizeLabel={t("detail.resize")}
      leading={<ObjectIcon kind="fieldConstraint" />}
      closeOnOutsideClick={false}
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        {creating && (
          <div>
            <label htmlFor={`${id}-kind`} className="mb-1 block font-medium">
              {t("fieldConstraints.fields.object_kind")}
            </label>
            <select
              id={`${id}-kind`}
              required
              value={chosenKind}
              onChange={(event) => {
                const next = event.target.value;
                setChosenKind(isKind(next) ? next : "");
                // The attributes are those of the panel: another panel, another choice.
                setChosen("");
              }}
              className="h-8 w-full rounded-(--radius-control) border border-line bg-surface px-2"
            >
              <option value="">{t("fieldConstraints.panel.chooseKind")}</option>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(KIND_INFO[k].labelKey)} ({KIND_INFO[k].table})
                </option>
              ))}
            </select>
          </div>
        )}
        {creating && kind !== undefined && (
          <div>
            <label htmlFor={`${id}-field`} className="mb-1 block font-medium">
              {t("fieldConstraints.fields.field")}
            </label>
            <select
              id={`${id}-field`}
              required
              value={chosen}
              disabled={ofKind.isPending}
              aria-describedby={`${id}-field-hint`}
              onChange={(event) => {
                setChosen(event.target.value);
              }}
              className="h-8 w-full rounded-(--radius-control) border border-line bg-surface px-2"
            >
              <option value="">
                {ofKind.isPending
                  ? t("detail.loading")
                  : available.length === 0
                    ? t("fieldConstraints.panel.noFieldLeft")
                    : t("fieldConstraints.panel.chooseField")}
              </option>
              {available.map((f) => (
                <option key={f} value={f}>
                  {t(`${KIND_INFO[kind].fieldPrefix}.${f}`)} ({f})
                </option>
              ))}
            </select>
            <p id={`${id}-field-hint`} className="mt-1 text-ink-muted">
              {t("fieldConstraints.panel.fieldHint")}
            </p>
          </div>
        )}

        <fieldset disabled={!canEdit} className="flex flex-col gap-2">
          <legend className="mb-1 font-medium">{t("fieldConstraints.fields.mode")}</legend>
          {MODES.map((m) => (
            <label key={m} className="flex cursor-pointer items-start gap-2">
              <input
                type="radio"
                name={`${id}-mode`}
                value={m}
                checked={mode === m}
                onChange={() => {
                  setMode(m);
                }}
                className="mt-1"
              />
              <span>
                <span className="font-medium">{t(`fieldConstraints.modes.${m}`)}</span>
                <span className="block text-ink-muted">{t(`fieldConstraints.modeHints.${m}`)}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {regex ? (
          <div className="flex flex-col gap-2">
            <div>
              <label htmlFor={`${id}-pattern`} className="mb-1 block font-medium">
                {t("fieldConstraints.panel.pattern")}
              </label>
              <input
                id={`${id}-pattern`}
                value={pattern}
                readOnly={!canEdit}
                maxLength={MAX_PATTERN}
                spellCheck={false}
                placeholder="R[0-9]{2}"
                aria-describedby={`${id}-pattern-hint`}
                aria-invalid={!patternCompiles || undefined}
                onChange={(event) => {
                  setPattern(event.target.value);
                }}
                className="h-8 w-full rounded-(--radius-control) border border-line bg-surface px-2 font-mono"
              />
              <p id={`${id}-pattern-hint`} className="mt-1 text-ink-muted">
                {t("fieldConstraints.panel.patternHint")}
              </p>
              {!patternCompiles && trimmedPattern !== "" && (
                <p className="mt-1 text-ink-muted">
                  <span aria-hidden="true">▲ </span>
                  {t("fieldConstraints.panel.patternUnchecked")}
                </p>
              )}
            </div>
            <div>
              <label htmlFor={`${id}-sample`} className="mb-1 block font-medium">
                {t("fieldConstraints.panel.sample")}
              </label>
              <div className="flex items-center gap-2">
                <input
                  id={`${id}-sample`}
                  value={sample}
                  spellCheck={false}
                  onChange={(event) => {
                    setSample(event.target.value);
                  }}
                  className="h-8 min-w-0 flex-1 rounded-(--radius-control) border border-line bg-surface px-2 font-mono"
                />
                <span role="status" className="shrink-0">
                  {sampleMatch === true && `✓ ${t("fieldConstraints.panel.sampleMatches")}`}
                  {sampleMatch === false && `✗ ${t("fieldConstraints.panel.sampleFails")}`}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <label htmlFor={`${id}-values`} className="font-medium">
                {t("fieldConstraints.panel.values", { count: values.length })}
              </label>
              {canEdit && field !== "" && (
                <button
                  type="button"
                  disabled={outside.length === 0}
                  onClick={importHeld}
                  className="h-7 rounded-(--radius-control) border border-line px-2 text-ink hover:bg-surface-sunken disabled:opacity-60"
                >
                  {outside.length === 0
                    ? t("fieldConstraints.panel.importNone")
                    : t("fieldConstraints.panel.import", { count: outside.length })}
                </button>
              )}
            </div>
            <textarea
              id={`${id}-values`}
              value={text}
              readOnly={!canEdit}
              rows={12}
              spellCheck={false}
              aria-describedby={`${id}-values-hint`}
              onChange={(event) => {
                setText(event.target.value);
              }}
              className="w-full rounded-(--radius-control) border border-line bg-surface px-2 py-1 font-mono"
            />
            <p id={`${id}-values-hint`} className="mt-1 text-ink-muted">
              {t("fieldConstraints.panel.valuesHint")}
            </p>
          </div>
        )}

        {held.isError && (
          <p role="alert" className="text-state-down">
            ■ {t("fieldConstraints.panel.heldError", { message: held.error.message })}
          </p>
        )}
        {held.data !== undefined && outsideNodes > 0 && (
          <p
            role="note"
            className="rounded-(--radius-panel) border border-state-warn bg-state-warn-soft p-2 text-ink"
          >
            <span aria-hidden="true" className="text-state-warn">
              ▲
            </span>{" "}
            {t(`fieldConstraints.panel.outside.${mode}`, {
              count: outsideNodes,
              objects: t(`fieldConstraints.objects.${kind ?? "node"}`, { count: outsideNodes }),
              values: outside
                .slice(0, OUTSIDE_SHOWN)
                .map((v) => `${v.value} (${String(v.count)})`)
                .join(", "),
            })}
            {outside.length > OUTSIDE_SHOWN &&
              ` ${t("fieldConstraints.more", { count: outside.length - OUTSIDE_SHOWN })}`}
          </p>
        )}
        {tooMany && (
          <p role="alert" className="text-state-down">
            ■ {t("fieldConstraints.panel.tooMany", { max: MAX_VALUES })}
          </p>
        )}
        {(save.isError || remove.isError) && (
          <p role="alert" className="text-state-down">
            ■ {(save.error ?? remove.error)?.message}
          </p>
        )}

        {canEdit ? (
          <div className="flex flex-wrap items-start justify-between gap-2">
            <button
              type="submit"
              disabled={save.isPending || incomplete || tooMany}
              className="h-8 rounded-(--radius-control) bg-accent px-3 font-medium text-accent-ink disabled:opacity-60"
            >
              {save.isPending
                ? t("fieldConstraints.panel.saving")
                : t("fieldConstraints.panel.save")}
            </button>
            {!creating && (
              <ConfirmButton
                icon={<TrashIcon className="h-3.5 w-3.5" />}
                label={t("fieldConstraints.panel.remove")}
                question={t("fieldConstraints.panel.removeQuestion", { field: label })}
                confirmLabel={t("fieldConstraints.panel.remove")}
                cancelLabel={t("detail.cancel")}
                pendingLabel={t("fieldConstraints.panel.removing")}
                pending={remove.isPending}
                onConfirm={() => {
                  remove.mutate();
                }}
              />
            )}
          </div>
        ) : (
          <p className="text-ink-muted">{t("fieldConstraints.panel.readOnly")}</p>
        )}
      </form>
    </SlideOver>
  );
}
