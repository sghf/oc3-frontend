import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ComboboxOption } from "@/components/ui/Combobox";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";
import type { components } from "@/lib/api/schema";

export type Orchestration = components["schemas"]["Orchestration"];
export type OrchestrationInput = components["schemas"]["OrchestrationInput"];
export type OrchestrationStep = components["schemas"]["OrchestrationStep"];
export type TargetKind = components["schemas"]["OrchestrationTargetKind"];
export type CheckStep = components["schemas"]["OrchestrationCheckStep"];
export type Run = components["schemas"]["OrchestrationRun"];
export type RunStep = components["schemas"]["OrchestrationRunStep"];
export type RunTarget = components["schemas"]["OrchestrationRunTarget"];
export type RunStatus = components["schemas"]["OrchestrationRunStatus"];
export type RunStepStatus = components["schemas"]["OrchestrationRunStepStatus"];
export type RunTargetStatus = components["schemas"]["OrchestrationRunTargetStatus"];

export const TARGET_KINDS: readonly TargetKind[] = ["service", "instance", "node", "cluster"];

/**
 * The actions the action queue accepts on each kind of target, as PUT /actions
 * lists them, in the order of the historical action menu.
 */
export const KIND_ACTIONS: Record<TargetKind, readonly string[]> = {
  service: [
    "start",
    "stop",
    "freeze",
    "thaw",
    "switch",
    "giveback",
    "abort",
    "clear",
    "push resinfo",
    "push config",
  ],
  instance: [
    "start",
    "stop",
    "restart",
    "freeze",
    "thaw",
    "takeover",
    "switch",
    "giveback",
    "abort",
    "clear",
    "enable",
    "disable",
    "syncall",
    "syncnodes",
    "syncdrp",
    "compliance_check",
    "compliance_fix",
    "push resinfo",
    "push config",
  ],
  node: [
    "pushasset",
    "pushdisks",
    "pushpkg",
    "pushpatch",
    "pushstats",
    "checks",
    "sysreport",
    "updatecomp",
    "updatepkg",
    "scanscsi",
    "compliance_check",
    "compliance_fix",
    "freeze",
    "thaw",
    "drain",
    "schedule_reboot",
    "unschedule_reboot",
    "reboot",
    "shutdown",
  ],
  cluster: ["freeze", "thaw", "abort"],
};

/** The actions that interrupt what runs: the run asks for the name to be typed. */
export const DESTRUCTIVE_ACTIONS = new Set(["stop", "reboot", "shutdown", "drain", "disable"]);

async function fail(error: unknown): Promise<never> {
  throw new Error(problemText(error));
}

export function useOrchestrations() {
  return useQuery({
    queryKey: ["orchestrations"],
    queryFn: async () => {
      const { data, error } = await api.GET("/orchestrations");
      if (error !== undefined) return fail(error);
      return data.data;
    },
  });
}

export function useOrchestration(id: number | undefined) {
  return useQuery({
    queryKey: ["orchestration", id],
    enabled: id !== undefined,
    queryFn: async () => {
      const { data, error } = await api.GET("/orchestrations/{orchestration_id}", {
        params: { path: { orchestration_id: id ?? 0 } },
      });
      if (error !== undefined) return fail(error);
      return data;
    },
  });
}

/** Creates the orchestration (no id) or replaces it. */
export function useSaveOrchestration(id: number | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: OrchestrationInput) => {
      const { data, error } =
        id === undefined
          ? await api.POST("/orchestrations", { body })
          : await api.PUT("/orchestrations/{orchestration_id}", {
              params: { path: { orchestration_id: id } },
              body,
            });
      if (error !== undefined) return fail(error);
      return data;
    },
    onSuccess: async (saved) => {
      queryClient.setQueryData(["orchestration", saved.id], saved);
      await queryClient.invalidateQueries({ queryKey: ["orchestrations"] });
    },
  });
}

export function useDeleteOrchestration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await api.DELETE("/orchestrations/{orchestration_id}", {
        params: { path: { orchestration_id: id } },
      });
      if (error !== undefined) return fail(error);
      return id;
    },
    onSuccess: async (id) => {
      queryClient.removeQueries({ queryKey: ["orchestration", id] });
      await queryClient.invalidateQueries({ queryKey: ["orchestrations"] });
    },
  });
}

/**
 * The targets of each step of a plan, saved or not, resolved now and checked as
 * the action queue would. Keyed by the plan: an edit checks it again, the result
 * of the previous plan shown meanwhile.
 */
export function useOrchestrationCheck(plan: OrchestrationInput, enabled: boolean) {
  return useQuery({
    queryKey: ["orchestration-check", JSON.stringify(plan.steps)],
    enabled: enabled && plan.steps.length > 0,
    placeholderData: keepPreviousData,
    // A target may become reachable, or no longer be: checked again now and then.
    staleTime: 30_000,
    meta: { liveTables: [] },
    queryFn: async ({ signal }) => {
      const { data, error } = await api.POST("/orchestrations/check", {
        body: { name: plan.name === "" ? "-" : plan.name, steps: plan.steps },
        signal,
      });
      if (error !== undefined) return fail(error);
      return data.data;
    },
  });
}

export function useStartRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { data, error } = await api.POST("/orchestrations/{orchestration_id}/runs", {
        params: { path: { orchestration_id: id } },
      });
      if (error !== undefined) return fail(error);
      return data;
    },
    onSuccess: async (run) => {
      queryClient.setQueryData(["orchestration-run", run.id], run);
      await queryClient.invalidateQueries({ queryKey: ["orchestration-runs"] });
    },
  });
}

export function useRuns(orchestrationId?: number) {
  return useQuery({
    queryKey: ["orchestration-runs", orchestrationId ?? "all"],
    queryFn: async () => {
      const { data, error } = await api.GET("/orchestration_runs", {
        params: { query: { orchestration_id: orchestrationId, limit: 100 } },
      });
      if (error !== undefined) return fail(error);
      return data.data;
    },
  });
}

export function useRun(id: number) {
  return useQuery({
    queryKey: ["orchestration-run", id],
    queryFn: async () => {
      const { data, error } = await api.GET("/orchestration_runs/{run_id}", {
        params: { path: { run_id: id } },
      });
      if (error !== undefined) return fail(error);
      return data;
    },
    // Live events refresh it; polled as well while it runs, should they be missed.
    refetchInterval: (query) => (query.state.data?.status === "running" ? 5_000 : false),
  });
}

/** Stops or resumes a run. */
export function useRunCommand(id: number, command: "stop" | "resume") {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } =
        command === "stop"
          ? await api.POST("/orchestration_runs/{run_id}/stop", {
              params: { path: { run_id: id } },
            })
          : await api.POST("/orchestration_runs/{run_id}/resume", {
              params: { path: { run_id: id } },
            });
      if (error !== undefined) return fail(error);
      return data;
    },
    onSuccess: async (run) => {
      queryClient.setQueryData(["orchestration-run", id], run);
      await queryClient.invalidateQueries({ queryKey: ["orchestration-runs"] });
    },
  });
}

/**
 * The objects a step may pick, of one kind, for the editor's dropdown: every one
 * the user may see, read once. Enough for the estates seen so far; a search would
 * be needed past tens of thousands.
 */
export function useTargetOptions(kind: TargetKind, enabled: boolean) {
  return useQuery({
    queryKey: ["orchestration-target-options", kind],
    enabled,
    staleTime: 60_000,
    meta: { liveTables: [] },
    queryFn: async (): Promise<ComboboxOption[]> => {
      switch (kind) {
        case "service": {
          const { data, error } = await api.GET("/services", {
            params: { query: { props: "svc_id,svcname", orderby: "svcname", limit: 0 } },
          });
          if (error !== undefined) return fail(error);
          return (Array.isArray(data.data) ? data.data : []).flatMap((row) =>
            row.svc_id === undefined
              ? []
              : [{ value: row.svc_id, label: row.svcname ?? row.svc_id }],
          );
        }
        case "node": {
          const { data, error } = await api.GET("/nodes", {
            params: { query: { props: "node_id,nodename", orderby: "nodename", limit: 0 } },
          });
          if (error !== undefined) return fail(error);
          return (Array.isArray(data.data) ? data.data : []).flatMap((row) =>
            row.node_id === undefined
              ? []
              : [{ value: row.node_id, label: row.nodename ?? row.node_id }],
          );
        }
        case "cluster": {
          const { data, error } = await api.GET("/clusters", {
            params: {
              query: { props: "cluster_id,cluster_name", orderby: "cluster_name", limit: 0 },
            },
          });
          if (error !== undefined) return fail(error);
          return (Array.isArray(data.data) ? data.data : []).flatMap((row) =>
            row.cluster_id === undefined || row.cluster_id === null
              ? []
              : [{ value: row.cluster_id, label: row.cluster_name ?? row.cluster_id }],
          );
        }
        case "instance": {
          const { data, error } = await api.GET("/services_instances", {
            params: {
              query: {
                props: "svc_id,node_id,services.svcname,nodes.nodename",
                orderby: "services.svcname,nodes.nodename",
                limit: 0,
              },
            },
          });
          if (error !== undefined) return fail(error);
          const seen = new Set<string>();
          return (Array.isArray(data.data) ? data.data : []).flatMap((row) => {
            if (row.svc_id === undefined || row.node_id === undefined) return [];
            const value = `${row.svc_id}@${row.node_id}`;
            // An encapsulated service has a row per container: one target.
            if (seen.has(value)) return [];
            seen.add(value);
            return [
              {
                value,
                label: `${row["services.svcname"] ?? row.svc_id} @ ${row["nodes.nodename"] ?? row.node_id}`,
              },
            ];
          });
        }
      }
    },
  });
}

export function useFiltersetOptions(enabled: boolean) {
  return useQuery({
    queryKey: ["filtersets", "options"],
    enabled,
    queryFn: async (): Promise<ComboboxOption[]> => {
      const { data, error } = await api.GET("/filtersets", {
        params: { query: { props: "id,fset_name", orderby: "fset_name", limit: 0 } },
      });
      if (error !== undefined) return fail(error);
      return (Array.isArray(data.data) ? data.data : []).flatMap((row) =>
        row.id === undefined || row.fset_name === undefined
          ? []
          : [{ value: String(row.id), label: row.fset_name }],
      );
    },
  });
}
