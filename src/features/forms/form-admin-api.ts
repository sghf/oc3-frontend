import { useQuery } from "@tanstack/react-query";
import type { components } from "@/lib/api/schema";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";

export type FormRevision = components["schemas"]["FormRevision"];

/** The groups a form is published to and those responsible for it, by role. */
export function useFormTeams(formId: string | undefined) {
  return useQuery({
    queryKey: ["form", formId, "teams"],
    enabled: formId !== undefined,
    queryFn: async () => {
      const path = { path: { form_id: Number(formId) }, query: { props: "id,role", limit: 0 } };
      const [publications, responsibles] = await Promise.all([
        api.GET("/forms/{form_id}/publications", { params: path }),
        api.GET("/forms/{form_id}/responsibles", { params: path }),
      ]);
      if (publications.error !== undefined) throw new Error(problemText(publications.error));
      if (responsibles.error !== undefined) throw new Error(problemText(responsibles.error));
      const roles = (data: { data?: unknown }) =>
        (Array.isArray(data.data) ? (data.data as { role?: string }[]) : [])
          .flatMap((row) => (row.role === undefined ? [] : [row.role]))
          .sort((a, b) => a.localeCompare(b));
      return {
        publications: roles(publications.data),
        responsibles: roles(responsibles.data),
      };
    },
  });
}

/** Whether one of the user's groups is responsible for the form, a Manager for all. */
export function useFormResponsible(formId: string | undefined) {
  return useQuery({
    queryKey: ["form", formId, "responsible"],
    enabled: formId !== undefined,
    queryFn: async () => {
      const { data, error } = await api.GET("/forms/{form_id}/am_i_responsible", {
        params: { path: { form_id: Number(formId) } },
      });
      if (error !== undefined) throw new Error(problemText(error));
      return data.data;
    },
  });
}

/** The revisions of the form definition, the newest first. */
export function useFormRevisions(formId: string | undefined) {
  return useQuery({
    queryKey: ["form", formId, "revisions"],
    enabled: formId !== undefined,
    queryFn: async () => {
      const { data, error } = await api.GET("/forms/{form_id}/revisions", {
        params: { path: { form_id: Number(formId) } },
      });
      if (error !== undefined) throw new Error(problemText(error));
      return data.data;
    },
  });
}

/**
 * The change a revision made, or with `other`, the differences from the
 * revision to `other`, as git prints them.
 */
export function useFormDiff(formId: string, cid: string | undefined, other?: string) {
  return useQuery({
    queryKey: ["form", formId, "diff", cid, other],
    enabled: cid !== undefined,
    queryFn: async () => {
      const { data, error } = await api.GET("/forms/{form_id}/diff/{cid}", {
        params: {
          path: { form_id: Number(formId), cid: cid ?? "" },
          query: other === undefined ? {} : { other },
        },
      });
      if (error !== undefined) throw new Error(problemText(error));
      return data.data;
    },
  });
}

/** Restores the definition of a revision, recorded as a new revision. */
export async function rollbackForm(formId: string, cid: string): Promise<void> {
  const { error } = await api.POST("/forms/{form_id}/rollback/{cid}", {
    params: { path: { form_id: Number(formId), cid } },
  });
  if (error !== undefined) throw new Error(problemText(error));
}

/**
 * Who made a revision and, for a rollback, what it restored: `content` reads
 * "Author: Name <email>", then "<br>" and the line of the commit message
 * ("rollback to <date>"), as the historical history does.
 */
export function revisionAuthor(revision: FormRevision): { author: string; note: string } {
  const [first = "", ...rest] = (revision.content ?? "").split("<br>");
  return {
    author: first
      .replace(/^Author:\s*/, "")
      .replace(/\s*<[^>]*>\s*$/, "")
      .trim(),
    note: rest.join(" ").trim(),
  };
}
