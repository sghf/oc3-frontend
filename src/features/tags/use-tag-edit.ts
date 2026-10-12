import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";
import type { TagEditControl } from "@/components/opensvc/ObjectTags";
import { toTagRows } from "./tag-row";

export type TagTargetKind = "node" | "service";

/**
 * Attaching and detaching the tags of a node or a service from its detail panel.
 *
 * The tags offered come from `GET /…/candidate_tags`, which leaves out those already
 * attached and those excluded by a tag already in place; the list is only requested
 * when the picker opens. Attaching goes through `POST /tags/nodes` and
 * `/tags/services`, which accept the char(36) `tag_id` the lists return, unlike
 * `/tags/{tag_id}/…` which expects the integer id (see notes.md); detaching, through
 * `DELETE` on the same routes. As in the old collector, these actions are only
 * offered to whoever is responsible for the object (`am_i_responsible`); the
 * compatibility of exclusions stays checked by the API, whose refusal is shown as it
 * is.
 */
export function useTagEdit(kind: TagTargetKind, objectId: string | undefined): TagEditControl {
  const queryClient = useQueryClient();
  // Tied to the object rather than a plain boolean: moving to another node closes the
  // picker without a side effect.
  const [pickingFor, setPickingFor] = useState<string | undefined>(undefined);
  const picking = objectId !== undefined && pickingFor === objectId;
  // Same precaution for the confirmation: a question left open must not detach the
  // tag of another object.
  const [confirming, setConfirming] = useState<{ objectId: string; tagId: string } | null>(null);

  // 200 when the user is responsible, 403 otherwise: only the status matters.
  const responsible = useQuery({
    queryKey: [kind, objectId, "am_i_responsible"],
    enabled: objectId !== undefined,
    queryFn: async () => {
      const { error, response } =
        kind === "node"
          ? await api.GET("/nodes/{node_id}/am_i_responsible", {
              params: { path: { node_id: objectId ?? "" } },
            })
          : await api.GET("/services/{svc_id}/am_i_responsible", {
              params: { path: { svc_id: objectId ?? "" } },
            });
      if (response.status === 403) return false;
      if (error !== undefined) throw new Error(problemText(error));
      return true;
    },
  });

  const candidates = useQuery({
    queryKey: [kind, objectId, "candidate_tags"],
    enabled: picking,
    queryFn: async () => {
      const query = { orderby: "tag_name", limit: 0 };
      const { data, error } =
        kind === "node"
          ? await api.GET("/nodes/{node_id}/candidate_tags", {
              params: { path: { node_id: objectId ?? "" }, query },
            })
          : await api.GET("/services/{svc_id}/candidate_tags", {
              params: { path: { svc_id: objectId ?? "" }, query },
            });
      if (error !== undefined) throw new Error(problemText(error));
      return toTagRows(data.data);
    },
  });

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: [kind, objectId, "tags"] }),
      queryClient.invalidateQueries({ queryKey: [kind, objectId, "candidate_tags"] }),
      queryClient.invalidateQueries({ queryKey: ["tags"] }),
    ]);

  const attach = useMutation({
    mutationFn: async (tagId: string) => {
      const { error } =
        kind === "node"
          ? await api.POST("/tags/nodes", { body: { tag_id: tagId, node_id: objectId ?? "" } })
          : await api.POST("/tags/services", { body: { tag_id: tagId, svc_id: objectId ?? "" } });
      if (error !== undefined) throw new Error(problemText(error));
    },
    onSuccess: invalidate,
  });

  const saveAttachData = useMutation({
    mutationFn: async ({ tagId, text }: { tagId: string; text: string }) => {
      // Posted again with its data, an attached tag keeps its attachment and
      // takes the new data.
      const { error } =
        kind === "node"
          ? await api.POST("/tags/nodes", {
              body: { tag_id: tagId, node_id: objectId ?? "", tag_attach_data: text },
            })
          : await api.POST("/tags/services", {
              body: { tag_id: tagId, svc_id: objectId ?? "", tag_attach_data: text },
            });
      return error === undefined ? null : problemText(error);
    },
    onSuccess: async (refused) => {
      if (refused === null) await invalidate();
    },
  });

  const detach = useMutation({
    mutationFn: async (tagId: string) => {
      const { error } =
        kind === "node"
          ? await api.DELETE("/tags/nodes", { body: { tag_id: tagId, node_id: objectId ?? "" } })
          : await api.DELETE("/tags/services", { body: { tag_id: tagId, svc_id: objectId ?? "" } });
      if (error !== undefined) throw new Error(problemText(error));
    },
    onSuccess: invalidate,
  });

  return {
    allowed: responsible.data === true,
    picking,
    setPicking: (next) => {
      attach.reset();
      setPickingFor(next ? objectId : undefined);
    },
    candidates: candidates.data,
    candidatesPending: candidates.isPending,
    candidatesError: candidates.isError ? candidates.error.message : null,
    attach: (tagId) => {
      attach.mutate(tagId);
    },
    attaching: attach.isPending,
    attachError: attach.isError ? attach.error.message : null,
    confirmingDetach:
      confirming !== null && confirming.objectId === objectId ? confirming.tagId : null,
    askDetach: (tagId) => {
      detach.reset();
      setConfirming(tagId === null || objectId === undefined ? null : { objectId, tagId });
    },
    detach: (tagId) => {
      setConfirming(null);
      detach.mutate(tagId);
    },
    detaching: detach.isPending ? (detach.variables ?? null) : null,
    detachError: detach.isError ? detach.error.message : null,
    justAttached: attach.isSuccess ? (attach.variables ?? null) : null,
    saveAttachData: (tagId, text) => saveAttachData.mutateAsync({ tagId, text }),
  };
}
