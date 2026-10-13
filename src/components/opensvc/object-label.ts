import { useQueries } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { readProp } from "@/lib/row";
import type { PeekStep } from "@/lib/peek-trail";
import { fromInstanceId, instanceName, pickInstanceRow } from "@/features/instances/instance-id";
import { resourceName } from "@/features/resources/resource-format";

/**
 * Name of an object, for the panel title and the bookmarks.
 *
 * The path carries ids only — a uuid says nothing to a reader — so each step is read
 * once and cached. The queries reuse the keys of the panels themselves where the
 * shape allows, so opening a record one has already seen costs nothing.
 */
async function fetchLabel(step: PeekStep): Promise<string> {
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  switch (step.kind) {
    case "node": {
      const { data } = await api.GET("/nodes/{node_id}", {
        params: { path: { node_id: step.id }, query: { props: "nodename" } },
      });
      const rows = Array.isArray(data?.data) ? data.data : [];
      return text(readProp(rows[0] ?? {}, "nodename")) || step.id;
    }
    case "service": {
      const { data } = await api.GET("/services/{svc_id}", {
        params: { path: { svc_id: step.id }, query: { props: "svcname" } },
      });
      const rows = Array.isArray(data?.data) ? data.data : [];
      return text(readProp(rows[0] ?? {}, "svcname")) || step.id;
    }
    case "instance": {
      // An instance is named by its pair: the two names are read from its row.
      const key = fromInstanceId(step.id);
      if (key === null) return step.id;
      const { data } = await api.GET("/services/{svc_id}/instances/{node_id}", {
        params: {
          path: { svc_id: key.svcId, node_id: key.nodeId },
          query: { props: "services.svcname,nodes.nodename,mon_vmname" },
        },
      });
      const rows = Array.isArray(data?.data) ? data.data : [];
      const row = pickInstanceRow(rows, key.vmname) ?? {};
      const svc = text(readProp(row, "services.svcname"));
      const node = text(readProp(row, "nodes.nodename"));
      return svc === "" && node === "" ? step.id : instanceName(svc, node, key.vmname);
    }
    case "resource": {
      // A resource is named by its service, its node and its rid, as its panel title.
      const { data } = await api.GET("/resources/{resource_id}", {
        params: {
          path: { resource_id: step.id },
          query: { props: "svc_id,node_id,vmname,rid,services.svcname,nodes.nodename" },
        },
      });
      const row = Array.isArray(data?.data) ? data.data[0] : undefined;
      return row === undefined ? step.id : resourceName(row);
    }
    case "group": {
      // A team is named by an integer id: its role is what a reader recognises.
      const { data } = await api.GET("/groups/{group_id}", {
        params: { path: { group_id: step.id }, query: { props: "role" } },
      });
      const rows = Array.isArray(data?.data) ? data.data : [];
      return text(readProp(rows[0] ?? {}, "role")) || step.id;
    }
    case "tag": {
      // No tag can be read by its char(36) id alone: the list is read and searched,
      // as `useTag` does.
      const { data } = await api.GET("/tags", {
        params: { query: { props: "tag_id,tag_name", limit: 0 } },
      });
      const rows = Array.isArray(data?.data) ? data.data : [];
      const row = rows.find((r) => readProp(r, "tag_id") === step.id);
      return text(readProp(row ?? {}, "tag_name")) || step.id;
    }
    case "user": {
      // A user is named by an integer id: the email is what a reader recognises.
      const { data } = await api.GET("/users/{user_id}", {
        params: { path: { user_id: step.id }, query: { props: "email" } },
      });
      const rows = Array.isArray(data?.data) ? data.data : [];
      return text(readProp(rows[0] ?? {}, "email")) || step.id;
    }
    case "network": {
      // A network address is named by an integer id: the address is what one reads.
      const { data } = await api.GET("/ips/{id}", {
        params: { path: { id: step.id }, query: { props: "addr" } },
      });
      const rows = Array.isArray(data?.data) ? data.data : [];
      return text(readProp(rows[0] ?? {}, "addr")) || step.id;
    }
    case "filterset": {
      const { data } = await api.GET("/filtersets/{filterset_id}", {
        params: { path: { filterset_id: step.id }, query: { props: "fset_name" } },
      });
      const rows = Array.isArray(data?.data) ? data.data : [];
      return text(readProp(rows[0] ?? {}, "fset_name")) || step.id;
    }
    case "form": {
      const formId = Number(step.id);
      if (!Number.isInteger(formId)) return step.id;
      const { data } = await api.GET("/forms/{form_id}", {
        params: { path: { form_id: formId }, query: { props: "form_name" } },
      });
      const rows = Array.isArray(data?.data) ? data.data : [];
      return text(readProp(rows[0] ?? {}, "form_name")) || step.id;
    }
    case "metric": {
      const { data } = await api.GET("/metrics/{metric_id}", {
        params: { path: { metric_id: step.id }, query: { props: "metric_name" } },
      });
      const rows = Array.isArray(data?.data) ? data.data : [];
      return text(readProp(rows[0] ?? {}, "metric_name")) || step.id;
    }
    case "cluster": {
      const { data } = await api.GET("/clusters/{cluster_id}", {
        params: { path: { cluster_id: step.id }, query: { props: "cluster_name" } },
      });
      const rows = Array.isArray(data?.data) ? data.data : [];
      return text(readProp(rows[0] ?? {}, "cluster_name")) || step.id;
    }
    case "chart": {
      const { data } = await api.GET("/charts/{chart_id}", {
        params: { path: { chart_id: step.id }, query: { props: "chart_name" } },
      });
      const rows = Array.isArray(data?.data) ? data.data : [];
      return text(readProp(rows[0] ?? {}, "chart_name")) || step.id;
    }
    case "report": {
      const { data } = await api.GET("/reports/{report_id}", {
        params: { path: { report_id: step.id }, query: { props: "report_name" } },
      });
      const rows = Array.isArray(data?.data) ? data.data : [];
      return text(readProp(rows[0] ?? {}, "report_name")) || step.id;
    }
    case "moduleset": {
      const { data } = await api.GET("/compliance/modulesets/{modset_id}", {
        params: { path: { modset_id: step.id }, query: { props: "modset_name" } },
      });
      const rows = Array.isArray(data?.data) ? data.data : [];
      return text(readProp(rows[0] ?? {}, "modset_name")) || step.id;
    }
    case "ruleset": {
      const { data } = await api.GET("/compliance/rulesets/{rset_id}", {
        params: { path: { rset_id: step.id }, query: { props: "ruleset_name" } },
      });
      const rows = Array.isArray(data?.data) ? data.data : [];
      return text(readProp(rows[0] ?? {}, "ruleset_name")) || step.id;
    }
    // An application code names itself, as a disk does: the id is what one reads.
    case "disk":
    case "app":
    default:
      return step.id;
  }
}

/** Names of a whole path, in order, falling back to the id while one is loading. */
export function useObjectLabels(trail: PeekStep[]): string[] {
  const results = useQueries({
    queries: trail.map((step) => ({
      queryKey: ["object-label", step.kind, step.id],
      staleTime: 5 * 60 * 1000,
      queryFn: () => fetchLabel(step),
    })),
  });
  return trail.map((step, index) => results[index]?.data ?? step.id);
}
