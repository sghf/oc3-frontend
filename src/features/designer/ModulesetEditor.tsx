import { useTranslation } from "react-i18next";
import { ObjectIcon } from "@/components/opensvc/ObjectIcon";
import { Combobox } from "@/components/ui/Combobox";
import { Switch } from "@/components/ui/Switch";
import { useCompModules } from "@/features/comp-modules/comp-modules-api";
import { CloseIcon } from "@/components/ui/icons";
import { useDesigner } from "./designer-context";
import { useDropTarget, type DragItem } from "./drag";
import { EditorHeader, UsedBy } from "./editor-common";
import type { Moduleset, ObjectRef, Operation } from "./model";
import { InlineName, ObjectPicker, Section, TeamsEditor } from "./parts";
import { ChildList } from "./RulesetEditor";

/** The editor of a moduleset of the draft, one section per aspect of it. */
export function ModulesetEditor({
  moduleset,
  onSelect,
  onDeleted,
}: {
  moduleset: Moduleset;
  onSelect: (ref: ObjectRef) => void;
  onDeleted: () => void;
}) {
  const { t } = useTranslation();
  const designer = useDesigner();
  const ref: ObjectRef = { kind: "moduleset", id: moduleset.id };
  const rulesetTarget = useDropTarget((item: DragItem): Operation | null =>
    item.type === "ruleset"
      ? { op: "include", parent: ref, child: { kind: "ruleset", id: item.id } }
      : null,
  );
  const moduleTarget = useDropTarget((item: DragItem): Operation | null =>
    item.type === "module" ? { op: "addModule", modulesetId: moduleset.id, name: item.name } : null,
  );
  const repository = useCompModules();
  // The modules of the repository by name, once read: a name of the moduleset
  // missing from it is told so.
  const known =
    repository.data === undefined ? undefined : new Set(repository.data.map((m) => m.name));
  const modulesetTarget = useDropTarget((item: DragItem): Operation | null =>
    item.type === "moduleset"
      ? { op: "include", parent: ref, child: { kind: "moduleset", id: item.id } }
      : null,
  );
  return (
    <div className="space-y-3">
      <EditorHeader refTo={ref} onSelect={onSelect} onDeleted={onDeleted} />
      <Section
        title={t("designer.modules")}
        count={moduleset.modules.length}
        target={moduleTarget}
        hint={t("designer.modulesHint")}
        actions={
          <Combobox
            options={(repository.data ?? [])
              .filter((m) => !moduleset.modules.some((mod) => mod.name === m.name))
              .map((m) => ({ value: m.name, label: m.name }))}
            value=""
            onChange={(name) => {
              if (name !== "")
                designer.runAndTell({ op: "addModule", modulesetId: moduleset.id, name });
            }}
            label={t("designer.pickModule")}
            placeholder={t("designer.pickModule")}
            emptyText={t("designer.noMatch")}
            className="w-64"
          />
        }
      >
        {moduleset.modules.length === 0 ? (
          <p className="mb-2 text-ink-muted">{t("designer.noModule")}</p>
        ) : (
          <table className="mb-2 w-full">
            <thead>
              <tr className="text-left text-ink-muted">
                <th className="py-1 pr-3 font-normal">{t("designer.module")}</th>
                <th className="py-1 pr-3 font-normal">{t("designer.autofix")}</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {moduleset.modules.map((mod) => (
                <tr key={mod.id} className="border-t border-line">
                  <td className="py-1 pr-3">
                    <ObjectIcon
                      kind="compModule"
                      className="mr-1.5 inline h-3.5 w-3.5 align-[-0.125em]"
                    />
                    {known !== undefined && !known.has(mod.name) && (
                      <span
                        className="mr-1 text-state-warn"
                        title={t("designer.moduleNotInRepo", { name: mod.name })}
                      >
                        <span aria-hidden="true">▲</span>
                        <span className="sr-only">
                          {t("designer.moduleNotInRepo", { name: mod.name })}
                        </span>
                      </span>
                    )}
                    <InlineName
                      value={mod.name}
                      label={mod.name}
                      onCommit={(name) =>
                        designer.run({
                          op: "renameModule",
                          modulesetId: moduleset.id,
                          moduleId: mod.id,
                          name,
                        }).refused
                      }
                    />
                  </td>
                  <td className="py-1 pr-3">
                    <Switch
                      checked={mod.autofix}
                      size="sm"
                      label={t("designer.autofixOf", { name: mod.name })}
                      stateLabel={t(mod.autofix ? "detail.yes" : "detail.no")}
                      onChange={(autofix) => {
                        designer.runAndTell({
                          op: "setAutofix",
                          modulesetId: moduleset.id,
                          moduleId: mod.id,
                          autofix,
                        });
                      }}
                    />
                  </td>
                  <td className="py-1 text-right">
                    <button
                      type="button"
                      aria-label={t("designer.removeModule", { name: mod.name })}
                      title={t("designer.removeModule", { name: mod.name })}
                      onClick={() => {
                        designer.runAndTell({
                          op: "deleteModule",
                          modulesetId: moduleset.id,
                          moduleId: mod.id,
                        });
                      }}
                      className="rounded-(--radius-control) p-1 text-ink-muted hover:bg-surface-sunken hover:text-state-down"
                    >
                      <CloseIcon className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
      <Section
        title={t("designer.attachedRulesets")}
        count={moduleset.rulesets.length}
        target={rulesetTarget}
        hint={t("designer.attachedRulesetsHint")}
        actions={
          <ObjectPicker
            kind="ruleset"
            label={t("designer.attachRuleset")}
            exclude={moduleset.rulesets}
            onPick={(id) => {
              designer.runAndTell({ op: "include", parent: ref, child: { kind: "ruleset", id } });
            }}
          />
        }
      >
        <ChildList parent={ref} kind="ruleset" ids={moduleset.rulesets} />
      </Section>
      <Section
        title={t("designer.includedModulesets")}
        count={moduleset.modulesets.length}
        target={modulesetTarget}
        hint={t("designer.includedModulesetsHint")}
        actions={
          <ObjectPicker
            kind="moduleset"
            label={t("designer.includeModuleset")}
            exclude={[moduleset.id, ...moduleset.modulesets]}
            onPick={(id) => {
              designer.runAndTell({ op: "include", parent: ref, child: { kind: "moduleset", id } });
            }}
          />
        }
      >
        <ChildList parent={ref} kind="moduleset" ids={moduleset.modulesets} />
      </Section>
      <Section title={t("designer.teams.title")}>
        <TeamsEditor refTo={ref} />
      </Section>
      <UsedBy refTo={ref} />
    </div>
  );
}
