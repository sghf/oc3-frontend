import { useId, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { MAX_ORDER, MODULE_NAME, createCompModule, importCompModule } from "./comp-modules-api";
import {
  TEMPLATE_LANGUAGES,
  directoryTemplate,
  scriptTemplate,
  type TemplateLanguage,
} from "./comp-module-templates";

const INPUT = "h-8 w-full rounded-(--radius-control) border border-line bg-surface px-2";

type Kind = "script" | "directory";
type Source = "skeleton" | "archive";

/**
 * Creates a compliance module: a script, written from a template; or a
 * directory, from a skeleton in a language or from an archive of its files.
 */
export function CreateForm({ onCreated }: { onCreated: (name: string) => void }) {
  const { t } = useTranslation();
  const id = useId();
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<Kind>("script");
  const [source, setSource] = useState<Source>("skeleton");
  const [archive, setArchive] = useState<File | undefined>();
  const [name, setName] = useState("");
  const [order, setOrder] = useState("10");
  const [message, setMessage] = useState("");
  const [language, setLanguage] = useState<TemplateLanguage>("sh");
  const [content, setContent] = useState(() => scriptTemplate("sh", ""));
  // The script is the template of the moment, not edited: the name and the
  // language may change it.
  const untouched = content === scriptTemplate(language, name);

  const orderValue = Number(order);
  const problems = [
    name !== "" && !MODULE_NAME.test(name) ? t("compModules.form.badName") : undefined,
    !/^[0-9]+$/.test(order) || orderValue > MAX_ORDER
      ? t("compModules.form.badOrder", { max: MAX_ORDER })
      : undefined,
    kind === "script" && !content.startsWith("#!") ? t("compModules.form.noShebang") : undefined,
    kind === "directory" && source === "archive" && archive === undefined
      ? t("compModules.form.noArchive")
      : undefined,
  ].filter((p): p is string => p !== undefined);
  const ready = name !== "" && problems.length === 0;

  const create = useMutation({
    mutationFn: () => {
      const msg = message.trim() === "" ? undefined : message.trim();
      if (kind === "script") {
        return createCompModule({ name, order: orderValue, kind: "script", content, message: msg });
      }
      if (source === "archive" && archive !== undefined) {
        return importCompModule(name, orderValue, archive, message);
      }
      return createCompModule({
        name,
        order: orderValue,
        kind: "directory",
        files: directoryTemplate(language, name),
        message: msg,
      });
    },
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ["compliance-modules"] });
      onCreated(created.name);
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (ready && !create.isPending) create.mutate();
  }

  const languageSelect = (
    <div>
      <label className="mb-1 block font-medium" htmlFor={`${id}-language`}>
        {t("compModules.form.language")}
      </label>
      <select
        id={`${id}-language`}
        value={language}
        onChange={(event) => {
          const next = event.target.value as TemplateLanguage;
          if (untouched) setContent(scriptTemplate(next, name));
          setLanguage(next);
        }}
        className={INPUT}
      >
        {TEMPLATE_LANGUAGES.map((l) => (
          <option key={l} value={l}>
            {t(`compModules.languages.${l}`)}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 font-medium">{t("compModules.fields.kind")}</legend>
        {(["script", "directory"] as const).map((k) => (
          <label key={k} className="flex items-start gap-2">
            <input
              type="radio"
              name={`${id}-kind`}
              checked={kind === k}
              onChange={() => {
                setKind(k);
              }}
              className="mt-1"
            />
            <span>
              {t(`compModules.kind.${k}`)}
              <span className="block text-ink-muted">{t(`compModules.form.kindHint.${k}`)}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="grid grid-cols-[1fr_8rem] gap-3">
        <div>
          <label className="mb-1 block font-medium" htmlFor={`${id}-name`}>
            {t("compModules.fields.name")}
          </label>
          <input
            id={`${id}-name`}
            value={name}
            onChange={(event) => {
              const next = event.target.value.trim();
              // The template, not edited yet, follows the name.
              if (untouched) setContent(scriptTemplate(language, next));
              setName(next);
            }}
            placeholder="linux.sshd"
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
      <p className="-mt-2 text-ink-muted">
        {t("compModules.form.pathHint", {
          path: `S${order.padStart(2, "0")}-${name === "" ? "<name>" : name}`,
        })}
      </p>

      {kind === "script" ? (
        <>
          <div>
            {languageSelect}
            <p className="mt-1 text-ink-muted">{t("compModules.form.templateHint")}</p>
            {!untouched && (
              <button
                type="button"
                onClick={() => {
                  setContent(scriptTemplate(language, name));
                }}
                className="mt-1 text-accent hover:underline"
              >
                {t("compModules.form.replaceTemplate", {
                  language: t(`compModules.languages.${language}`),
                })}
              </button>
            )}
          </div>
          <div>
            <label className="mb-1 block font-medium" htmlFor={`${id}-script`}>
              {t("compModules.script")}
            </label>
            <textarea
              id={`${id}-script`}
              value={content}
              onChange={(event) => {
                setContent(event.target.value);
              }}
              rows={22}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              wrap="off"
              className="w-full rounded-(--radius-control) border border-line bg-surface px-2 py-1 font-mono text-data whitespace-pre"
            />
            <p className="mt-1 text-ink-muted">{t("compModules.form.scriptHint")}</p>
          </div>
        </>
      ) : (
        <>
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 font-medium">{t("compModules.form.source")}</legend>
            {(["skeleton", "archive"] as const).map((s) => (
              <label key={s} className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`${id}-source`}
                  checked={source === s}
                  onChange={() => {
                    setSource(s);
                  }}
                />
                {t(`compModules.form.sources.${s}`)}
              </label>
            ))}
          </fieldset>
          {source === "skeleton" ? (
            <div className="flex flex-col gap-2">
              {languageSelect}
              <p className="text-ink-muted">{t("compModules.form.skeletonHint")}</p>
              <ul className="font-mono">
                {directoryTemplate(language, name).map((f) => (
                  <li key={f.path}>
                    {f.path}
                    {f.executable && (
                      <span className="ml-2 font-sans text-ink-muted">
                        {t("compModules.executable")}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div>
              <label className="mb-1 block font-medium" htmlFor={`${id}-archive`}>
                {t("compModules.form.archive")}
              </label>
              <input
                id={`${id}-archive`}
                type="file"
                accept=".tar.gz,.tgz,.zip,application/gzip,application/zip"
                onChange={(event) => {
                  setArchive(event.target.files?.[0]);
                }}
              />
              <p className="mt-1 text-ink-muted">{t("compModules.form.archiveHint")}</p>
            </div>
          )}
        </>
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
          placeholder={t("compModules.form.messagePlaceholder", {
            name: name === "" ? "<name>" : name,
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
      {create.isError && (
        <p role="alert" className="text-state-down">
          ■ {create.error.message}
        </p>
      )}
      <div>
        <button
          type="submit"
          disabled={!ready || create.isPending}
          className="h-8 rounded-(--radius-control) bg-accent px-3 font-medium text-accent-ink disabled:opacity-60"
        >
          {create.isPending ? t("compModules.form.creating") : t("compModules.form.create")}
        </button>
      </div>
    </form>
  );
}
