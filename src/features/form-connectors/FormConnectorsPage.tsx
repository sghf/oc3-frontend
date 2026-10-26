import { useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ObjectIcon } from "@/components/opensvc/ObjectIcon";
import { DateTime } from "@/components/ui/DateTime";
import { FormConnectorPanel } from "./FormConnectorPanel";
import { useFormConnectors } from "./form-connectors-api";

/**
 * The connectors of the forms: the external APIs their inputs and rest outputs
 * call through oc3, never from the browser. A Manager declares each one, what
 * the forms may call there and how oc3 authenticates; a form names it in its
 * Connector key. The selected connector lives in the URL.
 */
export function FormConnectorsPage() {
  const { t } = useTranslation();
  const search = useSearch({ from: "/form-connectors" });
  const navigate = useNavigate({ from: "/form-connectors" });
  const connectors = useFormConnectors();
  const [creating, setCreating] = useState(false);
  const selected = connectors.data?.find((c) => String(c.id) === search.sel);

  function select(sel: string | undefined) {
    void navigate({ search: (previous) => ({ ...previous, sel }) });
  }

  return (
    <section>
      <div className="mb-3 flex items-center gap-3">
        <h1 className="flex items-center gap-2 text-title font-semibold">
          <ObjectIcon kind="formConnector" className="h-5 w-5" />
          {t("formConnectors.title")}
        </h1>
        <button
          type="button"
          onClick={() => {
            select(undefined);
            setCreating(true);
          }}
          className="h-7 rounded-(--radius-control) bg-accent px-3 font-medium text-accent-ink"
        >
          {t("formConnectors.new")}
        </button>
      </div>
      <p className="mb-3 max-w-3xl text-ink-muted">{t("formConnectors.intro")}</p>

      {connectors.isPending ? (
        <p className="text-ink-muted">{t("list.loading")}</p>
      ) : connectors.isError ? (
        <p role="alert" className="text-state-down">
          ■ {connectors.error.message}
        </p>
      ) : connectors.data.length === 0 ? (
        <p className="text-ink-muted">{t("formConnectors.empty")}</p>
      ) : (
        <div className="overflow-x-auto rounded-(--radius-panel) border border-line bg-surface-raised">
          <table className="w-full border-collapse text-data">
            <caption className="sr-only">{t("formConnectors.title")}</caption>
            <thead>
              <tr className="border-b border-line text-left text-ink-muted">
                {["name", "base_url", "auth_type", "methods", "paths", "groups", "updated"].map(
                  (key) => (
                    <th key={key} scope="col" className="px-3 py-1.5 font-medium whitespace-nowrap">
                      {t(`formConnectors.fields.${key}`)}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {connectors.data.map((c) => (
                <tr
                  key={c.id}
                  className={`border-b border-line/60 align-top last:border-b-0 ${
                    selected?.id === c.id ? "bg-accent-soft" : ""
                  }`}
                >
                  <th scope="row" className="px-3 py-1.5 text-left font-normal">
                    <button
                      type="button"
                      onClick={() => {
                        setCreating(false);
                        select(String(c.id));
                      }}
                      className="font-mono font-medium text-accent hover:underline"
                    >
                      {c.name}
                    </button>
                    {c.description !== "" && (
                      <span className="block text-ink-muted">{c.description}</span>
                    )}
                  </th>
                  <td className="px-3 py-1.5 font-mono break-all">{c.base_url}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">
                    {t(`formConnectors.auth.${c.auth.type}`)}
                    {c.tls.client_cert !== undefined && (
                      <span className="block text-ink-muted">{t("formConnectors.mtls")}</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 font-mono">{c.methods.join(", ")}</td>
                  <td className="px-3 py-1.5 font-mono">
                    {c.paths.length === 0 ? (
                      <span className="font-sans text-ink-muted">
                        {t("formConnectors.anyPath")}
                      </span>
                    ) : (
                      c.paths.join(", ")
                    )}
                  </td>
                  <td className="px-3 py-1.5">
                    {c.groups.length === 0 ? (
                      <span className="text-state-warn">
                        <span aria-hidden="true">▲</span> {t("formConnectors.noGroup")}
                      </span>
                    ) : (
                      c.groups.map((g) => g.role).join(", ")
                    )}
                  </td>
                  <td className="px-3 py-1.5 whitespace-nowrap">
                    <DateTime value={c.updated} />
                    {c.updated_by !== "" && (
                      <span className="block text-ink-muted">{c.updated_by}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <FormConnectorPanel
        open={creating || selected !== undefined}
        connector={creating ? undefined : selected}
        onClose={() => {
          setCreating(false);
          select(undefined);
        }}
        onSaved={(id) => {
          setCreating(false);
          select(String(id));
        }}
      />
    </section>
  );
}
