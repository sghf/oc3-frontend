import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ObjectIcon } from "@/components/opensvc/ObjectIcon";
import { Runnable } from "@/features/comp-modules/CompModulePanel";
import { useCompModules } from "@/features/comp-modules/comp-modules-api";
import { useDesigner } from "./designer-context";
import { useDraggable } from "./drag";
import { ObjectLink, ObjectPicker, Section } from "./parts";

/**
 * A compliance module as the designer shows it, read only: what it is and
 * which modulesets of the draft name it, and a picker adding it to another.
 * Its files are edited in the Compliance modules view; here it is dragged onto
 * modulesets, or added from the picker.
 */
export function ModuleView({ name }: { name: string }) {
  const { t } = useTranslation();
  const designer = useDesigner();
  const modules = useCompModules();
  const module = modules.data?.find((m) => m.name === name);
  const drag = useDraggable({ type: "module", name }, name);
  if (modules.isPending) return <p className="text-ink-muted">{t("designer.loading")}</p>;
  if (module === undefined)
    return <p className="text-state-warn">▲ {t("designer.welcome.missing")}</p>;
  const users = Object.values(designer.draft.modulesets)
    .filter((m) => m.modules.some((mod) => mod.name === name))
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="space-y-3">
      <header className="flex flex-wrap items-center gap-2">
        <span
          {...drag}
          title={t("designer.moduleDragHint")}
          className="flex cursor-grab items-center gap-2"
        >
          <ObjectIcon kind="compModule" className="h-5 w-5" />
          <h2 className="text-title font-semibold">{name}</h2>
        </span>
        <span className="text-ink-muted">{t("designer.kind.module")}</span>
        <Link
          to="/compliance/modules"
          search={{ sel: name }}
          className="ml-auto underline decoration-line underline-offset-2"
        >
          {t("designer.editInModules")}
        </Link>
      </header>
      <p className="text-ink-muted">{t("designer.moduleReadOnly")}</p>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
        <dt className="text-ink-muted">{t("compModules.fields.path")}</dt>
        <dd className="font-mono">{module.path}</dd>
        <dt className="text-ink-muted">{t("compModules.fields.kind")}</dt>
        <dd>{t(`compModules.kind.${module.kind}`)}</dd>
        <dt className="text-ink-muted">{t("compModules.fields.runnable")}</dt>
        <dd>
          <Runnable runnable={module.runnable} issue={module.issue} />
        </dd>
      </dl>
      <Section
        title={t("designer.moduleUsedBy")}
        count={users.length}
        actions={
          <ObjectPicker
            kind="moduleset"
            label={t("designer.addToModuleset")}
            exclude={users.map((m) => m.id)}
            onPick={(id) => {
              designer.runAndTell({ op: "addModule", modulesetId: id, name });
            }}
          />
        }
      >
        {users.length === 0 ? (
          <p className="text-ink-muted">{t("designer.none")}</p>
        ) : (
          <ul className="flex flex-wrap gap-1">
            {users.map((m) => (
              <li key={m.id}>
                <ObjectLink refTo={{ kind: "moduleset", id: m.id }} />
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
