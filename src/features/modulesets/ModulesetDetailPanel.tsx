import { useTranslation } from "react-i18next";
import type { components } from "@/lib/api/schema";
import { api } from "@/lib/api/client";
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
import { useChanges, type RunChange } from "@/components/opensvc/comp-changes";
import { Combobox } from "@/components/ui/Combobox";
import { Switch } from "@/components/ui/Switch";
import { DateTime } from "@/components/ui/DateTime";
import { useComplianceGroups } from "@/features/designer/use-designer-data";
import { UserLink } from "@/features/users/UserLink";
import { compIdOf, compLinkOf, useCompObjects } from "@/lib/api/compliance";
import {
  useModuleset,
  useModulesetChanged,
  useModulesetResponsible,
  useModulesetUsage,
  type ModulesetDetail,
} from "./use-moduleset";

type ModulesetRow = components["schemas"]["ModulesetRow"];

const text = (prop: keyof ModulesetRow) => (row: ModulesetRow) => {
  const value = row[prop];
  return value === undefined || value === "" ? undefined : String(value);
};

const GROUPS: DetailGroup<ModulesetRow>[] = [
  {
    key: "identity",
    family: "moduleset",
    fields: [{ prop: "modset_name", format: text("modset_name"), editable: true }],
  },
  {
    key: "record",
    family: "time",
    fields: [
      {
        prop: "modset_author",
        format: text("modset_author"),
        render: (row) => <UserLink name={row.modset_author} />,
      },
      {
        prop: "modset_updated",
        format: text("modset_updated"),
        render: (row, locale) => <DateTime value={row.modset_updated} locale={locale} />,
      },
      { prop: "id", format: text("id") },
    ],
  },
];

/**
 * A moduleset: its name and record, its modules with their autofix flag, the
 * rulesets attached to it, the modulesets it includes, its teams and the nodes
 * and services using it. A responsible with the CompManager privilege edits all
 * of it in place, each change written to the collector at once, as the
 * historical moduleset editor does; the others read it, and the server refuses a
 * responsible without the privilege with its message.
 */
export function ModulesetDetailPanel({
  modsetId,
  label,
  onClose,
}: {
  modsetId: string | undefined;
  label: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const detail = useModuleset(modsetId);
  const responsible = useModulesetResponsible(modsetId);
  const editable = responsible.data === true;
  const changed = useModulesetChanged();
  const { outcome, busy, change, dismiss } = useChanges(async () => {
    if (modsetId !== undefined) await changed(modsetId);
  });

  const name = detail.data?.name ?? "";
  return (
    <DetailPanel
      kind="moduleset"
      open={modsetId !== undefined}
      recordId={modsetId}
      title={name !== "" ? name : label === "" ? t("modulesets.detail.title") : label}
      onClose={() => {
        dismiss();
        onClose();
      }}
      groups={GROUPS}
      row={detail.data?.row ?? (detail.data === null ? null : undefined)}
      labelPrefix="modulesets.detail.fields"
      groupPrefix="modulesets.detail.groups"
      isPending={detail.isPending}
      errorMessage={
        detail.isError
          ? detail.error.message
          : detail.data === null
            ? t("modulesets.detail.notFound")
            : null
      }
      editHint={t("modulesets.detail.editHint")}
      onSave={
        editable
          ? async (changes) => {
              const next = changes.modset_name;
              if (typeof next !== "string" || modsetId === undefined) return;
              const refused = await change(t("modulesets.detail.renamed", { name: next }), () =>
                api.POST("/compliance/modulesets/{modset_id}", {
                  params: { path: { modset_id: modsetId } },
                  body: { modset_name: next.trim() },
                }),
              );
              if (refused !== null) throw new Error(refused);
            }
          : undefined
      }
      actions={
        detail.data !== undefined && detail.data !== null && modsetId !== undefined ? (
          <div className="space-y-3">
            {!editable && <p className="text-ink-muted">{t("modulesets.detail.readOnly")}</p>}
            <ChangeOutcomeLine outcome={outcome} onDismiss={dismiss} />
            <ModulesetContent
              modsetId={modsetId}
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

function ModulesetContent({
  modsetId,
  detail,
  editable,
  busy,
  change,
}: {
  modsetId: string;
  detail: ModulesetDetail;
  editable: boolean;
  busy: boolean;
  change: RunChange;
}) {
  const { t, i18n } = useTranslation();
  const rulesets = useCompObjects("ruleset");
  const modulesets = useCompObjects("moduleset");
  const groups = useComplianceGroups();
  const usage = useModulesetUsage(modsetId);
  const path = { modset_id: modsetId };

  return (
    <>
      <EditorPart title={t("modulesets.detail.modules")} count={detail.modules.length}>
        <p className="mb-2 text-ink-muted">{t("modulesets.detail.modulesHint")}</p>
        {detail.modules.length === 0 ? (
          <p className="mb-2 text-ink-muted">{t("modulesets.detail.noModule")}</p>
        ) : (
          <table className="mb-2 w-full">
            <thead>
              <tr className="text-left text-ink-muted">
                <th className="py-1 pr-3 font-normal">{t("modulesets.fields.modset_mod_name")}</th>
                <th className="py-1 pr-3 font-normal">{t("modulesets.fields.autofix")}</th>
                <th className="py-1 pr-3 font-normal">
                  {t("modulesets.fields.modset_mod_updated")}
                </th>
                {editable && <th className="w-8" />}
              </tr>
            </thead>
            <tbody>
              {detail.modules.map((mod) => (
                <tr key={mod.id} className="border-t border-line">
                  <td className="py-1 pr-3">
                    <InlineName
                      value={mod.name}
                      editable={editable}
                      label={t("modulesets.detail.renameModule", { name: mod.name })}
                      onCommit={(next) =>
                        change(t("modulesets.detail.moduleRenamed", { name: next }), () =>
                          api.POST("/compliance/modulesets/{modset_id}/modules/{mod_id}", {
                            params: { path: { ...path, mod_id: String(mod.id) } },
                            body: { modset_mod_name: next },
                          }),
                        )
                      }
                    />
                  </td>
                  <td className="py-1 pr-3">
                    <Switch
                      checked={mod.autofix}
                      size="sm"
                      disabled={!editable || busy}
                      label={t("modulesets.detail.autofixOf", { name: mod.name })}
                      stateLabel={t(mod.autofix ? "detail.yes" : "detail.no")}
                      onChange={(autofix) => {
                        void change(
                          t(
                            autofix
                              ? "modulesets.detail.autofixOn"
                              : "modulesets.detail.autofixOff",
                            {
                              name: mod.name,
                            },
                          ),
                          () =>
                            api.POST("/compliance/modulesets/{modset_id}/modules/{mod_id}", {
                              params: { path: { ...path, mod_id: String(mod.id) } },
                              body: { autofix },
                            }),
                        );
                      }}
                    />
                  </td>
                  <td className="py-1 pr-3 whitespace-nowrap text-ink-muted">
                    <DateTime value={mod.updated} locale={i18n.language} />
                  </td>
                  {editable && (
                    <td className="py-1 text-right">
                      <RemoveButton
                        label={t("modulesets.detail.removeModule", { name: mod.name })}
                        disabled={busy}
                        onClick={() => {
                          void change(
                            t("modulesets.detail.moduleRemoved", { name: mod.name }),
                            () =>
                              api.DELETE("/compliance/modulesets/{modset_id}/modules/{mod_id}", {
                                params: { path: { ...path, mod_id: String(mod.id) } },
                              }),
                          );
                        }}
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {editable && (
          <AddByName
            label={t("modulesets.detail.addModule")}
            placeholder={t("modulesets.detail.moduleName")}
            disabled={busy}
            onAdd={(next) =>
              change(t("modulesets.detail.moduleAdded", { name: next }), () =>
                api.POST("/compliance/modulesets/{modset_id}/modules", {
                  params: { path },
                  body: { modset_mod_name: next, autofix: false },
                }),
              )
            }
          />
        )}
      </EditorPart>

      <EditorPart
        title={t("modulesets.detail.rulesets")}
        count={detail.rulesets.length}
        actions={
          editable && (
            <Combobox
              options={(rulesets.data ?? [])
                .filter((r) => !detail.rulesets.includes(r.name))
                .map((r) => ({ value: String(r.id), label: r.name }))}
              value=""
              onChange={(id) => {
                const picked = rulesets.data?.find((r) => String(r.id) === id);
                if (picked === undefined) return;
                void change(t("modulesets.detail.rulesetAttached", { name: picked.name }), () =>
                  api.POST("/compliance/modulesets/{modset_id}/rulesets/{rset_id}", {
                    params: { path: { ...path, rset_id: id } },
                  }),
                );
              }}
              label={t("modulesets.detail.attachRuleset")}
              placeholder={t("modulesets.detail.attachRuleset")}
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
          empty={t("modulesets.detail.noRuleset")}
          removeLabel={(n) => t("modulesets.detail.detachRuleset", { name: n })}
          onRemove={
            editable && !busy
              ? (n) => {
                  void change(t("modulesets.detail.rulesetDetached", { name: n }), () =>
                    api.DELETE("/compliance/modulesets/{modset_id}/rulesets/{rset_id}", {
                      params: { path: { ...path, rset_id: compIdOf(rulesets.data, n) } },
                    }),
                  );
                }
              : undefined
          }
        />
      </EditorPart>

      <EditorPart
        title={t("modulesets.detail.modulesets")}
        count={detail.modulesets.length}
        actions={
          editable && (
            <Combobox
              options={(modulesets.data ?? [])
                .filter((m) => m.name !== detail.name && !detail.modulesets.includes(m.name))
                .map((m) => ({ value: String(m.id), label: m.name }))}
              value=""
              onChange={(id) => {
                const picked = modulesets.data?.find((m) => String(m.id) === id);
                if (picked === undefined) return;
                void change(t("modulesets.detail.modulesetIncluded", { name: picked.name }), () =>
                  api.POST("/compliance/modulesets/{modset_id}/modulesets/{child_modset_id}", {
                    params: { path: { ...path, child_modset_id: id } },
                  }),
                );
              }}
              label={t("modulesets.detail.includeModuleset")}
              placeholder={t("modulesets.detail.includeModuleset")}
              emptyText={t("compEditor.noMatch")}
              className="w-56"
            />
          )
        }
      >
        <ObjectChips
          kind="moduleset"
          names={detail.modulesets}
          linkId={compLinkOf(modulesets.data)}
          empty={t("modulesets.detail.noModuleset")}
          removeLabel={(n) => t("modulesets.detail.excludeModuleset", { name: n })}
          onRemove={
            editable && !busy
              ? (n) => {
                  void change(t("modulesets.detail.modulesetExcluded", { name: n }), () =>
                    api.DELETE("/compliance/modulesets/{modset_id}/modulesets/{child_modset_id}", {
                      params: { path: { ...path, child_modset_id: compIdOf(modulesets.data, n) } },
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
              ? api.POST("/compliance/modulesets/{modset_id}/responsibles/{group_id}", {
                  params: groupPath,
                })
              : api.POST("/compliance/modulesets/{modset_id}/publications/{group_id}", {
                  params: groupPath,
                }),
          );
        }}
        onRemove={(role, team, groupId, list) => {
          const groupPath = { path: { ...path, group_id: groupId } };
          void change(t("compEditor.teamRemoved", { team, list }), () =>
            role === "responsibles"
              ? api.DELETE("/compliance/modulesets/{modset_id}/responsibles/{group_id}", {
                  params: groupPath,
                })
              : api.DELETE("/compliance/modulesets/{modset_id}/publications/{group_id}", {
                  params: groupPath,
                }),
          );
        }}
      />

      <UsedByPart usage={usage.data} errorMessage={usage.isError ? usage.error.message : null} />
    </>
  );
}
