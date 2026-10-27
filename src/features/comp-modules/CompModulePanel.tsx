import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { CrossLink } from "@/components/opensvc/CrossLink";
import { ObjectIcon } from "@/components/opensvc/ObjectIcon";
import { DateTime } from "@/components/ui/DateTime";
import { SlideOver } from "@/components/ui/SlideOver";
import { PencilIcon } from "@/components/ui/icons";
import { CreateForm } from "./CompModuleCreateForm";
import { ModuleFiles, WriteError } from "./CompModuleFiles";
import { ModuleHistory } from "./CompModuleHistory";
import { useModuleWrite } from "./use-module-write";
import {
  MAX_ORDER,
  MODULE_NAME,
  renameCompModule,
  useCompModule,
  type CompModuleDetail,
  type CompModuleIssue,
} from "./comp-modules-api";

const INPUT = "h-8 w-full rounded-(--radius-control) border border-line bg-surface px-2";

const SECTION = "flex flex-col gap-2";

/**
 * A compliance module, read and changed, or a new one written: the panel of
 * the modules page. Reading shows what the agents get, the files and their
 * content, the modulesets naming the module and the commits that changed it.
 * A CompManager edits its files, or creates a module.
 */
export function CompModulePanel({
  name,
  creating,
  canEdit,
  onClose,
  onCreated,
  onRenamed,
}: {
  /** The module to read; ignored while creating. */
  name: string | undefined;
  creating: boolean;
  /** The user may change the modules: a CompManager. */
  canEdit: boolean;
  onClose: () => void;
  onCreated: (name: string) => void;
  /** The module got another name: the page selects it under it. */
  onRenamed: (name: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <SlideOver
      // A click beside it closes it, the forms included: a field being typed in
      // keeps it open (SlideOver).
      open={creating || name !== undefined}
      title={creating ? t("compModules.form.title") : (name ?? "")}
      onClose={onClose}
      closeLabel={t("detail.close")}
      resizeLabel={t("detail.resize")}
      leading={<ObjectIcon kind="compModule" />}
      size="wide"
    >
      {creating ? (
        <CreateForm onCreated={onCreated} />
      ) : name !== undefined ? (
        <ModuleView key={name} name={name} canEdit={canEdit} onRenamed={onRenamed} />
      ) : null}
    </SlideOver>
  );
}

function ModuleView({
  name,
  canEdit,
  onRenamed,
}: {
  name: string;
  canEdit: boolean;
  onRenamed: (name: string) => void;
}) {
  const { t } = useTranslation();
  const module = useCompModule(name);
  if (module.isPending) return <p className="text-ink-muted">{t("list.loading")}</p>;
  if (module.isError) {
    return (
      <p role="alert" className="text-state-down">
        ■ {module.error.message}
      </p>
    );
  }
  return <ModuleDetail module={module.data} canEdit={canEdit} onRenamed={onRenamed} />;
}

function ModuleDetail({
  module,
  canEdit,
  onRenamed,
}: {
  module: CompModuleDetail;
  canEdit: boolean;
  onRenamed: (name: string) => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  return (
    <div className="flex flex-col gap-5">
      {editing ? (
        <PropertiesForm
          module={module}
          onCancel={() => {
            setEditing(false);
          }}
          onSaved={(next) => {
            setEditing(false);
            if (next.name !== module.name) onRenamed(next.name);
          }}
        />
      ) : (
        canEdit && (
          <div>
            <button
              type="button"
              onClick={() => {
                setEditing(true);
              }}
              className="flex h-7 items-center gap-1.5 rounded-(--radius-control) border border-line px-2 text-ink-muted hover:text-ink"
            >
              <PencilIcon />
              {t("compModules.props.edit")}
            </button>
          </div>
        )
      )}
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5">
        <dt className="text-ink-muted">{t("compModules.fields.path")}</dt>
        <dd className="font-mono">{module.path}</dd>
        <dt className="text-ink-muted">{t("compModules.fields.order")}</dt>
        <dd>{module.order}</dd>
        <dt className="text-ink-muted">{t("compModules.fields.kind")}</dt>
        <dd>
          {t(`compModules.kind.${module.kind}`)}
          {module.kind === "directory" && module.entry !== "" && (
            <span className="text-ink-muted">
              {" "}
              · {t("compModules.runs", { entry: module.entry })}
            </span>
          )}
        </dd>
        <dt className="text-ink-muted">{t("compModules.fields.runnable")}</dt>
        <dd>
          <Runnable runnable={module.runnable} issue={module.issue} />
        </dd>
        {module.changed !== undefined && (
          <>
            <dt className="text-ink-muted">{t("compModules.fields.changed")}</dt>
            <dd>
              <DateTime value={module.changed.date} />
              <span className="block text-ink-muted">{module.changed.author}</span>
            </dd>
          </>
        )}
      </dl>

      <section className={SECTION}>
        <h3 className="font-medium">{t("compModules.modulesets")}</h3>
        {module.modulesets.length === 0 ? (
          <p className="text-ink-muted">{t("compModules.noModuleset")}</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {module.modulesets.map((m) => (
              <li key={m.id}>
                <CrossLink kind="moduleset" id={String(m.id)}>
                  {m.name}
                </CrossLink>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ModuleFiles module={module} canEdit={canEdit} />

      <ModuleHistory module={module} canEdit={canEdit} />
    </div>
  );
}

/** Whether an agent can run the module, told by a word and a mark, not by color alone. */
export function Runnable({ runnable, issue }: { runnable: boolean; issue: CompModuleIssue }) {
  const { t } = useTranslation();
  if (runnable) {
    return (
      <span>
        <span aria-hidden="true">✓</span> {t("compModules.runnableYes")}
      </span>
    );
  }
  return (
    <span className="text-state-warn">
      <span aria-hidden="true">▲</span>{" "}
      {issue === "two_entries"
        ? t("compModules.twoEntries")
        : issue === "no_entry"
          ? t("compModules.noEntry")
          : t("compModules.notExecutable")}
    </span>
  );
}

/**
 * The name and the order of a module, changed: its entry, S<order>-<name>,
 * moves with its files and history, and the modulesets naming it follow the
 * new name.
 */
function PropertiesForm({
  module,
  onCancel,
  onSaved,
}: {
  module: CompModuleDetail;
  onCancel: () => void;
  onSaved: (next: CompModuleDetail) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const write = useModuleWrite(module);
  const [name, setName] = useState(module.name);
  const [order, setOrder] = useState(String(module.order));
  const [message, setMessage] = useState("");
  const orderValue = Number(order);
  const problems = [
    !MODULE_NAME.test(name) ? t("compModules.form.badName") : undefined,
    !/^[0-9]+$/.test(order) || orderValue > MAX_ORDER
      ? t("compModules.form.badOrder", { max: MAX_ORDER })
      : undefined,
  ].filter((p): p is string => p !== undefined);
  const renamed = name !== module.name;
  const changed = renamed || orderValue !== module.order;

  return (
    <form
      className="flex flex-col gap-3 rounded-(--radius-panel) border border-line p-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!changed || problems.length > 0 || write.pending) return;
        void write
          .run((base) => renameCompModule(module.name, base, { name, order: orderValue }, message))
          .then((next) => {
            if (next !== undefined) onSaved(next);
          });
      }}
    >
      <div className="grid grid-cols-[1fr_8rem] gap-3">
        <div>
          <label className="mb-1 block font-medium" htmlFor={`${id}-name`}>
            {t("compModules.fields.name")}
          </label>
          <input
            id={`${id}-name`}
            value={name}
            onChange={(event) => {
              setName(event.target.value.trim());
            }}
            autoComplete="off"
            spellCheck={false}
            className={`${INPUT} font-mono`}
          />
        </div>
        <div>
          <label className="mb-1 block font-medium" htmlFor={`${id}-order`}>
            {t("compModules.fields.order")}
          </label>
          <input
            id={`${id}-order`}
            value={order}
            inputMode="numeric"
            onChange={(event) => {
              setOrder(event.target.value.trim());
            }}
            className={INPUT}
          />
        </div>
      </div>
      <p className="text-ink-muted">
        {t("compModules.props.entry", {
          from: module.path,
          to: `S${order.padStart(2, "0")}-${name}`,
        })}
      </p>
      {renamed && module.modulesets.length > 0 && (
        <p>
          <span aria-hidden="true">▲</span>{" "}
          {t("compModules.props.modulesetsFollow", {
            count: module.modulesets.length,
            name,
            modulesets: module.modulesets.map((m) => m.name).join(", "),
          })}
        </p>
      )}
      <div>
        <label className="mb-1 block font-medium" htmlFor={`${id}-message`}>
          {t("compModules.fields.message")}
        </label>
        <input
          id={`${id}-message`}
          value={message}
          onChange={(event) => {
            setMessage(event.target.value);
          }}
          placeholder={t("compModules.props.messagePlaceholder", {
            from: module.path,
            to: `S${order.padStart(2, "0")}-${name}`,
          })}
          className={INPUT}
        />
      </div>
      {problems.length > 0 && (
        <ul className="text-state-warn">
          {problems.map((p) => (
            <li key={p}>
              <span aria-hidden="true">▲</span> {p}
            </li>
          ))}
        </ul>
      )}
      <WriteError error={write.error} onReload={write.reload} />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={!changed || problems.length > 0 || write.pending}
          className="h-8 rounded-(--radius-control) bg-accent px-3 font-medium text-accent-ink disabled:opacity-60"
        >
          {write.pending ? t("compModules.edit.saving") : t("compModules.edit.save")}
        </button>
        <button type="button" onClick={onCancel} className="text-accent hover:underline">
          {t("detail.cancel")}
        </button>
      </div>
    </form>
  );
}
