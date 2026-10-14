import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { components } from "@/lib/api/schema";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";
import { DetailPanel } from "@/components/opensvc/DetailPanel";
import { RESOURCE_GROUPS } from "./resource-groups";
import { resourceName } from "./resource-format";
import { ResourceActionsMenu } from "./ResourceActionsMenu";

type ResourceRow = components["schemas"]["ResourceRow"];

// The fields shown, and the names the actions menu reads.
const PROPS = [
  ...new Set([
    ...RESOURCE_GROUPS.flatMap((group) => group.fields.map((f) => f.prop)),
    "services.svcname",
    "nodes.nodename",
  ]),
].join(",");

/**
 * A resource of a service instance: where it runs, its state as the agent last
 * reported it, its log, and the agent actions on it in the header. Nothing is
 * edited here.
 */
export function ResourceDetailPanel({
  resourceId,
  label,
  onClose,
}: {
  resourceId: string | undefined;
  label: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const {
    data: resource,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: ["resource", resourceId],
    enabled: resourceId !== undefined,
    queryFn: async () => {
      const { data, error: failure } = await api.GET("/resources/{resource_id}", {
        params: { path: { resource_id: resourceId ?? "" }, query: { props: PROPS } },
      });
      if (failure !== undefined) throw new Error(problemText(failure));
      const rows: ResourceRow[] = Array.isArray(data.data) ? data.data : [];
      return rows[0] ?? null;
    },
  });
  const title =
    resource === undefined || resource === null
      ? label === ""
        ? t("resources.detail.title")
        : label
      : resourceName(resource);

  return (
    <DetailPanel
      kind="resource"
      recordId={resourceId}
      open={resourceId !== undefined}
      title={title}
      onClose={onClose}
      titleActions={
        resource !== undefined && resource !== null ? (
          <ResourceActionsMenu resources={[resource]} />
        ) : undefined
      }
      groups={RESOURCE_GROUPS}
      row={resource}
      labelPrefix="resources.fields"
      groupPrefix="resources.detail.groups"
      isPending={isPending}
      errorMessage={isError ? error.message : null}
      editHint=""
    />
  );
}
