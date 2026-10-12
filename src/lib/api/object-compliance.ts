import { useQuery } from "@tanstack/react-query";
import type { components } from "@/lib/api/schema";
import { api } from "./client";
import { problemText } from "./problem";

type ComplianceStatusRow = components["schemas"]["ComplianceStatusRow"];

/**
 * The object whose compliance is read: a node, or a service. `slave` names the
 * compliance of the service's encapsulated nodes, its containers, rather than that
 * of the service itself, as the historical encap modulesets and rulesets.
 */
export type CompTarget =
  { kind: "node"; id: string } | { kind: "service"; id: string; slave?: boolean };

/** What is attached to a node or a service. */
export type CompAttachable = "modulesets" | "rulesets";

/** A moduleset or a ruleset, attached to the object or attachable to it. */
export interface CompObject {
  id: string;
  name: string;
}

/** Cache key of the compliance of an object: under the object's, which live updates reload. */
export function compKey(target: CompTarget, ...rest: (string | boolean)[]) {
  return [
    target.kind,
    target.id,
    "compliance",
    ...(target.kind === "service" && target.slave === true ? ["slave"] : []),
    ...rest,
  ];
}

/** The ids and names of a list of modulesets or rulesets, in the order of their names. */
function toCompObjects(rows: unknown, what: CompAttachable): CompObject[] {
  if (!Array.isArray(rows)) return [];
  const nameProp = what === "modulesets" ? "modset_name" : "ruleset_name";
  return (rows as Record<string, unknown>[])
    .flatMap((row) => {
      const id = row.id;
      const name = row[nameProp];
      return (typeof id === "number" || typeof id === "string") && typeof name === "string"
        ? [{ id: String(id), name }]
        : [];
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

const PROPS: Record<CompAttachable, string> = {
  modulesets: "id,modset_name",
  rulesets: "id,ruleset_name",
};

async function readAttached(target: CompTarget, what: CompAttachable, candidates: boolean) {
  const query = { props: PROPS[what], limit: 0 };
  if (target.kind === "node") {
    const path = { node_id: target.id };
    const response =
      what === "modulesets"
        ? candidates
          ? await api.GET("/nodes/{node_id}/compliance/candidate_modulesets", {
              params: { path, query },
            })
          : await api.GET("/nodes/{node_id}/compliance/modulesets", { params: { path, query } })
        : candidates
          ? await api.GET("/nodes/{node_id}/compliance/candidate_rulesets", {
              params: { path, query },
            })
          : await api.GET("/nodes/{node_id}/compliance/rulesets", { params: { path, query } });
    if (response.error !== undefined) throw new Error(problemText(response.error));
    return toCompObjects(response.data.data, what);
  }
  const path = { svc_id: target.id };
  const squery = { ...query, slave: target.slave === true };
  const response =
    what === "modulesets"
      ? candidates
        ? await api.GET("/services/{svc_id}/compliance/candidate_modulesets", {
            params: { path, query: squery },
          })
        : await api.GET("/services/{svc_id}/compliance/modulesets", {
            params: { path, query: squery },
          })
      : candidates
        ? await api.GET("/services/{svc_id}/compliance/candidate_rulesets", {
            params: { path, query: squery },
          })
        : await api.GET("/services/{svc_id}/compliance/rulesets", {
            params: { path, query: squery },
          });
  if (response.error !== undefined) throw new Error(problemText(response.error));
  return toCompObjects(response.data.data, what);
}

/** The modulesets, or the rulesets, attached to the object. */
export function useCompAttached(target: CompTarget | undefined, what: CompAttachable) {
  return useQuery({
    queryKey: target === undefined ? ["compliance", "none"] : compKey(target, what),
    enabled: target !== undefined,
    queryFn: () => readAttached(target as CompTarget, what, false),
  });
}

/**
 * The modulesets, or the rulesets, the collector judges attachable to the object;
 * asked for only when `enabled`, for whoever may attach.
 */
export function useCompCandidates(target: CompTarget, what: CompAttachable, enabled: boolean) {
  return useQuery({
    queryKey: compKey(target, "candidates", what),
    enabled,
    queryFn: () => readAttached(target, what, true),
  });
}

/** Attaches a moduleset or a ruleset to the object; what the API answers. */
export function attachComp(target: CompTarget, what: CompAttachable, id: string) {
  if (target.kind === "node") {
    return what === "modulesets"
      ? api.POST("/nodes/{node_id}/compliance/modulesets/{mset_id}", {
          params: { path: { node_id: target.id, mset_id: id } },
        })
      : api.POST("/nodes/{node_id}/compliance/rulesets/{rset_id}", {
          params: { path: { node_id: target.id, rset_id: id } },
        });
  }
  const query = { slave: target.slave === true };
  return what === "modulesets"
    ? api.POST("/services/{svc_id}/compliance/modulesets/{mset_id}", {
        params: { path: { svc_id: target.id, mset_id: id }, query },
      })
    : api.POST("/services/{svc_id}/compliance/rulesets/{rset_id}", {
        params: { path: { svc_id: target.id, rset_id: id }, query },
      });
}

/** Detaches a moduleset or a ruleset from the object; what the API answers. */
export function detachComp(target: CompTarget, what: CompAttachable, id: string) {
  if (target.kind === "node") {
    return what === "modulesets"
      ? api.DELETE("/nodes/{node_id}/compliance/modulesets/{mset_id}", {
          params: { path: { node_id: target.id, mset_id: id } },
        })
      : api.DELETE("/nodes/{node_id}/compliance/rulesets/{rset_id}", {
          params: { path: { node_id: target.id, rset_id: id } },
        });
  }
  const query = { slave: target.slave === true };
  return what === "modulesets"
    ? api.DELETE("/services/{svc_id}/compliance/modulesets/{mset_id}", {
        params: { path: { svc_id: target.id, mset_id: id }, query },
      })
    : api.DELETE("/services/{svc_id}/compliance/rulesets/{rset_id}", {
        params: { path: { svc_id: target.id, rset_id: id }, query },
      });
}

/**
 * The last check run of each compliance module of the object: on a node, its own
 * and those of the service instances it hosts, the service named; on a service,
 * those of its instances, the node named. Loaded whole: a few dozen modules each.
 */
export function useCompStatus(target: CompTarget | undefined) {
  return useQuery({
    queryKey: target === undefined ? ["compliance", "none"] : compKey(target, "status"),
    enabled: target !== undefined,
    queryFn: async () => {
      const t = target as CompTarget;
      const query = {
        props:
          "id,run_date,run_module,run_status,run_log,node_id,nodes.nodename,svc_id,services.svcname",
        orderby: "run_module",
        limit: 0,
      };
      const response =
        t.kind === "node"
          ? await api.GET("/nodes/{node_id}/compliance/status", {
              params: { path: { node_id: t.id }, query },
            })
          : await api.GET("/services/{svc_id}/compliance/status", {
              params: { path: { svc_id: t.id }, query },
            });
      if (response.error !== undefined) throw new Error(problemText(response.error));
      const rows: ComplianceStatusRow[] = Array.isArray(response.data.data)
        ? response.data.data
        : [];
      return rows;
    },
  });
}

/** How many modules a list of last checks finds not ok, for the counter of a tab. */
export function nokCount(rows: ComplianceStatusRow[] | undefined): number {
  return (rows ?? []).filter((row) => row.run_status === 1).length;
}
