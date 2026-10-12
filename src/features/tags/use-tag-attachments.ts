import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";
import { readProp } from "@/lib/row";

/** A node or a service carrying a tag, with the data of this attachment. */
export interface TagAttachment {
  id: string;
  name: string;
  data: string;
}

function text(value: unknown): string {
  if (value === undefined || value === null) return "";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

/**
 * The nodes, or the services, a tag is attached to, those the user may see, by
 * name, each with the data of its attachment. `GET /tags/nodes` and
 * `/tags/services` return the generic `ListResponse`: rows read one prop at a time.
 */
export function useTagAttachments(tagId: string | undefined, kind: "nodes" | "services") {
  return useQuery({
    queryKey: ["tags", tagId, "attachments", kind],
    enabled: tagId !== undefined && tagId !== "",
    queryFn: async () => {
      const filter = [`tag_id:eq:${tagId ?? ""}`];
      const response =
        kind === "nodes"
          ? await api.GET("/tags/nodes", {
              params: {
                query: {
                  props: "node_id,nodes.nodename,tag_attach_data",
                  orderby: "nodes.nodename",
                  limit: 0,
                  filter,
                },
              },
            })
          : await api.GET("/tags/services", {
              params: {
                query: {
                  props: "svc_id,services.svcname,tag_attach_data",
                  orderby: "services.svcname",
                  limit: 0,
                  filter,
                },
              },
            });
      if (response.error !== undefined) throw new Error(problemText(response.error));
      const rows = Array.isArray(response.data.data) ? (response.data.data as unknown[]) : [];
      return rows.map((row): TagAttachment => {
        const id = text(readProp(row, kind === "nodes" ? "node_id" : "svc_id"));
        const name = text(readProp(row, kind === "nodes" ? "nodes.nodename" : "services.svcname"));
        return { id, name: name === "" ? id : name, data: text(readProp(row, "tag_attach_data")) };
      });
    },
  });
}
