import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api/client";
import { compIdOf, compLinkOf, useCompObjects } from "@/lib/api/compliance";
import { DetailPanel, type DetailGroup } from "@/components/opensvc/DetailPanel";
import {
  AddByName,
  ChangeOutcomeLine,
  EditorPart,
  InlineName,
  ObjectChips,
  RemoveButton,
  TeamsPart,
  UsedByPart,
} from "@/components/opensvc/CompEditorParts";
import { COMP_BUTTON, useChanges, type RunChange } from "@/components/opensvc/comp-changes";
import { Combobox } from "@/components/ui/Combobox";
import { DateTime } from "@/components/ui/DateTime";
import { PencilIcon } from "@/components/ui/icons";
import {
  useComplianceGroups,
  useDesignerFiltersets,
  useVariableClasses,
} from "@/features/designer/use-designer-data";
import { FormRender } from "@/features/forms/FormRender";
import { FormValue } from "@/features/forms/FormValue";
import { useFormDefinitionByName } from "@/features/forms/use-form";
import { useFormUser } from "@/features/forms/use-form-user";
import { UserLink } from "@/features/users/UserLink";
import {
  useRuleset,
  useRulesetChanged,
  useRulesetResponsible,
  useRulesetUsage,
  type RulesetDetail,
  type RulesetRecord,
  type RulesetVariable,
} from "./use-ruleset";

const text = (prop: keyof RulesetRecord) => (row: RulesetRecord) => {
  const value = row[prop];
  return value === "" ? undefined : String(value);
};

const GROUPS: DetailGroup<RulesetRecord>[] = [
  {
    key: "identity",
    family: "ruleset",
    fields: [
      { prop: "ruleset_name", format: text("ruleset_name"), editable: true },
      { prop: "ruleset_type", format: text("ruleset_type"), editable: true, optionsKey: "type" },
      { prop: "ruleset_public", format: text("ruleset_public"), editable: true, input: "boolean" },
    ],
  },
  {
    key: "record",
    family: "time",
    fields: [{ prop: "id", format: text("id") }],
  },
];

/** The two kinds of ruleset: explicit ones are attached by hand, contextual ones by their filterset. */
const TYPE_OPTIONS = { type: ["explicit", "contextual"] };

/**
 * A ruleset: its name, type and visibility, its filterset when contextual, its
 * variables with their values laid out by the form of their class, the rulesets
 * it includes, its teams and what uses it. A responsible with the CompManager
 * privilege edits all of it in place, each change written to the collector at
 * once, as the historical ruleset editor does; the others read it, and the server
 * refuses a responsible without the privilege with its message.
 */
export function RulesetDetailPanel({
  rsetId,
  label,
  onClose,
}: {
  rsetId: string | undefined;
  label: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const detail = useRuleset(rsetId);
  const responsible = useRulesetResponsible(rsetId);
  const editable = responsible.data === true;
  const changed = useRulesetChanged();
  const { outcome, busy, change, dismiss } = useChanges(async () => {
    if (rsetId !== undefined) await changed(rsetId);
  });

  const name = detail.data?.row.ruleset_name ?? "";
  return (
    <DetailPanel
      kind="ruleset"
      open={rsetId !== undefined}
      recordId={rsetId}
      title={name !== "" ? name : label === "" ? t("rulesets.detail.title") : label}
      onClose={() => {
        dismiss();
        onClose();
      }}
      groups={GROUPS}
      row={detail.data?.row ?? (detail.data === null ? null : undefined)}
      labelPrefix="rulesets.detail.fields"
      groupPrefix="rulesets.detail.groups"
      isPending={detail.isPending}
      errorMessage={
        detail.isError
          ? detail.error.message
          : detail.data === null
            ? t("rulesets.detail.notFound")
            : null
      }
      options={TYPE_OPTIONS}
      editHint={t("rulesets.detail.editHint")}
      onSave={
        editable
          ? async (changes) => {
              if (rsetId === undefined) return;
              const body: {
                ruleset_name?: string;
                ruleset_type?: "explicit" | "contextual";
                ruleset_public?: boolean;
              } = {};
              const { ruleset_name, ruleset_type, ruleset_public } = changes;
              if (typeof ruleset_name === "string") body.ruleset_name = ruleset_name.trim();
              if (ruleset_type === "explicit" || ruleset_type === "contextual")
                body.ruleset_type = ruleset_type;
              if (typeof ruleset_public === "boolean") body.ruleset_public = ruleset_public;
              const refused = await change(t("rulesets.detail.saved"), () =>
                api.POST("/compliance/rulesets/{rset_id}", {
                  params: { path: { rset_id: rsetId } },
                  body,
                }),
              );
              if (refused !== null) throw new Error(refused);
            }
          : undefined
      }
      actions={
        detail.data !== undefined && detail.data !== null && rsetId !== undefined ? (
          <div className="space-y-3">
            {!editable && <p className="text-ink-muted">{t("rulesets.detail.readOnly")}</p>}
            <ChangeOutcomeLine outcome={outcome} onDismiss={dismiss} />
            <RulesetContent
              rsetId={rsetId}
              detail={detail.data}
              editable={editable}
              busy={busy}
              change={change}
            />
          </div>
        ) : undefined
      }
    />
  );
}

function RulesetContent({
  rsetId,
  detail,
  editable,
  busy,
  change,
}: {
  rsetId: string;
  detail: RulesetDetail;
  editable: boolean;
  busy: boolean;
  change: RunChange;
}) {
  const { t } = useTranslation();
  const rulesets = useCompObjects("ruleset");
  const groups = useComplianceGroups();
  const usage = useRulesetUsage(rsetId);
  const path = { rset_id: rsetId };

  return (
    <>
      {detail.row.ruleset_type === "contextual" && (
        <FiltersetPart
          rsetId={rsetId}
          detail={detail}
          editable={editable}
          busy={busy}
          change={change}
        />
      )}

      <VariablesPart
        rsetId={rsetId}
        detail={detail}
        editable={editable}
        busy={busy}
        change={change}
      />

      <EditorPart
        title={t("rulesets.detail.rulesets")}
        count={detail.rulesets.length}
        actions={
          editable && (
            <Combobox
              options={(rulesets.data ?? [])
                .filter((r) => r.id !== detail.row.id && !detail.rulesets.includes(r.name))
                .map((r) => ({ value: String(r.id), label: r.name }))}
              value=""
              onChange={(id) => {
                const picked = rulesets.data?.find((r) => String(r.id) === id);
                if (picked === undefined) return;
                void change(t("rulesets.detail.rulesetIncluded", { name: picked.name }), () =>
                  api.POST("/compliance/rulesets/{rset_id}/rulesets/{child_rset_id}", {
                    params: { path: { ...path, child_rset_id: id } },
                  }),
                );
              }}
              label={t("rulesets.detail.includeRuleset")}
              placeholder={t("rulesets.detail.includeRuleset")}
              emptyText={t("compEditor.noMatch")}
              className="w-56"
            />
          )
        }
      >
        <ObjectChips
          kind="ruleset"
          names={detail.rulesets}
          linkId={compLinkOf(rulesets.data)}
          empty={t("rulesets.detail.noRuleset")}
          removeLabel={(n) => t("rulesets.detail.excludeRuleset", { name: n })}
          onRemove={
            editable && !busy
              ? (n) => {
                  void change(t("rulesets.detail.rulesetExcluded", { name: n }), () =>
                    api.DELETE("/compliance/rulesets/{rset_id}/rulesets/{child_rset_id}", {
                      params: { path: { ...path, child_rset_id: compIdOf(rulesets.data, n) } },
                    }),
                  );
                }
              : undefined
          }
        />
      </EditorPart>

      <TeamsPart
        teams={{ responsibles: detail.responsibles, publications: detail.publications }}
        groups={groups.data ?? []}
        editable={editable}
        busy={busy}
        onAdd={(role, group, list) => {
          const groupPath = { path: { ...path, group_id: String(group.id) } };
          void change(t("compEditor.teamAdded", { team: group.role, list }), () =>
            role === "responsibles"
              ? api.POST("/compliance/rulesets/{rset_id}/responsibles/{group_id}", {
                  params: groupPath,
                })
              : api.POST("/compliance/rulesets/{rset_id}/publications/{group_id}", {
                  params: groupPath,
                }),
          );
        }}
        onRemove={(role, team, groupId, list) => {
          const groupPath = { path: { ...path, group_id: groupId } };
          void change(t("compEditor.teamRemoved", { team, list }), () =>
            role === "responsibles"
              ? api.DELETE("/compliance/rulesets/{rset_id}/responsibles/{group_id}", {
                  params: groupPath,
                })
              : api.DELETE("/compliance/rulesets/{rset_id}/publications/{group_id}", {
                  params: groupPath,
                }),
          );
        }}
      />

      <UsedByPart usage={usage.data} errorMessage={usage.isError ? usage.error.message : null} />
    </>
  );
}

/** The filterset of a contextual ruleset: the nodes and services it selects get the ruleset. */
function FiltersetPart({
  rsetId,
  detail,
  editable,
  busy,
  change,
}: {
  rsetId: string;
  detail: RulesetDetail;
  editable: boolean;
  busy: boolean;
  change: RunChange;
}) {
  const { t } = useTranslation();
  const filtersets = useDesignerFiltersets();
  const current = detail.row.fset_name;
  const currentId = filtersets.data?.find((f) => f.name === current)?.id;
  return (
    <EditorPart
      title={t("rulesets.detail.filterset")}
      actions={
        editable && (
          <Combobox
            options={(filtersets.data ?? [])
              .filter((f) => f.name !== current)
              .map((f) => ({ value: String(f.id), label: f.name }))}
            value=""
            onChange={(id) => {
              const picked = filtersets.data?.find((f) => String(f.id) === id);
              if (picked === undefined) return;
              void change(t("rulesets.detail.filtersetSet", { name: picked.name }), () =>
                api.POST("/compliance/rulesets/{rset_id}/filtersets/{fset_id}", {
                  params: { path: { rset_id: rsetId, fset_id: id } },
                }),
              );
            }}
            label={t("rulesets.detail.setFilterset")}
            placeholder={t("rulesets.detail.setFilterset")}
            emptyText={t("compEditor.noMatch")}
            className="w-56"
          />
        )
      }
    >
      <p className="mb-2 text-ink-muted">{t("rulesets.detail.filtersetHint")}</p>
      <ObjectChips
        kind="filterset"
        names={current === "" ? [] : [current]}
        linkId={() => (currentId === undefined ? undefined : String(currentId))}
        empty={t("rulesets.detail.noFilterset")}
        removeLabel={(n) => t("rulesets.detail.removeFilterset", { name: n })}
        onRemove={
          editable && !busy
            ? (n) => {
                void change(t("rulesets.detail.filtersetRemoved", { name: n }), () =>
                  api.DELETE("/compliance/rulesets/{rset_id}/filtersets/{fset_id}", {
                    params: {
                      path: {
                        rset_id: rsetId,
                        fset_id: currentId === undefined ? n : String(currentId),
                      },
                    },
                  }),
                );
              }
            : undefined
        }
      />
    </EditorPart>
  );
}

/** The variables of the ruleset, each renamed, edited through the form of its class, or removed. */
function VariablesPart({
  rsetId,
  detail,
  editable,
  busy,
  change,
}: {
  rsetId: string;
  detail: RulesetDetail;
  editable: boolean;
  busy: boolean;
  change: RunChange;
}) {
  const { t } = useTranslation();
  const classes = useVariableClasses();
  const [varClass, setVarClass] = useState("raw");
  const [editing, setEditing] = useState<number | null>(null);
  const classOptions = [...new Set(["raw", ...(classes.data ?? [])])].map((c) => ({
    value: c,
    label: c,
  }));
  return (
    <EditorPart title={t("rulesets.detail.variables")} count={detail.variables.length}>
      {detail.variables.length === 0 ? (
        <p className="mb-2 text-ink-muted">{t("rulesets.detail.noVariable")}</p>
      ) : (
        <ul className="mb-2 space-y-2">
          {detail.variables.map((variable) => (
            <VariableItem
              key={variable.id}
              rsetId={rsetId}
              variable={variable}
              editable={editable}
              busy={busy}
              editing={editing === variable.id}
              onEdit={(on) => {
                setEditing(on ? variable.id : null);
              }}
              change={change}
            />
          ))}
        </ul>
      )}
      {editable && (
        <AddByName
          label={t("rulesets.detail.addVariable")}
          placeholder={t("rulesets.detail.variableName")}
          disabled={busy}
          onAdd={(name) =>
            change(t("rulesets.detail.variableAdded", { name }), () =>
              api.POST("/compliance/rulesets/{rset_id}/variables", {
                params: { path: { rset_id: rsetId } },
                body: { var_name: name, var_class: varClass, var_value: "" },
              }),
            )
          }
        >
          <Combobox
            options={classOptions}
            value={varClass}
            onChange={(next) => {
              if (next !== "") setVarClass(next);
            }}
            label={t("rulesets.detail.variableClass")}
            placeholder={t("rulesets.detail.variableClass")}
            emptyText={t("compEditor.noMatch")}
            className="w-40"
          />
        </AddByName>
      )}
    </EditorPart>
  );
}

function VariableItem({
  rsetId,
  variable,
  editable,
  busy,
  editing,
  onEdit,
  change,
}: {
  rsetId: string;
  variable: RulesetVariable;
  editable: boolean;
  busy: boolean;
  editing: boolean;
  onEdit: (on: boolean) => void;
  change: RunChange;
}) {
  const { t } = useTranslation();
  const path = { rset_id: rsetId, var_id: String(variable.id) };
  return (
    <li className="rounded-(--radius-control) border border-line p-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">
          <InlineName
            value={variable.name}
            editable={editable}
            label={t("rulesets.detail.renameVariable", { name: variable.name })}
            onCommit={(next) =>
              change(t("rulesets.detail.variableRenamed", { name: next }), () =>
                api.POST("/compliance/rulesets/{rset_id}/variables/{var_id}", {
                  params: { path },
                  body: { var_name: next },
                }),
              )
            }
          />
        </span>
        <span className="rounded-full border border-line px-1.5 text-data text-ink-muted">
          {variable.varClass}
        </span>
        <span className="flex items-center gap-1 text-ink-muted">
          <UserLink name={variable.author} />
          <DateTime value={variable.updated} />
        </span>
        {editable && (
          <span className="ml-auto flex items-center gap-1">
            {!editing && (
              <button
                type="button"
                disabled={busy}
                className={COMP_BUTTON}
                onClick={() => {
                  onEdit(true);
                }}
              >
                <PencilIcon className="h-3.5 w-3.5" />
                {t("rulesets.detail.editValue")}
              </button>
            )}
            <RemoveButton
              label={t("rulesets.detail.removeVariable", { name: variable.name })}
              disabled={busy}
              onClick={() => {
                void change(t("rulesets.detail.variableRemoved", { name: variable.name }), () =>
                  api.DELETE("/compliance/rulesets/{rset_id}/variables/{var_id}", {
                    params: { path },
                  }),
                );
              }}
            />
          </span>
        )}
      </div>
      <div className="mt-1">
        {editing ? (
          <VariableValueEditor
            variable={variable}
            onCancel={() => {
              onEdit(false);
            }}
            onSave={async (value) => {
              const refused = await change(
                t("rulesets.detail.valueSaved", { name: variable.name }),
                () =>
                  api.POST("/compliance/rulesets/{rset_id}/variables/{var_id}", {
                    params: { path },
                    body: { var_value: value },
                  }),
              );
              if (refused === null) onEdit(false);
            }}
          />
        ) : variable.value === "" ? (
          <p className="text-ink-muted">{t("rulesets.detail.emptyValue")}</p>
        ) : variable.varClass === "raw" || variable.varClass === "" ? (
          <pre className="font-mono text-data whitespace-pre-wrap">{variable.value}</pre>
        ) : (
          <FormValue formName={variable.varClass} value={variable.value} digest />
        )}
      </div>
    </li>
  );
}

/**
 * The value of a variable in the form of its class, filled with the stored value,
 * as the historical editor offers it; a plain text field when that form cannot be
 * read, such as the raw class without its form or a form not published to the user.
 */
function VariableValueEditor({
  variable,
  onCancel,
  onSave,
}: {
  variable: RulesetVariable;
  onCancel: () => void;
  onSave: (value: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const form = useFormDefinitionByName(variable.varClass);
  const user = useFormUser();
  const [raw, setRaw] = useState(variable.value);
  if (form.isPending || user.isPending) return <p className="text-ink-muted">…</p>;
  const cancel = (
    <button type="button" className={COMP_BUTTON} onClick={onCancel}>
      {t("rulesets.detail.cancel")}
    </button>
  );
  if (form.data === null || form.data === undefined || user.data === undefined) {
    return (
      <div className="space-y-2 rounded-(--radius-control) border border-accent p-2">
        <label className="block">
          <span className="mb-1 block text-ink-muted">{t("rulesets.detail.rawValue")}</span>
          <textarea
            autoFocus
            value={raw}
            onChange={(event) => {
              setRaw(event.target.value);
            }}
            rows={Math.min(12, Math.max(3, raw.split("\n").length))}
            className="w-full rounded-(--radius-control) border border-line bg-surface p-2 font-mono text-data"
          />
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            className="h-7 rounded-(--radius-control) bg-accent px-3 font-medium text-accent-ink"
            onClick={() => void onSave(raw)}
          >
            {t("rulesets.detail.saveValue")}
          </button>
          {cancel}
        </div>
      </div>
    );
  }
  let initial: unknown;
  try {
    initial = variable.value === "" ? undefined : (JSON.parse(variable.value) as unknown);
  } catch {
    initial = variable.value;
  }
  return (
    <div className="rounded-(--radius-control) border border-accent p-2">
      <FormRender
        def={form.data}
        user={user.data}
        initialData={initial}
        submitLabel={t("rulesets.detail.saveValue")}
        onSubmit={(data) => {
          void onSave(typeof data === "string" ? data : JSON.stringify(data));
        }}
      />
      <div className="mt-2">{cancel}</div>
    </div>
  );
}
