import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ObjectIcon } from "@/components/opensvc/ObjectIcon";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";
import { useAppCodes } from "@/features/apps/use-app-codes";
import { SlideOver } from "@/components/ui/SlideOver";
import { Combobox } from "@/components/ui/Combobox";
import {
  useFieldConstraints,
  valueLists,
} from "@/features/field-constraints/use-field-constraints";

const FIELDS = ["nodename", "node_env", "team_responsible", "fqdn", "loc_city"] as const;
type Field = (typeof FIELDS)[number];

const EMPTY: Record<Field, string> = {
  nodename: "",
  node_env: "",
  team_responsible: "",
  fqdn: "",
  loc_city: "",
};

/**
 * Creating a node by hand, like the "add node" entry of the historical collector's
 * data management. In normal operation a node creates itself, by registering from
 * the agent.
 *
 * `POST /nodes` creates or updates: a nodename already taken would modify the
 * existing node instead of failing. A creation form must not do that silently, hence
 * the check beforehand.
 */
export function CreateNodePanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Record<Field, string>>(EMPTY);
  const [app, setApp] = useState("");
  const appCodes = useAppCodes();
  // The values configured for the attributes, the city among them: offered in a
  // dropdown, the server refusing the others when the list is strict.
  const lists = valueLists(useFieldConstraints("node").data?.data);

  const create = useMutation({
    mutationFn: async () => {
      const { response } = await api.GET("/nodes/{node_id}", {
        params: { path: { node_id: values.nodename }, query: { props: "node_id" } },
      });
      if (response.status !== 404) {
        throw new Error(t("nodes.create.exists", { nodename: values.nodename }));
      }

      const { data, error } = await api.POST("/nodes", {
        body: {
          nodename: values.nodename,
          node_env: values.node_env,
          team_responsible: values.team_responsible,
          fqdn: values.fqdn,
          loc_city: values.loc_city,
          app,
        },
      });
      if (error !== undefined) throw new Error(problemText(error));
      return data;
    },
    onSuccess: async () => {
      setValues(EMPTY);
      setApp("");
      await queryClient.invalidateQueries({ queryKey: ["nodes"] });
      onClose();
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    create.mutate();
  }

  return (
    <SlideOver
      open={open}
      title={t("nodes.create.title")}
      onClose={onClose}
      closeLabel={t("detail.close")}
      resizeLabel={t("detail.resize")}
      leading={<ObjectIcon kind="node" />}
    >
      <p className="mb-3 text-ink-muted">{t("nodes.create.intro")}</p>

      <form onSubmit={onSubmit}>
        <div className="mb-3">
          <label className="mb-1 block font-medium" htmlFor="create-node-nodename">
            {t("nodes.fields.nodename")}
          </label>
          <input
            id="create-node-nodename"
            required
            value={values.nodename}
            onChange={(event) => {
              setValues((previous) => ({ ...previous, nodename: event.target.value }));
            }}
            className="h-8 w-full rounded-(--radius-control) border border-line bg-surface px-2"
          />
        </div>

        <div className="mb-3">
          <label className="mb-1 block font-medium" htmlFor="create-node-app">
            {t("nodes.fields.app")}
          </label>
          <select
            id="create-node-app"
            value={app}
            onChange={(event) => {
              setApp(event.target.value);
            }}
            className="h-8 w-full rounded-(--radius-control) border border-line bg-surface px-2"
          >
            {/* Empty: the server then keeps the user's default application code. */}
            <option value="">{t("nodes.create.defaultApp")}</option>
            {(appCodes.data ?? []).map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </div>

        {FIELDS.filter((field) => field !== "nodename").map((field) => {
          const list = lists[field];
          const set = (value: string) => {
            setValues((previous) => ({ ...previous, [field]: value }));
          };
          return (
            <div key={field} className="mb-3">
              <label className="mb-1 block font-medium" htmlFor={`create-node-${field}`}>
                {t(`nodes.fields.${field}`)}
              </label>
              {list === undefined || list.pattern !== undefined ? (
                <input
                  id={`create-node-${field}`}
                  value={values[field]}
                  onChange={(event) => {
                    set(event.target.value);
                  }}
                  // A regex constraint, checked by the browser before sending: the
                  // pattern attribute matches the whole value, as the server does.
                  pattern={list?.pattern}
                  placeholder={list?.pattern}
                  title={
                    list?.pattern === undefined
                      ? undefined
                      : t("detail.patternHint", { pattern: list.pattern })
                  }
                  className="h-8 w-full rounded-(--radius-control) border border-line bg-surface px-2"
                />
              ) : (
                <Combobox
                  id={`create-node-${field}`}
                  options={list.values.map((value) => ({ value, label: value }))}
                  value={values[field]}
                  onChange={set}
                  freeText={!list.strict}
                  label={t(`nodes.fields.${field}`)}
                  placeholder={t("detail.searchValue")}
                  emptyText={t("detail.noMatch")}
                  inputClassName="h-8"
                />
              )}
            </div>
          );
        })}

        {create.isError && (
          <p role="alert" className="mb-3 text-state-down">
            ■ {create.error.message}
          </p>
        )}

        <button
          type="submit"
          disabled={create.isPending}
          className="h-8 rounded-(--radius-control) bg-accent px-3 font-medium text-accent-ink disabled:opacity-60"
        >
          {create.isPending ? t("nodes.create.submitting") : t("nodes.create.submit")}
        </button>
      </form>
    </SlideOver>
  );
}
