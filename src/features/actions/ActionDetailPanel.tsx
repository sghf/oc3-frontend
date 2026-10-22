import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";
import { CrossLink } from "@/components/opensvc/CrossLink";
import { OutputLines } from "@/components/opensvc/LogLines";
import { ObjectIcon } from "@/components/opensvc/ObjectIcon";
import { StatusBadge } from "@/components/opensvc/StatusBadge";
import { SlideOver } from "@/components/ui/SlideOver";
import { DateTime } from "@/components/ui/DateTime";
import { ActionQueueMenu } from "./ActionQueueMenu";
import { isPending, realDate, toActionRows, type ActionRow } from "./action-row";

/**
 * Detail of an action in the queue: what the agent received, and what it returned.
 *
 * A panel written by hand rather than built on `DetailPanel`: the standard output and
 * the error output read as logs (`OutputLines`), not as a list of properties.
 */
export function ActionDetailPanel({
  actionId,
  onClose,
}: {
  actionId: string | undefined;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const {
    data,
    isPending: loading,
    isError,
    error,
  } = useQuery({
    queryKey: ["action", actionId],
    enabled: actionId !== undefined,
    queryFn: async () => {
      const { data: page, error: failure } = await api.GET("/actions/{id}", {
        params: {
          path: { id: actionId ?? "" },
          query: {
            props:
              "id,status,command,action_type,connect_to,date_queued,date_dequeued,ret,stdout,stderr,node_id,svc_id,nodes.nodename,services.svcname",
          },
        },
      });
      if (failure !== undefined) throw new Error(problemText(failure));
      return toActionRows(page.data)[0] ?? null;
    },
  });

  const row: ActionRow | null | undefined = data;
  const field = (labelKey: string, value: React.ReactNode) =>
    value === undefined || value === "" ? null : (
      <div className="grid grid-cols-[10rem_1fr] gap-2 py-0.5">
        <dt className="text-ink-muted">{t(labelKey)}</dt>
        <dd className="min-w-0 break-words">{value}</dd>
      </div>
    );

  return (
    <SlideOver
      open={actionId !== undefined}
      title={row === null || row === undefined ? t("actions.detail.title") : row.command}
      onClose={onClose}
      closeLabel={t("detail.close")}
      resizeLabel={t("detail.resize")}
      leading={<ObjectIcon kind="log" />}
      size="wide"
    >
      {actionId !== undefined && loading ? (
        <p className="text-ink-muted">{t("detail.loading")}</p>
      ) : isError ? (
        <p role="alert" className="text-state-down">
          ■ {t("detail.error", { message: error.message })}
        </p>
      ) : row === null || row === undefined ? (
        <p className="text-ink-muted">{t("actions.detail.missing")}</p>
      ) : (
        <>
          <div className="mb-4">
            <ActionQueueMenu actions={[{ id: row.id, name: row.command }]} />
          </div>
          <dl className="mb-4">
            {field(
              "actions.fields.status",
              <span className="inline-flex items-center gap-2">
                <StatusBadge
                  state={isPending(row.status) ? "warn" : row.ret === "0" ? "up" : "down"}
                  label={row.status}
                />
                {isPending(row.status) ? t("actions.pending") : t("actions.done")}
              </span>,
            )}
            {field("actions.fields.command", <code className="text-data">{row.command}</code>)}
            {field(
              "actions.fields.nodes.nodename",
              row["nodes.nodename"] === "" ? undefined : (
                <CrossLink kind="node" id={row.node_id}>
                  {row["nodes.nodename"]}
                </CrossLink>
              ),
            )}
            {field(
              "actions.fields.services.svcname",
              row["services.svcname"] === "" ? undefined : (
                <CrossLink kind="service" id={row.svc_id}>
                  {row["services.svcname"]}
                </CrossLink>
              ),
            )}
            {field("actions.fields.action_type", row.action_type)}
            {field("actions.fields.connect_to", row.connect_to)}
            {field(
              "actions.fields.date_queued",
              realDate(row.date_queued) === undefined ? undefined : (
                <DateTime value={realDate(row.date_queued)} />
              ),
            )}
            {field(
              "actions.fields.date_dequeued",
              realDate(row.date_dequeued) === undefined ? undefined : (
                <DateTime value={realDate(row.date_dequeued)} />
              ),
            )}
            {field("actions.fields.ret", isPending(row.status) ? undefined : row.ret)}
          </dl>

          {row.stdout !== "" && (
            <section className="mb-4">
              <h3 className="mb-1 font-semibold text-ink-muted">{t("actions.fields.stdout")}</h3>
              <OutputLines output={row.stdout} filename={`action-${row.id}-stdout`} />
            </section>
          )}
          {row.stderr !== "" && (
            <section>
              <h3 className="mb-1 font-semibold text-ink-muted">{t("actions.fields.stderr")}</h3>
              <OutputLines output={row.stderr} filename={`action-${row.id}-stderr`} />
            </section>
          )}
          {row.stdout === "" && row.stderr === "" && (
            <p className="text-ink-muted">{t("actions.noOutput")}</p>
          )}
        </>
      )}
    </SlideOver>
  );
}
