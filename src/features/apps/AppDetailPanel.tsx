import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { components } from "@/lib/api/schema";
import { api } from "@/lib/api/client";
import { DetailPanel, type DetailGroup } from "@/components/opensvc/DetailPanel";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { TrashIcon } from "@/components/ui/icons";
import { problemText } from "@/lib/api/problem";
import { formatDateTime } from "@/lib/format";
import { ChangeOutcomeLine, TeamsPart } from "@/components/opensvc/CompEditorParts";
import { useChanges } from "@/components/opensvc/comp-changes";
import {
  useAppTeamCandidates,
  useAppTeams,
  useAppTeamsChanged,
  useCanEditAppTeams,
} from "./use-app-teams";

type AppRow = components["schemas"]["AppRow"];

const text = (prop: keyof AppRow) => (row: AppRow) => {
  const value = row[prop];
  return value === undefined ? undefined : String(value);
};

function groups(editable: boolean): DetailGroup<AppRow>[] {
  return [
    {
      key: "identity",
      family: "app",
      fields: [
        { prop: "app", format: text("app"), editable },
        { prop: "description", format: text("description"), editable },
        { prop: "app_domain", format: text("app_domain"), editable },
        { prop: "app_team_ops", format: text("app_team_ops"), editable, optionsKey: "teams" },
        { prop: "id", format: text("id") },
        {
          prop: "updated",
          format: (row, locale) => formatDateTime(row.updated, locale),
        },
      ],
    },
  ];
}

/**
 * An application code: its properties, its responsible and publication teams, and
 * its deletion. An AppManager responsible for the app changes its properties and
 * adds and removes its teams in place, each change written at once: the
 * responsible teams manage the app, the publication teams see its nodes and
 * services. Renaming the code renames it on its nodes and services too.
 *
 * `appId` is a record id or a code; after a rename, the panel follows the new
 * code, and tells `onRenamed`, for the view holding the selection.
 */
export function AppDetailPanel({
  appId: requestedId,
  label,
  onClose,
  onRenamed,
}: {
  appId: string | undefined;
  label: string;
  onClose: () => void;
  onRenamed?: (code: string) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  // Tied to the code it renames: opening another app forgets it.
  const [renamed, setRenamed] = useState<{ from: string; to: string } | null>(null);
  const appId = renamed !== null && renamed.from === requestedId ? renamed.to : requestedId;
  const {
    data: app,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: ["app", appId],
    enabled: appId !== undefined,
    queryFn: async () => {
      // Unlike nodes and services, this endpoint returns the bare row.
      const { data, error: failure } = await api.GET("/apps/{app_id}", {
        params: { path: { app_id: appId ?? "" } },
      });
      if (failure !== undefined) throw new Error(JSON.stringify(failure));
      return data;
    },
  });

  const teams = useAppTeams(appId);
  const editable = useCanEditAppTeams(appId);

  // The API trims the code and refuses an empty one, one carried by another app
  // whatever the case, and an ops team that is not an organizational group; its
  // reason is shown under the field.
  const save = useMutation({
    mutationFn: async (changes: Record<string, string | number | boolean>) => {
      const body: {
        app?: string;
        description?: string;
        app_domain?: string;
        app_team_ops?: string;
      } = {};
      for (const key of ["app", "description", "app_domain", "app_team_ops"] as const) {
        const value = changes[key];
        if (typeof value === "string") body[key] = value;
      }
      const { data, error: failure } = await api.POST("/apps/{app_id}", {
        params: { path: { app_id: appId ?? "" } },
        body,
      });
      if (failure !== undefined) throw new Error(problemText(failure));
      return data;
    },
    onSuccess: async (updated) => {
      // A code given by name follows the rename; one given by id stays valid.
      if (
        appId !== undefined &&
        app !== undefined &&
        app !== null &&
        appId === app.app &&
        updated.app !== undefined &&
        updated.app !== app.app
      ) {
        setRenamed({ from: requestedId ?? "", to: updated.app });
        onRenamed?.(updated.app);
      }
      // The code shows on the nodes and services of the app.
      await Promise.all(
        [["app"], ["apps"], ["node"], ["nodes"], ["service"], ["services"]].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      );
    },
  });
  const candidates = useAppTeamCandidates(editable);
  const teamsChanged = useAppTeamsChanged();
  const { outcome, busy, change, dismiss } = useChanges(async () => {
    if (appId !== undefined) await teamsChanged(appId);
  });

  // The links of the application code go too: responsibles and publications.
  const remove = useMutation({
    mutationFn: async () => {
      const { error: failure } = await api.DELETE("/apps/{app_id}", {
        params: { path: { app_id: appId ?? "" } },
      });
      if (failure !== undefined) throw new Error(problemText(failure));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["apps"] });
      onClose();
    },
  });

  return (
    <DetailPanel
      kind="app"
      recordId={appId}
      open={appId !== undefined}
      title={app?.app ?? (label === "" ? t("apps.detail.title") : label)}
      onClose={onClose}
      groups={groups(editable)}
      row={app}
      onSave={editable ? (changes) => save.mutateAsync(changes).then(() => undefined) : undefined}
      editHint={editable ? t("apps.detail.editHint") : ""}
      options={{ teams: (candidates.data ?? []).map((g) => g.role) }}
      labelPrefix="apps.fields"
      groupPrefix="apps.detail.groups"
      isPending={isPending}
      errorMessage={isError ? error.message : null}
      actions={
        <>
          <div className="mb-4 space-y-3">
            <ChangeOutcomeLine outcome={outcome} onDismiss={dismiss} />
            {teams.isError && (
              <p role="alert" className="text-state-down">
                ■ {teams.error.message}
              </p>
            )}
            <TeamsPart
              teams={{
                responsibles: (teams.data?.responsibles ?? []).map((g) => g.role),
                publications: (teams.data?.publications ?? []).map((g) => g.role),
              }}
              groups={
                candidates.data ?? [
                  ...(teams.data?.responsibles ?? []),
                  ...(teams.data?.publications ?? []),
                ]
              }
              editable={editable}
              busy={busy}
              onAdd={(role, group, list) => {
                const params = { path: { app_id: appId ?? "", group_id: String(group.id) } };
                void change(t("compEditor.teamAdded", { team: group.role, list }), () =>
                  role === "responsibles"
                    ? api.POST("/apps/{app_id}/responsibles/{group_id}", { params })
                    : api.POST("/apps/{app_id}/publications/{group_id}", { params }),
                );
              }}
              onRemove={(role, team, groupId, list) => {
                const params = { path: { app_id: appId ?? "", group_id: groupId } };
                void change(t("compEditor.teamRemoved", { team, list }), () =>
                  role === "responsibles"
                    ? api.DELETE("/apps/{app_id}/responsibles/{group_id}", { params })
                    : api.DELETE("/apps/{app_id}/publications/{group_id}", { params }),
                );
              }}
            />
            {editable && <p className="text-ink-muted">{t("apps.detail.teamsHint")}</p>}
          </div>
          {editable && (
            <ConfirmButton
              icon={<TrashIcon />}
              label={t("detail.delete")}
              question={t("apps.delete.question", { app: app?.app ?? "" })}
              confirmLabel={t("detail.deleteConfirm")}
              cancelLabel={t("detail.cancel")}
              pendingLabel={t("detail.deleting")}
              pending={remove.isPending}
              onConfirm={() => {
                remove.mutate();
              }}
            />
          )}
          {remove.isError && (
            <p role="alert" className="mt-2 text-state-down">
              ■ {remove.error.message}
            </p>
          )}
        </>
      }
    />
  );
}
