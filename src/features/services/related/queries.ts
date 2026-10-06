import { useQueries, useQuery } from "@tanstack/react-query";
import type { components } from "@/lib/api/schema";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";
import { toPage } from "@/lib/api/page";
import { toValueStats } from "@/lib/api/value-stats";
import { toTagRows } from "@/features/tags/tag-row";
import { NODE_PROPS } from "@/features/nodes/node-props";

type DiskRow = components["schemas"]["DiskRow"];
type HbaRow = components["schemas"]["HbaRow"];
type InstanceRow = components["schemas"]["InstanceRow"];

/** Disks of the service, as seen by each of its nodes. */
export function useServiceDisks(svcId: string | undefined) {
  return useQuery({
    queryKey: ["service", svcId, "disks"],
    enabled: svcId !== undefined,
    queryFn: async () => {
      const { data, error } = await api.GET("/services/{svc_id}/disks", {
        params: {
          path: { svc_id: svcId ?? "" },
          query: {
            props:
              "disk_id,disk_name,disk_vendor,disk_model,disk_size,disk_used,disk_dg,node_id,nodename,svc_id,updated",
            orderby: "nodename,disk_id",
            limit: 0,
          },
        },
      });
      if (error !== undefined) throw new Error(problemText(error));
      const rows: DiskRow[] = Array.isArray(data.data) ? data.data : [];
      return rows;
    },
  });
}

/**
 * Host bus adapters of the nodes carrying an instance of the service, as in the
 * Storage tab of the historical collector (`ajax_svc_stor`). apicollector has no
 * dedicated endpoint: the instances are read, then the HBAs of each node.
 */
export function useServiceHbas(svcId: string | undefined) {
  return useQuery({
    queryKey: ["service", svcId, "hbas"],
    enabled: svcId !== undefined,
    queryFn: async () => {
      const instances = await api.GET("/services_instances/{svc_id}", {
        params: {
          path: { svc_id: svcId ?? "" },
          query: { props: "node_id,nodes.nodename", limit: 0 },
        },
      });
      if (instances.error !== undefined) throw new Error(problemText(instances.error));
      const nodes: InstanceRow[] = Array.isArray(instances.data.data) ? instances.data.data : [];
      const unique = [...new Map(nodes.map((node) => [node.node_id ?? "", node])).values()].filter(
        (node) => node.node_id !== undefined && node.node_id !== "",
      );
      const perNode = await Promise.all(
        unique.map(async (node) => {
          const { data, error } = await api.GET("/nodes/{node_id}/hbas", {
            params: {
              path: { node_id: node.node_id ?? "" },
              query: {
                props: "id,node_id,hba_id,hba_type,updated",
                orderby: "hba_type,hba_id",
                limit: 0,
              },
            },
          });
          if (error !== undefined) throw new Error(problemText(error));
          const rows: HbaRow[] = Array.isArray(data.data) ? data.data : [];
          return { nodename: node["nodes.nodename"] ?? node.node_id ?? "", rows };
        }),
      );
      return perNode.sort((a, b) => a.nodename.localeCompare(b.nodename));
    },
  });
}

/** Tags attached to the service. `GET /…/tags` returns the generic `ListResponse`: read by `toTagRows`. */
export function useServiceTags(svcId: string | undefined) {
  return useQuery({
    queryKey: ["service", svcId, "tags"],
    enabled: svcId !== undefined,
    queryFn: async () => {
      const { data, error } = await api.GET("/services/{svc_id}/tags", {
        params: { path: { svc_id: svcId ?? "" }, query: { orderby: "tag_name", limit: 0 } },
      });
      if (error !== undefined) throw new Error(problemText(error));
      return toTagRows(data.data);
    },
  });
}

type PackagesDiff = components["schemas"]["PackagesDiffResponse"];

/**
 * Packages that differ between the nodes of the service, as the historical
 * PkgDiff tab: between the nodes running its instances, or with `encap` between
 * its encapsulated nodes. Null when there is nothing to compare: the API answers
 * 400 below two nodes, which a service on a single node always meets.
 */
export function useServicePackagesDiff(svcId: string | undefined, encap: boolean) {
  return useQuery({
    queryKey: ["service", svcId, "pkgdiff", encap],
    enabled: svcId !== undefined,
    queryFn: async (): Promise<PackagesDiff | null> => {
      const { data, error, response } = await api.GET("/packages/diff", {
        params: { query: { svc_ids: svcId ?? "", encap } },
      });
      if (response.status === 400) return null;
      if (error !== undefined) throw new Error(problemText(error));
      return data;
    },
  });
}

type NodeRow = components["schemas"]["NodeRow"];
type ComplianceStatusRow = components["schemas"]["ComplianceStatusRow"];
type ModulesetRow = components["schemas"]["ModulesetRow"];
type RulesetRow = components["schemas"]["RulesetRow"];

/** The ids of the nodes running an instance of the service, as the historical nodediff reads them. */
export function useServiceNodeIds(svcId: string | undefined) {
  return useQuery({
    queryKey: ["service", svcId, "node-ids"],
    enabled: svcId !== undefined,
    queryFn: async () => {
      const { data, error } = await api.GET("/services_instances", {
        params: {
          query: { props: "node_id", limit: 0, filter: [`svc_id:eq:${svcId ?? ""}`] },
        },
      });
      if (error !== undefined) throw new Error(problemText(error));
      const rows: InstanceRow[] = Array.isArray(data.data) ? data.data : [];
      // An encapsulated service has one row per container on a node: counted once.
      return [...new Set(rows.flatMap((row) => (row.node_id ? [row.node_id] : [])))].sort();
    },
  });
}

/** Every property of the given nodes, by name, for the asset differences. */
export function useNodesAssets(nodeIds: string[] | undefined) {
  return useQuery({
    queryKey: ["nodes", "assets", nodeIds],
    enabled: nodeIds !== undefined && nodeIds.length > 0,
    queryFn: async () => {
      const { data, error } = await api.GET("/nodes", {
        params: {
          query: {
            props: NODE_PROPS.join(","),
            orderby: "nodename",
            limit: 0,
            filter: [`node_id:in:${(nodeIds ?? []).join(",")}`],
          },
        },
      });
      if (error !== undefined) throw new Error(problemText(error));
      const rows: NodeRow[] = Array.isArray(data.data) ? data.data : [];
      return rows;
    },
  });
}

/** What the compliance of a node is made of, for the compliance differences. */
export interface NodeCompliance {
  nodeId: string;
  status: ComplianceStatusRow[];
  modulesets: ModulesetRow[];
  rulesets: RulesetRow[];
}

/**
 * The compliance of each of the given nodes: the last run of each module, and the
 * modulesets and rulesets attached. Read node by node, the API having no request
 * over several nodes; a service runs on a handful of them.
 */
export function useNodesCompliance(nodeIds: string[] | undefined) {
  return useQueries({
    queries: (nodeIds ?? []).map((nodeId) => ({
      queryKey: ["node", nodeId, "compliance-summary"],
      queryFn: async (): Promise<NodeCompliance> => {
        const path = { node_id: nodeId };
        const [status, modulesets, rulesets] = await Promise.all([
          api.GET("/nodes/{node_id}/compliance/status", {
            params: { path, query: { props: "run_module,run_status,svc_id", limit: 0 } },
          }),
          api.GET("/nodes/{node_id}/compliance/modulesets", {
            params: { path, query: { props: "id,modset_name", limit: 0 } },
          }),
          api.GET("/nodes/{node_id}/compliance/rulesets", {
            params: { path, query: { props: "id,ruleset_name", limit: 0 } },
          }),
        ]);
        for (const r of [status, modulesets, rulesets])
          if (r.error !== undefined) throw new Error(problemText(r.error));
        return {
          nodeId,
          status: Array.isArray(status.data?.data) ? status.data.data : [],
          modulesets: Array.isArray(modulesets.data?.data) ? modulesets.data.data : [],
          rulesets: Array.isArray(rulesets.data?.data) ? rulesets.data.data : [],
        };
      },
    })),
    combine: (results) => ({
      data: results.every((r) => r.isSuccess)
        ? results.flatMap((r) => (r.data === undefined ? [] : [r.data]))
        : undefined,
      isPending: results.some((r) => r.isPending),
      error: results.find((r) => r.isError)?.error ?? null,
    }),
  });
}

type ResourceRow = components["schemas"]["ResourceRow"];

/** A resource of the service, with the name of the node that reports it. */
export interface ServiceResource extends ResourceRow {
  nodename: string;
}

/**
 * Resources of the service, as each of its instances reports them: the historical
 * "resources status" tab (`table_resources_svc`). The per-service endpoint has no
 * node names: they come from the service's instances, as for the HBAs.
 */
export function useServiceResources(svcId: string | undefined) {
  return useQuery({
    queryKey: ["service", svcId, "resources"],
    enabled: svcId !== undefined,
    queryFn: async (): Promise<ServiceResource[]> => {
      const [resources, instances] = await Promise.all([
        api.GET("/services/{svc_id}/resources", {
          params: {
            path: { svc_id: svcId ?? "" },
            query: {
              props:
                "id,node_id,vmname,rid,res_type,res_status,res_desc,res_log,res_monitor,res_disable,res_optional,updated",
              orderby: "node_id,vmname,rid",
              limit: 0,
            },
          },
        }),
        api.GET("/services_instances/{svc_id}", {
          params: {
            path: { svc_id: svcId ?? "" },
            query: { props: "node_id,nodes.nodename", limit: 0 },
          },
        }),
      ]);
      if (resources.error !== undefined) throw new Error(problemText(resources.error));
      if (instances.error !== undefined) throw new Error(problemText(instances.error));
      const names = new Map(
        (Array.isArray(instances.data.data) ? (instances.data.data as InstanceRow[]) : []).map(
          (row) => [row.node_id ?? "", row["nodes.nodename"] ?? ""],
        ),
      );
      const rows = (Array.isArray(resources.data.data) ? resources.data.data : []) as ResourceRow[];
      return rows.map((row) => ({
        ...row,
        nodename: names.get(row.node_id ?? "") || (row.node_id ?? ""),
      }));
    },
  });
}

type LogRow = components["schemas"]["LogRow"];

/** Log entries shown in the service tab: the Logs view, filtered on the service, has them all. */
export const SERVICE_LOGS_LIMIT = 100;

/** The latest log entries of the service, the most recent first. */
export function useServiceLogs(svcId: string | undefined) {
  return useQuery({
    queryKey: ["service", svcId, "logs"],
    enabled: svcId !== undefined,
    queryFn: async () => {
      const { data, error } = await api.GET("/logs", {
        params: {
          query: {
            props:
              "id,log_date,log_level,node_id,nodes.nodename,log_user,log_impersonator,log_action,log_fmt,log_dict",
            orderby: "-log_date,-id",
            // One more than shown: whether older entries remain.
            limit: SERVICE_LOGS_LIMIT + 1,
            filter: [`svc_id:eq:${svcId ?? ""}`],
          },
        },
      });
      if (error !== undefined) throw new Error(problemText(error));
      const rows: LogRow[] = Array.isArray(data.data) ? data.data : [];
      return toPage(rows, data.meta, SERVICE_LOGS_LIMIT);
    },
  });
}

type ServiceAction = components["schemas"]["ServiceActionRow"];

/** Actions listed in the service tab, the latest first; the timeline draws them all. */
export const SERVICE_ACTIONS_LIMIT = 100;
/** Days of actions the tab counter covers, as the historical service actions tab. */
export const SERVICE_ACTIONS_DAYS = 60;
/** The periods the tab offers, in days, and the one it opens on. */
export const SERVICE_ACTIONS_PERIODS = [1, 7, 30, 60] as const;
export const SERVICE_ACTIONS_DEFAULT_DAYS = 7;
/** Actions the timeline draws at most: past them, a note asks for a shorter period. */
export const SERVICE_ACTIONS_TIMELINE_LIMIT = 1000;

/**
 * The start of a period of `days`, as the collector writes dates. Rounded down to
 * the hour, so that the cache key holds that long.
 */
function actionsSince(days: number): string {
  const start = new Date(Date.now() - days * 24 * 3600 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${String(start.getFullYear())}-${pad(start.getMonth() + 1)}-${pad(start.getDate())} ${pad(start.getHours())}:00:00`;
}

/**
 * The filters of the tab: the actions themselves (`log_type` "status"), not their
 * log lines, of the period covered.
 */
function actionFilters(days: number, nodeId?: string): string[] {
  const filters = ["log_type:eq:status", `begin:gte:${actionsSince(days)}`];
  return nodeId === undefined ? filters : [...filters, `node_id:eq:${nodeId}`];
}

/**
 * The actions the agents ran on the service over the last `days`, the latest
 * first, up to `SERVICE_ACTIONS_TIMELINE_LIMIT`: the timeline draws them, the list
 * shows the latest of them.
 */
export function useServiceActions(svcId: string | undefined, days: number, nodeId?: string) {
  return useQuery({
    queryKey: ["service", svcId, "actions", nodeId ?? "", actionsSince(days)],
    enabled: svcId !== undefined,
    queryFn: async () => {
      const { data, error } = await api.GET("/services/{svc_id}/actions", {
        params: {
          path: { svc_id: svcId ?? "" },
          query: {
            props:
              "id,svc_id,node_id,nodes.nodename,action,rid,subset,status,begin,end,time,cron,sid,pid,command,ack,acked_by,acked_date,acked_comment",
            // One more than drawn: whether older actions remain.
            limit: SERVICE_ACTIONS_TIMELINE_LIMIT + 1,
            filter: actionFilters(days, nodeId),
          },
        },
      });
      if (error !== undefined) throw new Error(problemText(error));
      const rows: ServiceAction[] = Array.isArray(data.data) ? data.data : [];
      return toPage(rows, data.meta, SERVICE_ACTIONS_TIMELINE_LIMIT);
    },
  });
}

/**
 * The actions of the period counted by status, all of them and not only those
 * shown; of one node only, for an instance, with `nodeId`.
 */
export function useServiceActionStats(svcId: string | undefined, nodeId?: string) {
  return useQuery({
    queryKey: [
      "service",
      svcId,
      "actions",
      "stats",
      nodeId ?? "",
      actionsSince(SERVICE_ACTIONS_DAYS),
    ],
    enabled: svcId !== undefined,
    queryFn: async () => {
      const { data, error } = await api.GET("/services/{svc_id}/actions", {
        params: {
          path: { svc_id: svcId ?? "" },
          query: {
            props: "status",
            stats: "1",
            filter: actionFilters(SERVICE_ACTIONS_DAYS, nodeId),
          },
        },
      });
      if (error !== undefined) throw new Error(problemText(error));
      return toValueStats(data.data, data.meta, "status");
    },
  });
}
