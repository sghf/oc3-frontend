import { useTranslation } from "react-i18next";
import { DetailPanel, type DetailGroup } from "@/components/opensvc/DetailPanel";
import { formatDateTime } from "@/lib/format";
import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";
import { hasPrivilege, useEffectivePrivileges } from "@/lib/api/effective-privileges";
import { CrossLink } from "@/components/opensvc/CrossLink";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { TrashIcon } from "@/components/ui/icons";
import type { TagRow } from "./tag-row";
import { tagFormName } from "./tag-form";
import { TagDataField } from "./TagDataField";
import { useTagAttachments } from "./use-tag-attachments";

/**
 * Detail of a tag: its identity, its data, laid out by its form when the tag is
 * form-based (`<form>::<name>`), and the nodes and services carrying it, each with
 * the data of its attachment, as the historical tag tab and tag attachments table.
 * A TagManager renames the tag, changes its exclusion pattern and its data, and
 * deletes it.
 */
function groups(editable: boolean): DetailGroup<TagRow>[] {
  return [
    {
      key: "identity",
      family: "team",
      fields: [
        { prop: "tag_name", format: (row) => row.tag_name, editable },
        { prop: "tag_exclude", format: (row) => row.tag_exclude, editable },
        { prop: "tag_id", format: (row) => row.tag_id },
        {
          prop: "tag_created",
          format: (row) => formatDateTime(row.tag_created),
        },
      ],
    },
  ];
}

/** The tag lists, and the tags of the nodes and services, which show the tag too. */
function invalidateTags(queryClient: QueryClient) {
  return queryClient.invalidateQueries({
    predicate: (query) => query.queryKey[0] === "tags" || query.queryKey[2] === "tags",
  });
}

/** Whether the user may change tags: TagManager, or Manager. */
function useCanEditTags(): boolean {
  const privileges = useEffectivePrivileges();
  return privileges.data !== undefined && hasPrivilege(privileges.data, ["TagManager"]);
}

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
  const queryClient = useQueryClient();
  const canEdit = useCanEditTags();
  const tagId = tag?.tag_id ?? "";

  // The API trims the name and refuses an empty one, one carried by another tag
  // and an exclusion pattern that is not a regular expression; its reason is shown
  // under the field.
  const save = useMutation({
    mutationFn: async (changes: Record<string, string | number | boolean>) => {
      const body: { tag_name?: string; tag_exclude?: string } = {};
      if (typeof changes.tag_name === "string") body.tag_name = changes.tag_name;
      if (typeof changes.tag_exclude === "string") body.tag_exclude = changes.tag_exclude;
      const { error } = await api.POST("/tags/{tag_id}", {
        params: { path: { tag_id: tagId } },
        body,
      });
      if (error !== undefined) throw new Error(problemText(error));
    },
    onSuccess: () => invalidateTags(queryClient),
  });

  // Deleting a tag detaches it from every node and service.
  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await api.DELETE("/tags/{tag_id}", {
        params: { path: { tag_id: tagId } },
      });
      if (error !== undefined) throw new Error(problemText(error));
    },
    onSuccess: async () => {
      await invalidateTags(queryClient);
      onClose();
    },
  });

  return (
    <DetailPanel
      kind="tag"
      recordId={tag?.tag_id}
      open={open}
      title={tag?.tag_name ?? t("tags.detail.title")}
      onClose={onClose}
      groups={groups(canEdit)}
      row={tag ?? null}
      onSave={
        canEdit && tag !== undefined && tag !== null
          ? (changes) => save.mutateAsync(changes)
          : undefined
      }
      editHint={t("tags.detail.editHint")}
      actions={
        canEdit && tag !== undefined && tag !== null ? (
          <>
            <ConfirmButton
              icon={<TrashIcon />}
              label={t("detail.delete")}
              question={t("tags.detail.deleteQuestion", { name: tag.tag_name })}
              confirmLabel={t("tags.actions.data.delete.confirm_one")}
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
          </>
        ) : undefined
      }
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
  const canEdit = useCanEditTags();
  const formName = tagFormName(tag.tag_name);
  const nodes = useTagAttachments(tag.tag_id, "nodes");
  const services = useTagAttachments(tag.tag_id, "services");

  async function saveTagData(text: string): Promise<string | null> {
    const { error } = await api.POST("/tags/{tag_id}", {
      params: { path: { tag_id: tag.tag_id } },
      body: { tag_data: text },
    });
    if (error !== undefined) return problemText(error);
    await invalidateTags(queryClient);
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
