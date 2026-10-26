import { useEffect, useId, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ObjectIcon } from "@/components/opensvc/ObjectIcon";
import { Combobox } from "@/components/ui/Combobox";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { SlideOver } from "@/components/ui/SlideOver";
import { CloseIcon, TrashIcon } from "@/components/ui/icons";
import { EMPTY_DRAFT, draftOf, inputOf, type ConnectorDraft } from "./connector-draft";
import {
  AUTH_TYPES,
  METHODS,
  deleteFormConnector,
  saveFormConnector,
  secretsOf,
  testFormConnector,
  useConnectorGroups,
  type ConnectorMethod,
  type FormConnector,
  type FormConnectorTestResult,
  type SecretKey,
} from "./form-connectors-api";

const INPUT = "h-8 w-full rounded-(--radius-control) border border-line bg-surface px-2";
const AREA = "w-full rounded-(--radius-control) border border-line bg-surface px-2 py-1 font-mono";
const FIELDSET = "flex flex-col gap-3 rounded-(--radius-panel) border border-line p-3";

/** A labelled field of the form, its hint under it. */
function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block font-medium" htmlFor={id}>
        {label}
      </label>
      {children}
      {hint !== undefined && <p className="mt-1 text-ink-muted">{hint}</p>}
    </div>
  );
}

/**
 * Creating or editing a connector: an external API the forms call through oc3.
 * The secrets are write-only: the form tells whether each one is set, a value
 * typed replaces it, "remove" drops it, an empty field keeps it. A saved
 * connector can be called once from here, to check its settings.
 */
export function FormConnectorPanel({
  open,
  connector,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** The connector to edit; absent, the form creates one. */
  connector?: FormConnector;
  onClose: () => void;
  onSaved: (id: number) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const queryClient = useQueryClient();
  const editing = connector !== undefined;
  const [draft, setDraft] = useState<ConnectorDraft>(EMPTY_DRAFT);
  const groups = useConnectorGroups();

  // What the form starts from, and starts again from at every opening: the
  // connector as saved, or an empty one.
  const saved = useMemo(() => (editing ? draftOf(connector) : EMPTY_DRAFT), [editing, connector]);
  useEffect(() => {
    if (open) setDraft(saved);
  }, [open, saved]);
  // Changes not saved yet: a stray click beside the panel must not drop them.
  const unsaved = JSON.stringify(draft) !== JSON.stringify(saved);

  const save = useMutation({
    mutationFn: () => saveFormConnector(connector?.id, inputOf(draft)),
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: ["form-connectors"] });
      onSaved(saved.id);
    },
  });
  const remove = useMutation({
    mutationFn: () => deleteFormConnector(connector?.id ?? 0),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["form-connectors"] });
      onClose();
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    save.mutate();
  }

  const set = (patch: Partial<ConnectorDraft>) => {
    setDraft({ ...draft, ...patch });
  };
  const text = (key: keyof ConnectorDraft, extra?: { mono?: boolean; placeholder?: string }) => (
    <input
      id={`${id}-${key}`}
      value={String(draft[key])}
      onChange={(event) => {
        set({ [key]: event.target.value });
      }}
      placeholder={extra?.placeholder}
      className={`${INPUT} ${extra?.mono === true ? "font-mono" : ""}`}
    />
  );
  const area = (key: keyof ConnectorDraft, rows: number, placeholder?: string) => (
    <textarea
      id={`${id}-${key}`}
      rows={rows}
      value={String(draft[key])}
      onChange={(event) => {
        set({ [key]: event.target.value });
      }}
      placeholder={placeholder}
      spellCheck={false}
      className={AREA}
    />
  );

  /** A secret: whether it is set, a field to replace it, a way to remove it. */
  const secret = (key: SecretKey, multiline = false) => {
    const isSet = connector?.secrets[key] === true && !draft.removed.includes(key);
    const fieldId = `${id}-secret-${key}`;
    const onChange = (value: string) => {
      set({ secrets: { ...draft.secrets, [key]: value } });
    };
    return (
      <div key={key}>
        <div className="mb-1 flex items-center gap-2">
          <label className="font-medium" htmlFor={fieldId}>
            {t(`formConnectors.secret.${key}`)}
          </label>
          <span className="text-ink-muted">
            {isSet ? (
              <>
                <span aria-hidden="true">●</span> {t("formConnectors.secret.set")}
              </>
            ) : draft.removed.includes(key) ? (
              t("formConnectors.secret.removed")
            ) : (
              t("formConnectors.secret.unset")
            )}
          </span>
          {connector?.secrets[key] === true && (
            <button
              type="button"
              className="ml-auto text-accent hover:underline"
              onClick={() => {
                set({
                  removed: draft.removed.includes(key)
                    ? draft.removed.filter((k) => k !== key)
                    : [...draft.removed, key],
                  secrets: { ...draft.secrets, [key]: "" },
                });
              }}
            >
              {draft.removed.includes(key)
                ? t("formConnectors.secret.keep")
                : t("formConnectors.secret.remove")}
            </button>
          )}
        </div>
        {multiline ? (
          <textarea
            id={fieldId}
            rows={3}
            disabled={draft.removed.includes(key)}
            value={draft.secrets[key]}
            onChange={(event) => {
              onChange(event.target.value);
            }}
            placeholder={isSet ? t("formConnectors.secret.keepHint") : ""}
            spellCheck={false}
            autoComplete="off"
            className={AREA}
          />
        ) : (
          <input
            id={fieldId}
            type="password"
            autoComplete="new-password"
            disabled={draft.removed.includes(key)}
            value={draft.secrets[key]}
            onChange={(event) => {
              onChange(event.target.value);
            }}
            placeholder={isSet ? t("formConnectors.secret.keepHint") : ""}
            className={INPUT}
          />
        )}
      </div>
    );
  };

  const chosen = draft.groupIds.map(
    (gid) => groups.data?.find((g) => g.id === gid) ?? { id: gid, role: String(gid) },
  );
  const usedSecrets = secretsOf(draft.authType, draft.clientCert.trim() !== "");

  return (
    <SlideOver
      // The panel is also where a connector is read: a click beside it closes it,
      // unless it holds changes not saved yet.
      closeOnOutsideClick={!unsaved}
      open={open}
      title={
        editing
          ? t("formConnectors.form.editTitle", { name: connector.name })
          : t("formConnectors.form.createTitle")
      }
      onClose={onClose}
      closeLabel={t("detail.close")}
      resizeLabel={t("detail.resize")}
      leading={<ObjectIcon kind="formConnector" />}
      size="wide"
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <fieldset className={FIELDSET}>
          <legend className="px-1 font-medium">{t("formConnectors.form.general")}</legend>
          <Field
            id={`${id}-name`}
            label={t("formConnectors.fields.name")}
            hint={t("formConnectors.form.nameHint")}
          >
            {text("name", { mono: true, placeholder: "cmdb" })}
          </Field>
          <Field id={`${id}-description`} label={t("formConnectors.fields.description")}>
            {text("description")}
          </Field>
          <Field
            id={`${id}-baseUrl`}
            label={t("formConnectors.fields.base_url")}
            hint={t("formConnectors.form.baseUrlHint")}
          >
            {text("baseUrl", { mono: true, placeholder: "https://cmdb.example.com/api/v2" })}
          </Field>
        </fieldset>

        <fieldset className={FIELDSET}>
          <legend className="px-1 font-medium">{t("formConnectors.form.calls")}</legend>
          <div role="group" aria-labelledby={`${id}-methods`}>
            <p id={`${id}-methods`} className="mb-1 font-medium">
              {t("formConnectors.fields.methods")}
            </p>
            <div className="flex flex-wrap gap-3">
              {METHODS.map((m: ConnectorMethod) => (
                <label key={m} className="flex items-center gap-1.5 font-mono">
                  <input
                    type="checkbox"
                    checked={draft.methods.includes(m)}
                    onChange={(event) => {
                      set({
                        methods: event.target.checked
                          ? METHODS.filter((x) => x === m || draft.methods.includes(x))
                          : draft.methods.filter((x) => x !== m),
                      });
                    }}
                  />
                  {m}
                </label>
              ))}
            </div>
          </div>
          <Field
            id={`${id}-paths`}
            label={t("formConnectors.fields.paths")}
            hint={t("formConnectors.form.pathsHint")}
          >
            {area("paths", 3, "/servers\n/tickets")}
          </Field>
          <Field
            id={`${id}-networks`}
            label={t("formConnectors.fields.networks")}
            hint={t("formConnectors.form.networksHint")}
          >
            {area("networks", 2, "10.20.0.0/16")}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field id={`${id}-timeout`} label={t("formConnectors.fields.timeout")}>
              {text("timeout")}
            </Field>
            <Field id={`${id}-maxKiB`} label={t("formConnectors.fields.max_kib")}>
              {text("maxKiB")}
            </Field>
          </div>
          <Field
            id={`${id}-headers`}
            label={t("formConnectors.fields.headers")}
            hint={t("formConnectors.form.headersHint")}
          >
            {area("headers", 2, "X-Client: oc3")}
          </Field>
        </fieldset>

        <fieldset className={FIELDSET}>
          <legend className="px-1 font-medium">{t("formConnectors.form.auth")}</legend>
          <Field id={`${id}-authType`} label={t("formConnectors.fields.auth_type")}>
            <select
              id={`${id}-authType`}
              value={draft.authType}
              onChange={(event) => {
                set({ authType: event.target.value as ConnectorDraft["authType"] });
              }}
              className={INPUT}
            >
              {AUTH_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(`formConnectors.auth.${type}`)}
                </option>
              ))}
            </select>
          </Field>
          {draft.authType === "basic" && (
            <Field id={`${id}-username`} label={t("formConnectors.fields.username")}>
              {text("username")}
            </Field>
          )}
          {draft.authType === "api_key" && (
            <div className="grid grid-cols-2 gap-3">
              <Field id={`${id}-apiKeyIn`} label={t("formConnectors.fields.api_key_in")}>
                <select
                  id={`${id}-apiKeyIn`}
                  value={draft.apiKeyIn}
                  onChange={(event) => {
                    set({ apiKeyIn: event.target.value === "query" ? "query" : "header" });
                  }}
                  className={INPUT}
                >
                  <option value="header">{t("formConnectors.apiKeyIn.header")}</option>
                  <option value="query">{t("formConnectors.apiKeyIn.query")}</option>
                </select>
              </Field>
              <Field id={`${id}-apiKeyName`} label={t("formConnectors.fields.api_key_name")}>
                {text("apiKeyName", { mono: true, placeholder: "X-API-Key" })}
              </Field>
            </div>
          )}
          {draft.authType === "oauth2_client_credentials" && (
            <>
              <Field id={`${id}-tokenUrl`} label={t("formConnectors.fields.token_url")}>
                {text("tokenUrl", { mono: true, placeholder: "https://idp.example.com/token" })}
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field id={`${id}-clientId`} label={t("formConnectors.fields.client_id")}>
                  {text("clientId", { mono: true })}
                </Field>
                <Field id={`${id}-authStyle`} label={t("formConnectors.fields.auth_style")}>
                  <select
                    id={`${id}-authStyle`}
                    value={draft.authStyle}
                    onChange={(event) => {
                      set({ authStyle: event.target.value === "params" ? "params" : "header" });
                    }}
                    className={INPUT}
                  >
                    <option value="header">{t("formConnectors.authStyle.header")}</option>
                    <option value="params">{t("formConnectors.authStyle.params")}</option>
                  </select>
                </Field>
                <Field
                  id={`${id}-scopes`}
                  label={t("formConnectors.fields.scopes")}
                  hint={t("formConnectors.form.scopesHint")}
                >
                  {text("scopes", { mono: true })}
                </Field>
                <Field id={`${id}-audience`} label={t("formConnectors.fields.audience")}>
                  {text("audience", { mono: true })}
                </Field>
              </div>
            </>
          )}
          {usedSecrets.filter((key) => key !== "client_key").map((key) => secret(key))}
        </fieldset>

        <fieldset className={FIELDSET}>
          <legend className="px-1 font-medium">{t("formConnectors.form.tls")}</legend>
          <Field
            id={`${id}-caBundle`}
            label={t("formConnectors.fields.ca_bundle")}
            hint={t("formConnectors.form.caHint")}
          >
            {area("caBundle", 3, "-----BEGIN CERTIFICATE-----")}
          </Field>
          <Field
            id={`${id}-clientCert`}
            label={t("formConnectors.fields.client_cert")}
            hint={t("formConnectors.form.clientCertHint")}
          >
            {area("clientCert", 3, "-----BEGIN CERTIFICATE-----")}
          </Field>
          {usedSecrets.includes("client_key") && secret("client_key", true)}
          <Field id={`${id}-serverName`} label={t("formConnectors.fields.server_name")}>
            {text("serverName", { mono: true })}
          </Field>
        </fieldset>

        <fieldset className={FIELDSET}>
          <legend className="px-1 font-medium">{t("formConnectors.fields.groups")}</legend>
          <p className="text-ink-muted">{t("formConnectors.form.groupsHint")}</p>
          {chosen.length > 0 && (
            <ul aria-label={t("formConnectors.fields.groups")} className="flex flex-wrap gap-1.5">
              {chosen.map((entry) => (
                <li
                  key={entry.id}
                  className="flex h-6 items-center gap-1 rounded-full border border-line bg-surface pr-0.5 pl-2"
                >
                  {entry.role}
                  <button
                    type="button"
                    onClick={() => {
                      set({ groupIds: draft.groupIds.filter((gid) => gid !== entry.id) });
                    }}
                    title={t("formConnectors.form.removeGroup", { group: entry.role })}
                    className="rounded-full p-0.5 text-ink-muted hover:bg-surface-sunken hover:text-ink"
                  >
                    <CloseIcon className="h-3 w-3" />
                    <span className="sr-only">
                      {t("formConnectors.form.removeGroup", { group: entry.role })}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Combobox
            options={(groups.data ?? [])
              .filter((g) => !draft.groupIds.includes(g.id))
              .map((g) => ({ value: String(g.id), label: g.role }))}
            // Picking a group adds it: the field is ready for the next one.
            value=""
            onChange={(value) => {
              if (value !== "") set({ groupIds: [...draft.groupIds, Number(value)] });
            }}
            label={t("formConnectors.form.addGroup")}
            placeholder={t("formConnectors.form.addGroup")}
            emptyText={t("compEditor.noMatch")}
            className="w-64"
          />
        </fieldset>

        {save.isError && (
          <p role="alert" className="text-state-down">
            ■ {save.error.message}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={save.isPending}
            className="h-8 rounded-(--radius-control) bg-accent px-3 font-medium text-accent-ink disabled:opacity-60"
          >
            {save.isPending
              ? t("formConnectors.form.saving")
              : editing
                ? t("formConnectors.form.saveEdit")
                : t("formConnectors.form.saveCreate")}
          </button>
          {save.isSuccess && !save.isPending && (
            <span role="status" className="text-ink-muted">
              ✓ {t("formConnectors.form.saved")}
            </span>
          )}
        </div>
      </form>

      {editing && (
        <>
          <ConnectorTest connector={connector} />
          <div className="mt-6 border-t border-line pt-4">
            {remove.isError && (
              <p role="alert" className="mb-2 text-state-down">
                ■ {remove.error.message}
              </p>
            )}
            <ConfirmButton
              label={t("formConnectors.form.delete")}
              question={t("formConnectors.form.deleteQuestion", { name: connector.name })}
              confirmLabel={t("formConnectors.form.deleteConfirm")}
              cancelLabel={t("designer.cancel")}
              pendingLabel={t("formConnectors.form.deleting")}
              pending={remove.isPending}
              icon={<TrashIcon className="h-3.5 w-3.5" />}
              onConfirm={() => {
                remove.mutate();
              }}
            />
          </div>
        </>
      )}
    </SlideOver>
  );
}

/** One call through a saved connector, and how the API answered. */
function ConnectorTest({ connector }: { connector: FormConnector }) {
  const { t } = useTranslation();
  const id = useId();
  const [method, setMethod] = useState<ConnectorMethod>(connector.methods[0] ?? "GET");
  const [path, setPath] = useState(connector.paths[0] ?? "/");
  const [query, setQuery] = useState("");
  const test = useMutation({
    mutationFn: () =>
      testFormConnector(connector.id, {
        method,
        path,
        query: Object.fromEntries(
          query
            .split("\n")
            .map((line) => line.split("="))
            .filter((parts) => parts.length >= 2 && parts[0]?.trim() !== "")
            .map(([k = "", ...v]) => [k.trim(), v.join("=").trim()]),
        ),
      }),
  });
  const result: FormConnectorTestResult | undefined = test.data;
  const ok = result?.status !== undefined && result.status < 300;
  return (
    <section className="mt-6 border-t border-line pt-4" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} className="mb-1 font-semibold">
        {t("formConnectors.test.title")}
      </h3>
      <p className="mb-2 text-ink-muted">{t("formConnectors.test.intro")}</p>
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="mb-1 block" htmlFor={`${id}-method`}>
            {t("formConnectors.test.method")}
          </label>
          <select
            id={`${id}-method`}
            value={method}
            onChange={(event) => {
              setMethod(event.target.value as ConnectorMethod);
            }}
            className={`${INPUT} w-28 font-mono`}
          >
            {connector.methods.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </div>
        <div className="min-w-48 flex-1">
          <label className="mb-1 block" htmlFor={`${id}-path`}>
            {t("formConnectors.test.path")}
          </label>
          <input
            id={`${id}-path`}
            value={path}
            onChange={(event) => {
              setPath(event.target.value);
            }}
            className={`${INPUT} font-mono`}
          />
        </div>
        <button
          type="button"
          disabled={test.isPending}
          onClick={() => {
            test.mutate();
          }}
          className="h-8 rounded-(--radius-control) border border-line bg-surface px-3 font-medium hover:bg-surface-sunken disabled:opacity-60"
        >
          {test.isPending ? t("formConnectors.test.running") : t("formConnectors.test.run")}
        </button>
      </div>
      <label className="mt-2 mb-1 block" htmlFor={`${id}-query`}>
        {t("formConnectors.test.query")}
      </label>
      <textarea
        id={`${id}-query`}
        rows={2}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
        }}
        placeholder="status=active"
        spellCheck={false}
        className={AREA}
      />
      {test.isError && (
        <p role="alert" className="mt-2 text-state-down">
          ■ {test.error.message}
        </p>
      )}
      {result !== undefined && (
        <div role="status" className="mt-3 flex flex-col gap-1">
          {result.error !== undefined ? (
            <p className="text-state-down">
              ■ {t("formConnectors.test.failed", { message: result.error })}
            </p>
          ) : (
            <p className={ok ? "text-state-up" : "text-state-down"}>
              {ok ? "✓" : "■"}{" "}
              {t("formConnectors.test.answered", {
                status: result.status,
                ms: result.duration_ms,
              })}
            </p>
          )}
          <p className="font-mono break-all text-ink-muted">{result.url}</p>
          {result.body !== undefined && result.body !== "" && (
            <pre className="max-h-64 overflow-auto rounded-(--radius-control) bg-surface-sunken p-2 font-mono text-data whitespace-pre-wrap">
              {result.body}
            </pre>
          )}
        </div>
      )}
    </section>
  );
}
