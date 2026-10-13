import { useQuery } from "@tanstack/react-query";
import type { components } from "@/lib/api/schema";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";

export type SafeFileRow = components["schemas"]["SafeFileRow"];

/** The props the detail reads, whatever the columns of the list. */
const DETAIL_PROPS =
  "id,uuid,name,size,md5,sha256,uploader,uploader_name,uploaded_from,uploaded_date,encrypted,safe_team_publication,safe_team_responsible";

/** A safe file by its id, null when it does not exist or the caller may not see it. */
export function useSafeFile(fileId: string | undefined) {
  return useQuery({
    queryKey: ["safe", "file", fileId],
    enabled: fileId !== undefined,
    queryFn: async () => {
      const { data, error } = await api.GET("/safe/{file_id}", {
        params: { path: { file_id: fileId ?? "" }, query: { props: DETAIL_PROPS } },
      });
      if (error !== undefined) throw new Error(problemText(error));
      const rows: SafeFileRow[] = Array.isArray(data.data) ? data.data : [];
      return rows[0] ?? null;
    },
  });
}

/** The previous versions of a file, the most recent first. */
export function useSafeHistory(fileId: string | undefined) {
  return useQuery({
    queryKey: ["safe", "history", fileId],
    enabled: fileId !== undefined,
    queryFn: async () => {
      const { data, error } = await api.GET("/safe/{file_id}/history", {
        params: {
          path: { file_id: fileId ?? "" },
          query: {
            props: "id,uuid,name,size,md5,uploader_name,uploaded_date,encrypted",
            orderby: "-id",
            limit: 0,
          },
        },
      });
      if (error !== undefined) throw new Error(problemText(error));
      const rows: SafeFileRow[] = Array.isArray(data.data) ? data.data : [];
      return rows;
    },
  });
}

/** Where a file is referenced: services and ruleset variables. */
export function useSafeUsage(fileId: string | undefined) {
  return useQuery({
    queryKey: ["safe", "usage", fileId],
    enabled: fileId !== undefined,
    queryFn: async () => {
      const { data, error } = await api.GET("/safe/{file_id}/usage", {
        params: { path: { file_id: fileId ?? "" } },
      });
      if (error !== undefined) throw new Error(problemText(error));
      return data.data;
    },
  });
}

/** Whether the caller may manage a file: upload a version, rename, delete, change its teams. */
export function useSafeResponsible(fileId: string | undefined) {
  return useQuery({
    queryKey: ["safe", "responsible", fileId],
    enabled: fileId !== undefined,
    queryFn: async () => {
      const { data, error } = await api.GET("/safe/{file_id}/am_i_responsible", {
        params: { path: { file_id: fileId ?? "" } },
      });
      if (error !== undefined) throw new Error(problemText(error));
      return data.data;
    },
  });
}

/** The text of a file, for a preview; null when it is not text. */
export function useSafePreview(fileId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["safe", "preview", fileId],
    enabled: fileId !== undefined && enabled,
    // A preview is a read of the content, written to the audit log: once per opening.
    staleTime: Infinity,
    retry: false,
    queryFn: async () => {
      const { data, error, response } = await api.GET("/safe/{file_id}/preview", {
        params: { path: { file_id: fileId ?? "" } },
      });
      if (response.status === 400) return null;
      if (error !== undefined) throw new Error(problemText(error));
      const bytes = Uint8Array.from(atob(data.data.data), (c) => c.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    },
  });
}

/**
 * Downloads a file's content and hands it to the browser under its name. The
 * content comes decrypted from the API; it is kept in memory only for the save.
 */
export async function downloadSafeFile(fileId: string, filename: string): Promise<void> {
  const { data, error } = await api.GET("/safe/{file_id}/download", {
    params: { path: { file_id: fileId } },
    parseAs: "blob",
  });
  if (error !== undefined) throw new Error(problemText(error));
  const url = URL.createObjectURL(data);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
  } finally {
    // Released once the browser has taken the file.
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 0);
  }
}

/**
 * Uploads a file, a new one or a new version of `fileId`. The generated types
 * give the binary part as a string (openapi-typescript maps `format: binary` so):
 * the serializer sends the File itself in the multipart body.
 */
export async function uploadSafeFile(
  file: File,
  name: string,
  fileId?: string,
): Promise<number | undefined> {
  const form = new FormData();
  form.append("file", file, file.name);
  if (name.trim() !== "") form.append("name", name.trim());
  const body = { file: file.name, ...(name.trim() === "" ? {} : { name: name.trim() }) };
  const { data, error } =
    fileId === undefined
      ? await api.POST("/safe/upload", { body, bodySerializer: () => form })
      : await api.POST("/safe/{file_id}/upload", {
          params: { path: { file_id: fileId } },
          body,
          bodySerializer: () => form,
        });
  if (error !== undefined) throw new Error(problemText(error));
  const rows: SafeFileRow[] = Array.isArray(data.data) ? data.data : [];
  return rows[0]?.id;
}

/** The name a file is saved under: the one of the uploaded file, else its name. */
export function downloadName(row: SafeFileRow): string {
  const uuid = row.uuid ?? "";
  const match = /^safe\.uuid\.[0-9a-fA-F-]+\.([0-9a-fA-F]+)\.\w+$/.exec(uuid);
  if (match?.[1] !== undefined && match[1].length % 2 === 0) {
    const bytes = Uint8Array.from(match[1].match(/../g) ?? [], (h) => parseInt(h, 16));
    const original = new TextDecoder().decode(bytes);
    if (original !== "") return original;
  }
  return row.name !== undefined && row.name !== "" ? row.name : uuid;
}

/** A size in bytes, as the Safe stores it. */
export function formatBytes(value: number | undefined, locale: string): string {
  if (value === undefined) return "";
  const units = ["B", "KiB", "MiB", "GiB"];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit++;
  }
  return `${size.toLocaleString(locale, { maximumFractionDigits: unit === 0 ? 0 : 1 })} ${units[unit]}`;
}
