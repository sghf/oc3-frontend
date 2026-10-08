import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { components } from "@/lib/api/schema";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";
import { SlideOver } from "@/components/ui/SlideOver";
import { ObjectIcon } from "@/components/opensvc/ObjectIcon";
import { isFilterOperator, type FilterDefinition } from "./filter-definition";
import { FilterFields } from "./FilterFields";
import { useFilterDefinitions } from "./use-filter-definitions";

type FilterRow = components["schemas"]["FilterRow"];

const EMPTY: FilterDefinition = { f_table: "nodes", f_field: "", f_op: "=", f_value: "" };

function fromRow(row: FilterRow | null | undefined): FilterDefinition {
  if (row === null || row === undefined) return EMPTY;
  return {
    f_table: row.f_table ?? EMPTY.f_table,
    f_field: row.f_field ?? "",
    f_op: isFilterOperator(row.f_op) ? row.f_op : EMPTY.f_op,
    f_value: row.f_value ?? "",
  };
}

/**
 * Creating or editing a filter, in a single form.
 *
 * The filter is edited as a whole rather than field by field: changing the table
 * alone would often leave a column that does not exist in it, which apicollector
 * refuses. The server validates the complete definition — table, operator, column,
 * uniqueness — and its refusals are shown as they are.
 */
export function FilterFormPanel({
  open,
  filter,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** Filter to edit; absent, the form creates one. */
  filter?: FilterRow | null;
  onClose: () => void;
  onSaved?: (id: number | undefined) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const editing = filter !== undefined && filter !== null;
  const [definition, setDefinition] = useState<FilterDefinition>(fromRow(filter));

  // Every opening starts again from the filter to edit, or from an empty form.
  useEffect(() => {
    if (open) setDefinition(fromRow(filter));
  }, [open, filter]);

  const save = useMutation({
    mutationFn: async () => {
      if (editing) {
        const { data, error } = await api.POST("/filters/{filter_id}", {
          params: { path: { filter_id: String(filter.id) } },
          body: definition,
        });
        if (error !== undefined) throw new Error(problemText(error));
        return Array.isArray(data.data) ? data.data[0]?.id : undefined;
      }
      const { data, error } = await api.POST("/filters", { body: definition });
      if (error !== undefined) throw new Error(problemText(error));
      return Array.isArray(data.data) ? data.data[0]?.id : undefined;
    },
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({ queryKey: ["filters"] });
      await queryClient.invalidateQueries({ queryKey: ["filter"] });
      // The filtersets using it see their selection change.
      await queryClient.invalidateQueries({ queryKey: ["filtersets"] });
      onSaved?.(id);
      onClose();
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    save.mutate();
  }

  const prefix = editing ? "edit-filter" : "create-filter";
  const fieldSuggestions = useFilterDefinitions(open).fieldsOf(definition.f_table);

  return (
    <SlideOver
      // Created like the other objects, closing on a click beside it; an existing one
      // being edited is not dropped by a stray click.
      closeOnOutsideClick={!editing}
      open={open}
      title={editing ? t("filters.form.editTitle") : t("filters.form.createTitle")}
      onClose={onClose}
      closeLabel={t("detail.close")}
      resizeLabel={t("detail.resize")}
      leading={<ObjectIcon kind="filter" />}
    >
      <p className="mb-3 text-ink-muted">
        {editing ? t("filters.form.editIntro") : t("filters.form.createIntro")}
      </p>

      <form onSubmit={onSubmit}>
        <FilterFields
          definition={definition}
          onChange={setDefinition}
          idPrefix={prefix}
          fieldSuggestions={fieldSuggestions}
        />

        {save.isError && (
          <p role="alert" className="mb-3 text-state-down">
            ■ {save.error.message}
          </p>
        )}

        <button
          type="submit"
          disabled={save.isPending}
          className="h-8 rounded-(--radius-control) bg-accent px-3 font-medium text-accent-ink disabled:opacity-60"
        >
          {save.isPending
            ? t("filters.form.saving")
            : editing
              ? t("filters.form.saveEdit")
              : t("filters.form.saveCreate")}
        </button>
      </form>
    </SlideOver>
  );
}
