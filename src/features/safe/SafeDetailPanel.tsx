import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";
import { DetailContent, type DetailGroup } from "@/components/opensvc/DetailPanel";
import { RelatedTabsPanel } from "@/components/opensvc/RelatedTabsPanel";
import type { RelatedTab } from "@/components/opensvc/related-tabs";
import { CrossLink } from "@/components/opensvc/CrossLink";
import { TeamsPart, type TeamRole } from "@/components/opensvc/CompEditorParts";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { DateTime } from "@/components/ui/DateTime";
import { DownloadIcon, FileIcon, HistoryIcon, TrashIcon } from "@/components/ui/icons";
import { formatDateTime } from "@/lib/format";
import { useComplianceGroups } from "@/features/designer/use-designer-data";
import { EncryptionMark } from "./EncryptionMark";
import { SafeUploadForm } from "./SafeUploadPanel";
import {
  downloadName,
  downloadSafeFile,
  formatBytes,
  useSafeFile,
  useSafeHistory,
  useSafePreview,
  useSafeResponsible,
  useSafeUsage,
  type SafeFileRow,
} from "./use-safe";

const text = (prop: keyof SafeFileRow) => (row: SafeFileRow) => {
  const value = row[prop];
  return value === undefined || value === null || value === "" ? undefined : String(value);
};

const mono = (prop: keyof SafeFileRow) => (row: SafeFileRow) => {
  const value = text(prop)(row);
  return value === undefined ? null : (
    <span className="font-mono text-data break-all">{value}</span>
  );
};

const GROUPS: DetailGroup<SafeFileRow>[] = [
  {
    key: "file",
    family: "safe",
    fields: [
      // Renamed in place: the content stays, and so do its safe:// references.
      { prop: "name", format: text("name"), editable: true },
      {
        prop: "size",
        format: (row, locale) =>
          row.size === undefined ? undefined : formatBytes(row.size, locale),
      },
      {
        prop: "encrypted",
        format: (row) => (row.encrypted === undefined ? undefined : String(row.encrypted)),
        render: (row) => <EncryptionMark encrypted={row.encrypted === true} />,
      },
      { prop: "uuid", format: text("uuid"), render: mono("uuid") },
      { prop: "md5", format: text("md5"), render: mono("md5") },
      { prop: "sha256", format: text("sha256"), render: mono("sha256") },
    ],
  },
  {
    key: "record",
    family: "time",
    fields: [
      { prop: "uploader_name", format: text("uploader_name") },
      { prop: "uploaded_from", format: text("uploaded_from") },
      { prop: "uploaded_date", format: (row, locale) => formatDateTime(row.uploaded_date, locale) },
      { prop: "id", format: text("id") },
    ],
  },
];

/** Splits the comma-separated roles of a list row into the teams of TeamsPart. */
function roles(value: string | null | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((role) => role.trim())
    .filter((role) => role !== "");
}

/** The text of a file, decrypted by the API; each opening is written to the audit log. */
function SafeContent({ fileId }: { fileId: string }) {
  const { t } = useTranslation();
  const preview = useSafePreview(fileId, true);
  if (preview.isPending) return <p className="text-ink-muted">{t("detail.loading")}</p>;
  if (preview.isError)
    return (
      <p role="alert" className="text-state-down">
        ■ {preview.error.message}
      </p>
    );
  if (preview.data === null) return <p className="text-ink-muted">{t("safe.content.notText")}</p>;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-ink-muted">{t("safe.content.audited")}</p>
      <pre className="max-h-[60vh] overflow-auto rounded-(--radius-control) border border-line bg-surface-sunken p-2 font-mono text-data whitespace-pre-wrap">
        {preview.data}
      </pre>
    </div>
  );
}

/** A button saving a version under the name of its uploaded file. */
function DownloadButton({ row, label }: { row: SafeFileRow; label?: string }) {
  const { t } = useTranslation();
  const download = useMutation({
    mutationFn: () => downloadSafeFile(String(row.id), downloadName(row)),
  });
  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        disabled={download.isPending || row.id === undefined || (row.uuid ?? "") === ""}
        onClick={() => {
          download.mutate();
        }}
        className="flex h-8 items-center gap-1.5 rounded-(--radius-control) border border-line px-3 text-ink hover:bg-surface-sunken disabled:opacity-60"
      >
        <DownloadIcon className="h-3.5 w-3.5" />
        {label ?? t("safe.actions.download")}
      </button>
      {download.isError && (
        <span role="alert" className="mt-1 text-state-down">
          ■ {download.error.message}
        </span>
      )}
    </span>
  );
}

/** The previous versions of a file, each downloadable. */
function SafeHistory({ fileId }: { fileId: string }) {
  const { t, i18n } = useTranslation();
  const history = useSafeHistory(fileId);
  if (history.isPending) return <p className="text-ink-muted">{t("detail.loading")}</p>;
  if (history.isError)
    return (
      <p role="alert" className="text-state-down">
        ■ {history.error.message}
      </p>
    );
  if (history.data.length === 0) return <p className="text-ink-muted">{t("safe.history.empty")}</p>;
  return (
    <table className="w-full text-left">
      <thead className="text-ink-muted">
        <tr>
          <th className="py-1 pr-3 font-medium">{t("safe.fields.uploaded_date")}</th>
          <th className="py-1 pr-3 font-medium">{t("safe.fields.uploader_name")}</th>
          <th className="py-1 pr-3 text-right font-medium">{t("safe.fields.size")}</th>
          <th className="py-1 pr-3 font-medium">{t("safe.fields.md5")}</th>
          <th className="py-1 pr-3 font-medium">{t("safe.fields.encrypted")}</th>
          <th className="py-1 font-medium">
            <span className="sr-only">{t("safe.actions.download")}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {history.data.map((row) => (
          <tr key={row.id} className="border-t border-line">
            <td className="py-1 pr-3">
              <DateTime value={row.uploaded_date} locale={i18n.language} />
            </td>
            <td className="py-1 pr-3">{row.uploader_name}</td>
            <td className="py-1 pr-3 text-right">{formatBytes(row.size, i18n.language)}</td>
            <td className="py-1 pr-3 font-mono text-data">{row.md5}</td>
            <td className="py-1 pr-3">
              <EncryptionMark encrypted={row.encrypted === true} />
            </td>
            <td className="py-1">
              <DownloadButton row={row} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const SAFE_TABS: RelatedTab[] = [
  {
    key: "content",
    labelKey: "safe.content.tab",
    icon: <FileIcon className="h-3.5 w-3.5 text-icon-form" />,
    // No count: a content is not a list. Read only when the tab opens, as every
    // read of the content is audited.
    useSummary: () => ({ count: undefined }),
    render: (id) => <SafeContent fileId={id} />,
  },
  {
    key: "history",
    labelKey: "safe.history.tab",
    icon: <HistoryIcon className="h-3.5 w-3.5 text-ink-muted" />,
    useSummary: (id) => {
      const history = useSafeHistory(id);
      return { count: history.data?.length };
    },
    render: (id) => <SafeHistory fileId={id} />,
  },
];

/** Where a file is referenced: the services and the ruleset variables naming it. */
function SafeUsage({ fileId }: { fileId: string }) {
  const { t } = useTranslation();
  const usage = useSafeUsage(fileId);
  return (
    <section className="mt-4">
      <h3 className="mb-1 font-semibold text-ink-muted">{t("safe.usage.title")}</h3>
      {usage.isPending ? (
        <p className="text-ink-muted">{t("detail.loading")}</p>
      ) : usage.isError ? (
        <p role="alert" className="text-state-down">
          ■ {usage.error.message}
        </p>
      ) : usage.data.services.length === 0 && usage.data.variables.length === 0 ? (
        <p className="text-ink-muted">{t("safe.usage.none")}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {usage.data.services.map((s) => (
            <li key={`svc-${s.svc_id}`} className="flex items-center gap-2">
              <span className="text-ink-muted">{t("safe.usage.service")}</span>
              <CrossLink kind="service" id={s.svc_id}>
                {s.svcname}
              </CrossLink>
            </li>
          ))}
          {usage.data.variables.map((v) => (
            <li key={`var-${v.id}`} className="flex flex-wrap items-center gap-2">
              <span className="text-ink-muted">{t("safe.usage.variable")}</span>
              <span className="font-mono">{v.var_name}</span>
              <CrossLink kind="ruleset" id={String(v.ruleset_id)}>
                {v.ruleset_name}
              </CrossLink>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * A file of the safe: its properties, its teams and where it is referenced, then
 * its content and its previous versions, one tab each, as the historical safe file
 * tabs. Its responsibles (and its uploader, and a Manager) rename it, upload a new
 * version, change its teams and delete it; the others read it. Downloads and
 * previews are written to the audit log.
 */
export function SafeDetailPanel({
  fileId,
  label,
  tab,
  onTabChange,
  onClose,
}: {
  fileId: string | undefined;
  label: string;
  tab: string | undefined;
  onTabChange: (tab: string | undefined) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: file, isPending, isError, error } = useSafeFile(fileId);
  const responsible = useSafeResponsible(fileId);
  const editable = responsible.data === true;
  const groups = useComplianceGroups();
  const [newVersion, setNewVersion] = useState(false);
  const [teamError, setTeamError] = useState<string | null>(null);
  const path = { path: { file_id: fileId ?? "" } };

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["safe"] });
  };

  const remove = useMutation({
    mutationFn: async () => {
      const { error: failure } = await api.DELETE("/safe/{file_id}", { params: path });
      if (failure !== undefined) throw new Error(problemText(failure));
    },
    onSuccess: async () => {
      onClose();
      // The queries of the file deleted would answer 404: dropped, not refreshed.
      for (const key of ["file", "history", "usage", "responsible", "preview"])
        queryClient.removeQueries({ queryKey: ["safe", key, fileId] });
      await queryClient.invalidateQueries({ queryKey: ["safe", "list"] });
    },
  });

  const teams = useMutation({
    mutationFn: async ({ role, group, add }: { role: TeamRole; group: string; add: boolean }) => {
      const params = { path: { file_id: fileId ?? "", group } };
      const { error: failure } =
        role === "responsibles"
          ? add
            ? await api.POST("/safe/{file_id}/responsibles/{group}", { params })
            : await api.DELETE("/safe/{file_id}/responsibles/{group}", { params })
          : add
            ? await api.POST("/safe/{file_id}/publications/{group}", { params })
            : await api.DELETE("/safe/{file_id}/publications/{group}", { params });
      if (failure !== undefined) throw new Error(problemText(failure));
    },
    onMutate: () => {
      setTeamError(null);
    },
    onError: (failure) => {
      setTeamError(failure.message);
    },
    onSettled: refresh,
  });

  const open = fileId !== undefined;
  const title =
    file?.name !== undefined && file.name !== ""
      ? file.name
      : label === ""
        ? t("safe.detail.title")
        : label;

  return (
    <RelatedTabsPanel
      open={open}
      title={title}
      kind="safe"
      onClose={() => {
        setNewVersion(false);
        onClose();
      }}
      objectId={fileId}
      tabs={SAFE_TABS}
      tab={tab}
      onTabChange={onTabChange}
      propertiesFamily="safe"
      label={t("safe.detail.tabs")}
    >
      <DetailContent
        groups={GROUPS}
        row={file}
        labelPrefix="safe.fields"
        groupPrefix="safe.detail.groups"
        isPending={open && isPending}
        errorMessage={isError ? error.message : file === null ? t("safe.detail.notFound") : null}
        editHint=""
        onSave={
          editable
            ? async (changes) => {
                const name = changes.name;
                if (typeof name !== "string") return;
                const { error: failure } = await api.POST("/safe/{file_id}", {
                  params: path,
                  body: { name },
                });
                if (failure !== undefined) throw new Error(problemText(failure));
                await refresh();
              }
            : undefined
        }
        actions={
          file === null || file === undefined ? undefined : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-start gap-2">
                <DownloadButton row={file} />
                {editable && !newVersion && (
                  <button
                    type="button"
                    onClick={() => {
                      setNewVersion(true);
                    }}
                    className="h-8 rounded-(--radius-control) border border-line px-3 text-ink hover:bg-surface-sunken"
                  >
                    {t("safe.actions.newVersion")}
                  </button>
                )}
                {editable && (
                  <div>
                    <ConfirmButton
                      icon={<TrashIcon />}
                      label={t("detail.delete")}
                      question={t("safe.delete.question", { name: title })}
                      confirmLabel={t("detail.deleteConfirm")}
                      cancelLabel={t("detail.cancel")}
                      pendingLabel={t("detail.deleting")}
                      pending={remove.isPending}
                      onConfirm={() => {
                        remove.mutate();
                      }}
                    />
                    {remove.isError && (
                      <p role="alert" className="mt-2 text-state-down">
                        ■ {remove.error.message}
                      </p>
                    )}
                  </div>
                )}
              </div>
              {editable && newVersion && fileId !== undefined && (
                <div className="rounded-(--radius-control) border border-accent p-3">
                  <p className="mb-2 text-ink-muted">{t("safe.upload.versionIntro")}</p>
                  <SafeUploadForm
                    fileId={fileId}
                    currentName={file.name}
                    onUploaded={() => {
                      setNewVersion(false);
                    }}
                    onCancel={() => {
                      setNewVersion(false);
                    }}
                  />
                </div>
              )}
              <TeamsPart
                teams={{
                  responsibles: roles(file.safe_team_responsible),
                  publications: roles(file.safe_team_publication),
                }}
                groups={groups.data ?? []}
                editable={editable}
                busy={teams.isPending}
                onAdd={(role, group) => {
                  teams.mutate({ role, group: String(group.id), add: true });
                }}
                onRemove={(role, _team, groupId) => {
                  teams.mutate({ role, group: groupId, add: false });
                }}
              />
              {teamError !== null && (
                <p role="alert" className="text-state-down">
                  ■ {teamError}
                </p>
              )}
              {fileId !== undefined && <SafeUsage fileId={fileId} />}
            </div>
          )
        }
      />
    </RelatedTabsPanel>
  );
}
