import { useTranslation } from "react-i18next";
import { DetailPanel, type DetailGroup } from "@/components/opensvc/DetailPanel";
import { formatDateTime } from "@/lib/format";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";
import { hasPrivilege, useEffectivePrivileges } from "@/lib/api/effective-privileges";
import { CrossLink } from "@/components/opensvc/CrossLink";
import type { TagRow } from "./tag-row";
import { tagFormName } from "./tag-form";
import { TagDataField } from "./TagDataField";
import { useTagAttachments } from "./use-tag-attachments";

/**
 * Detail of a tag: its identity, its data, laid out by its form when the tag is
 * form-based (`<form>::<name>`) and edited by a TagManager, and the nodes and
 * services carrying it, each with the data of its attachment, as the historical tag
 * tab and tag attachments table.
 */
const GROUPS: DetailGroup<TagRow>[] = [
  {
    key: "identity",
    family: "team",
    fields: [
      { prop: "tag_name", format: (row) => row.tag_name },
      { prop: "tag_exclude", format: (row) => row.tag_exclude },
      { prop: "tag_id", format: (row) => row.tag_id },
      {
        prop: "tag_created",
        format: (row, locale) => formatDateTime(row.tag_created, locale),
      },
    ],
  },
];

/**
 * `open`, `isPending` and `errorMessage` serve the panel history, which opens a tag by
 * its id before its row is known; the Tags list passes the row it already holds.
 */
export function TagDetailPanel({
  tag,
  onClose,
  open = tag !== undefined && tag !== null,
  isPending = false,
  errorMessage = null,
}: {
  tag: TagRow | null | undefined;
  onClose: () => void;
  open?: boolean;
  isPending?: boolean;
  errorMessage?: string | null;
}) {
  const { t } = useTranslation();
  return (
    <DetailPanel
      kind="tag"
      recordId={tag?.tag_id}
      open={open}
      title={tag?.tag_name ?? t("tags.detail.title")}
      onClose={onClose}
      groups={GROUPS}
      row={tag ?? null}
      labelPrefix="tags.fields"
      groupPrefix="tags.detail.groups"
      isPending={isPending}
      errorMessage={errorMessage}
      after={tag === undefined || tag === null ? undefined : <TagDataSections tag={tag} />}
    />
  );
}

/**
 * The data of the tag, then its attachments. The shared data is changed here only,
 * where everything it serves is listed; the data of an attachment, in the panel of
 * its node or service.
 */
function TagDataSections({ tag }: { tag: TagRow }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const privileges = useEffectivePrivileges();
  const canEdit = privileges.data !== undefined && hasPrivilege(privileges.data, ["TagManager"]);
  const formName = tagFormName(tag.tag_name);
  const nodes = useTagAttachments(tag.tag_id, "nodes");
  const services = useTagAttachments(tag.tag_id, "services");

  async function saveTagData(text: string): Promise<string | null> {
    const { error } = await api.POST("/tags/{tag_id}", {
      params: { path: { tag_id: tag.tag_id } },
      body: { tag_data: text },
    });
    if (error !== undefined) return problemText(error);
    // The tag lists, and the tags of the nodes and services, show it too.
    await queryClient.invalidateQueries({
      predicate: (query) => query.queryKey[0] === "tags" || query.queryKey[2] === "tags",
    });
    return null;
  }

  return (
    <div className="mt-4 flex flex-col gap-4">
      <section>
        <h3 className="mb-1 font-semibold">{t("tags.data.title")}</h3>
        {formName !== null && (
          <p className="mb-2 text-ink-muted">{t("tags.data.formBased", { form: formName })}</p>
        )}
        <TagDataField
          formName={formName}
          value={tag.tag_data}
          onSave={canEdit ? saveTagData : undefined}
        />
      </section>
      {(["nodes", "services"] as const).map((kind) => {
        const list = kind === "nodes" ? nodes : services;
        return (
          <section key={kind}>
            <h3 className="mb-1 font-semibold">
              {t(`tags.attachments.${kind}`)}
              {list.data !== undefined && (
                <span className="ml-1 font-normal text-ink-muted">({list.data.length})</span>
              )}
            </h3>
            {list.isError ? (
              <p role="alert" className="text-state-down">
                ■ {list.error.message}
              </p>
            ) : list.isPending ? (
              <p className="text-ink-muted">{t("detail.loading")}</p>
            ) : list.data.length === 0 ? (
              <p className="text-ink-muted">{t(`tags.attachments.${kind}None`)}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {list.data.map((attachment) => (
                  <li key={attachment.id} className="flex flex-col gap-1">
                    <span>
                      <CrossLink kind={kind === "nodes" ? "node" : "service"} id={attachment.id}>
                        {attachment.name}
                      </CrossLink>
                    </span>
                    {(formName !== null || attachment.data !== "") && (
                      <TagDataField formName={formName} value={attachment.data} />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
