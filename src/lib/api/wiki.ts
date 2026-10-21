import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { components } from "./schema";
import { api } from "./client";
import { problemText } from "./problem";

export type WikiPage = components["schemas"]["WikiPage"];
export type WikiRevision = components["schemas"]["WikiRevision"];

/** What a wiki page holds the notes of: a node or a service, by its id. */
export type WikiKind = "node" | "service";

/** The revisions listed under the notes; the page says how many there are in all. */
const REVISIONS_LIMIT = 50;

/** An error of a save over a revision that is no longer the latest one. */
export class WikiConflictError extends Error {}

const wikiKey = (kind: WikiKind, id: string | undefined) => ["wiki", kind, id];

/**
 * The notes of a node or a service (`GET /nodes/{node_id}/wiki`,
 * `/services/{svc_id}/wiki`): the latest revision, the list of the revisions,
 * and whether the user may save one.
 */
export function useWiki(kind: WikiKind, id: string | undefined) {
  return useQuery({
    queryKey: wikiKey(kind, id),
    enabled: id !== undefined,
    queryFn: async ({ signal }): Promise<WikiPage> => {
      const query = { limit: REVISIONS_LIMIT };
      const { data, error } =
        kind === "node"
          ? await api.GET("/nodes/{node_id}/wiki", {
              signal,
              params: { path: { node_id: id ?? "" }, query },
            })
          : await api.GET("/services/{svc_id}/wiki", {
              signal,
              params: { path: { svc_id: id ?? "" }, query },
            });
      if (error !== undefined) throw new Error(problemText(error));
      return data;
    },
  });
}

/** A past revision of the notes, with its body; none while `revisionId` is undefined. */
export function useWikiRevision(kind: WikiKind, id: string, revisionId: number | undefined) {
  return useQuery({
    queryKey: [...wikiKey(kind, id), revisionId],
    enabled: revisionId !== undefined,
    // A revision never changes once saved.
    staleTime: Infinity,
    queryFn: async ({ signal }): Promise<WikiRevision> => {
      const revision_id = revisionId ?? 0;
      const { data, error } =
        kind === "node"
          ? await api.GET("/nodes/{node_id}/wiki/{revision_id}", {
              signal,
              params: { path: { node_id: id, revision_id } },
            })
          : await api.GET("/services/{svc_id}/wiki/{revision_id}", {
              signal,
              params: { path: { svc_id: id, revision_id } },
            });
      if (error !== undefined) throw new Error(problemText(error));
      return data;
    },
  });
}

export interface WikiSave {
  body: string;
  changeNote: string;
  /** The revision edited, 0 for a page without any. */
  baseId: number;
}

/**
 * Saves a revision of the notes. A save over a revision that someone else's
 * has followed meanwhile fails with a WikiConflictError, and saves nothing.
 */
export function useSaveWiki(kind: WikiKind, id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ body, changeNote, baseId }: WikiSave): Promise<WikiRevision> => {
      const input = { body, change_note: changeNote, base_id: baseId };
      const { data, error, response } =
        kind === "node"
          ? await api.POST("/nodes/{node_id}/wiki", {
              params: { path: { node_id: id } },
              body: input,
            })
          : await api.POST("/services/{svc_id}/wiki", {
              params: { path: { svc_id: id } },
              body: input,
            });
      if (error !== undefined) {
        if (response.status === 409) throw new WikiConflictError(problemText(error));
        throw new Error(problemText(error));
      }
      return data;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: wikiKey(kind, id) }),
  });
}
