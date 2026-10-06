import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";
import { ActionLogLines } from "@/components/opensvc/AgentActionParts";
import type { AgentAction } from "@/components/opensvc/agent-action";
import { DetailPanel } from "@/components/opensvc/DetailPanel";
import { ACTION_GROUPS } from "./action-groups";
import { actionName } from "./action-name";

/** The props the panel shows, and those the log lines are found with. */
const PROPS = [
  ...new Set([
    "id",
    "svc_id",
    "node_id",
    "subset",
    ...ACTION_GROUPS.flatMap((group) => group.fields.map((f) => f.prop)),
  ]),
].join(",");

/**
 * An action an agent ran on a service: where and how it ran, how it ended, its
 * acknowledgement, and under them the lines the agent wrote during it. Nothing is
 * edited here.
 */
export function ServiceActionDetailPanel({
  actionId,
  label,
  onClose,
}: {
  actionId: string | undefined;
  label: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const {
    data: action,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: ["agentAction", actionId],
    enabled: actionId !== undefined,
    queryFn: async () => {
      const { data, error: failure } = await api.GET("/services_actions/{action_id}", {
        params: { path: { action_id: actionId ?? "" }, query: { props: PROPS } },
      });
      if (failure !== undefined) throw new Error(problemText(failure));
      const rows: AgentAction[] = Array.isArray(data.data) ? data.data : [];
      return rows[0] ?? null;
    },
  });
  const title =
    action === undefined || action === null
      ? label === ""
        ? t("serviceActions.detail.title")
        : label
      : actionName(action);

  return (
    <DetailPanel
      kind="action"
      recordId={actionId}
      open={actionId !== undefined}
      title={title}
      onClose={onClose}
      groups={ACTION_GROUPS}
      row={action}
      labelPrefix="serviceActions.fields"
      groupPrefix="serviceActions.detail.groups"
      isPending={isPending}
      errorMessage={isError ? error.message : null}
      editHint=""
      after={
        action === undefined || action === null ? undefined : (
          <section className="mt-4">
            <h3 className="mb-2 font-semibold">{t("serviceActions.detail.log")}</h3>
            <ActionLogLines action={action} />
          </section>
        )
      }
    />
  );
}
