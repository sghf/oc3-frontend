import { useState, type FormEvent, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { FilterFields } from "@/features/filters/FilterFields";
import type { FilterDefinition } from "@/features/filters/filter-definition";
import { useFilterDefinitions } from "@/features/filters/use-filter-definitions";

/**
 * A filter written in place, within the composition of a filterset, without
 * leaving it: the same fields as the form of the Filters view. A definition some
 * filter already has is said, and that filter is reused rather than created again.
 * "Create and add" hands the definition and the filter to reuse, if any, to the
 * composition, which attaches it.
 */
export function NewFilterForm({
  initialTable,
  busy,
  onSubmit,
  onCancel,
}: {
  /** The table to start from: the one the filterset filters most, or nodes. */
  initialTable: string;
  busy: boolean;
  onSubmit: (definition: FilterDefinition, existing: number | undefined) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const definitions = useFilterDefinitions();
  const [definition, setDefinition] = useState<FilterDefinition>({
    f_table: initialTable,
    f_field: "",
    f_op: "=",
    f_value: "",
  });
  const complete = definition.f_field.trim() !== "" && definition.f_value !== "";
  const existing = complete ? definitions.existing(definition) : undefined;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!complete) return;
    onSubmit({ ...definition, f_field: definition.f_field.trim() }, existing);
  }

  function onKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      onCancel();
    }
  }

  return (
    <form
      onSubmit={submit}
      onKeyDown={onKeyDown}
      aria-label={t("filtersets.newFilter.title")}
      className="mt-2 rounded-(--radius-panel) border border-line bg-surface p-3"
    >
      <p className="mb-2 font-semibold">{t("filtersets.newFilter.title")}</p>
      <FilterFields
        definition={definition}
        onChange={setDefinition}
        idPrefix="filterset-new-filter"
        layout="inline"
        fieldSuggestions={definitions.fieldsOf(definition.f_table)}
        autoFocus
      />
      {existing !== undefined && (
        <p role="status" className="mt-1">
          <span aria-hidden="true" className="text-accent">
            ●
          </span>{" "}
          {t("filtersets.newFilter.existing")}
        </p>
      )}
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="h-7 rounded-(--radius-control) border border-line bg-surface px-3"
        >
          {t("detail.cancel")}
        </button>
        <button
          type="submit"
          disabled={busy || !complete}
          className="h-7 rounded-(--radius-control) bg-accent px-3 font-medium text-accent-ink disabled:opacity-60"
        >
          {existing !== undefined
            ? t("filtersets.newFilter.reuse")
            : t("filtersets.newFilter.create")}
        </button>
      </div>
    </form>
  );
}
