import { useQuery } from "@tanstack/react-query";
import type { components } from "@/lib/api/schema";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";
import { useImpersonation } from "@/lib/api/impersonation";

export type StoredFormRow = components["schemas"]["StoredFormRow"];
export type WorkflowRow = components["schemas"]["WorkflowRow"];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * The forms a step can be followed by: the `NextForms` of the workflow output of
 * the form it was submitted with, as `get_workflow_output()` of the historical
 * `requests.js` reads them. Empty when the step ends its request.
 */
export function nextForms(definition: unknown): string[] {
  if (!isRecord(definition) || !Array.isArray(definition.Outputs)) return [];
  const output = definition.Outputs.find(
    (entry): entry is Record<string, unknown> => isRecord(entry) && entry.Dest === "workflow",
  );
  if (output === undefined || !Array.isArray(output.NextForms)) return [];
  return output.NextForms.filter((name): name is string => typeof name === "string");
}

/** The label of a stored step, from the form revision it was submitted with. */
export function stepLabel(step: StoredFormRow): string {
  const definition = step.form_definition;
  const label =
    isRecord(definition) && typeof definition.Label === "string" ? definition.Label : "";
  return label !== "" ? label : (step.form_name ?? "");
}

/**
 * Whether a step awaits the user: assigned to their full name or to one of their
 * groups, as the historical collector checks it before offering the next forms.
 * Names are compared trimmed: a user without first name is stored with a leading
 * space.
 */
export function isAssignedTo(
  assignee: string | null | undefined,
  user: { name: string; roles: ReadonlySet<string> },
): boolean {
  const who = (assignee ?? "").trim();
  if (who === "") return false;
  return who === user.name.trim() || user.roles.has(who);
}

/** The steps of a request, from its first one, in the order they were submitted. */
export function useRequestSteps(headId: number | undefined) {
  return useQuery({
    queryKey: ["workflow-steps", headId],
    enabled: headId !== undefined,
    queryFn: async () => {
      const { data, error } = await api.GET("/forms_store", {
        params: {
          query: {
            props:
              "id,form_name,form_definition,form_data,form_submitter,form_submit_date,form_assignee,form_next_id,form_prev_id,results_id",
            filter: [`form_head_id:${String(headId)}`],
            orderby: "id",
            limit: 0,
          },
        },
      });
      if (error !== undefined) throw new Error(problemText(error));
      return Array.isArray(data.data) ? data.data : [];
    },
  });
}

/** The request itself, by id. */
export function useRequest(id: string | undefined) {
  return useQuery({
    queryKey: ["workflow", id],
    enabled: id !== undefined,
    queryFn: async () => {
      const { data, error } = await api.GET("/workflows", {
        params: {
          query: {
            props:
              "id,form_head_id,form_name,status,steps,creator,create_date,last_assignee,last_update,last_form_id",
            filter: [`id:${id ?? ""}`],
          },
        },
      });
      if (error !== undefined) throw new Error(problemText(error));
      const rows: WorkflowRow[] = Array.isArray(data.data) ? data.data : [];
      return rows[0] ?? null;
    },
  });
}

/**
 * The roles of every group of the user the requests are made as, privilege
 * groups included: a step may be assigned to any of them. Follows the
 * impersonation, as the API does.
 */
export function useMyGroupRoles() {
  const actingAs = useImpersonation()?.userId ?? null;
  return useQuery({
    queryKey: ["user", "self", "group-roles", actingAs],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await api.GET("/users/{user_id}/groups", {
        params: { path: { user_id: "self" }, query: { props: "role", limit: 0 } },
      });
      if (error !== undefined) throw new Error(problemText(error));
      const rows = Array.isArray(data.data) ? (data.data as { role?: string }[]) : [];
      return new Set(rows.flatMap((row) => (row.role === undefined ? [] : [row.role])));
    },
  });
}

/** A form the user may submit, by name: its id and its definition, null when none. */
export function useSubmittableForm(name: string | null) {
  return useQuery({
    queryKey: ["form-submittable", name],
    enabled: name !== null,
    queryFn: async () => {
      const { data, error } = await api.GET("/forms", {
        params: {
          query: { props: "id,form_name,form_definition", filter: [`form_name:eq:${name ?? ""}`] },
        },
      });
      if (error !== undefined) throw new Error(problemText(error));
      const rows = Array.isArray(data.data) ? data.data : [];
      const row = rows[0];
      return row?.id === undefined ? null : { id: row.id, definition: row.form_definition };
    },
  });
}
