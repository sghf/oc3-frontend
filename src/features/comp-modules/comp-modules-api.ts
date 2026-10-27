import { useQuery } from "@tanstack/react-query";
import type { components } from "@/lib/api/schema";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";
import { download } from "@/lib/export/table";

export type CompModule = components["schemas"]["ComplianceModule"];
export type CompModuleDetail = components["schemas"]["ComplianceModuleDetail"];
export type CompModuleCreate = components["schemas"]["ComplianceModuleCreate"];
export type CompModuleFileInput = components["schemas"]["ComplianceModuleFileInput"];
export type CompModuleIssue = components["schemas"]["ComplianceModuleIssue"];
export type CompModuleFileDiff = components["schemas"]["ComplianceModuleFileDiff"];

/**
 * A change refused because the module changed since it was read: the API
 * answers 412, and the panel offers to reload it.
 */
export class StaleModuleError extends Error {}

function failure(error: unknown, response: Response): Error {
  const text = problemText(error);
  return response.status === 412 ? new StaleModuleError(text) : new Error(text);
}

/** The compliance modules of the repository, by order then name. */
export function useCompModules() {
  return useQuery({
    queryKey: ["compliance-modules"],
    queryFn: async () => {
      const { data, error } = await api.GET("/compliance/modules");
      if (error !== undefined) throw new Error(problemText(error));
      return data.data;
    },
  });
}

/** A module with its files, its history and the modulesets naming it. */
export function useCompModule(name: string | undefined) {
  return useQuery({
    queryKey: ["compliance-modules", name],
    enabled: name !== undefined,
    queryFn: async () => {
      const { data, error } = await api.GET("/compliance/modules/{name}", {
        params: { path: { name: name ?? "" } },
      });
      if (error !== undefined) throw new Error(problemText(error));
      return data;
    },
  });
}

/** The content of a file of a module, "" for the script of a script module. */
export function useCompModuleFile(name: string | undefined, path: string | undefined) {
  return useQuery({
    queryKey: ["compliance-modules", name, "file", path],
    enabled: name !== undefined && path !== undefined,
    queryFn: async () => {
      const { data, error } = await api.GET("/compliance/modules/{name}/file", {
        params: { path: { name: name ?? "" }, query: { path: path ?? "" } },
      });
      if (error !== undefined) throw new Error(problemText(error));
      return data;
    },
  });
}

/** Creates a script module, or a directory module from its files: the module as created. */
export async function createCompModule(body: CompModuleCreate): Promise<CompModuleDetail> {
  const { data, error, response } = await api.POST("/compliance/modules", { body });
  if (error !== undefined) throw failure(error, response);
  return data;
}

/** Creates a directory module from an archive, .tar.gz or .zip. */
export async function importCompModule(
  name: string,
  order: number,
  archive: File,
  message: string,
): Promise<CompModuleDetail> {
  const form = new FormData();
  form.append("name", name);
  form.append("order", String(order));
  if (message.trim() !== "") form.append("message", message.trim());
  form.append("archive", archive, archive.name);
  const { data, error, response } = await api.POST("/compliance/modules_import", {
    body: { name, order, archive: archive.name },
    bodySerializer: () => form,
  });
  if (error !== undefined) throw failure(error, response);
  return data;
}

/**
 * Writes a file of a module, from its revision base: the script of a script
 * module (path ""), a file of a directory module, text or bytes.
 */
export async function putCompModuleFile(
  name: string,
  base: string,
  file: { path: string; content: string | Uint8Array; executable: boolean },
  message: string,
): Promise<CompModuleDetail> {
  const binary = typeof file.content !== "string";
  const { data, error, response } = await api.PUT("/compliance/modules/{name}/file", {
    params: { path: { name } },
    body: {
      path: file.path,
      content: binary ? toBase64(file.content as Uint8Array) : (file.content as string),
      encoding: binary ? "base64" : "text",
      executable: file.executable,
      base,
      message: message.trim() === "" ? undefined : message.trim(),
    },
  });
  if (error !== undefined) throw failure(error, response);
  return data;
}

/** Removes a file of a directory module, from its revision base. */
export async function deleteCompModuleFile(
  name: string,
  base: string,
  path: string,
  message: string,
): Promise<CompModuleDetail> {
  const { data, error, response } = await api.DELETE("/compliance/modules/{name}/file", {
    params: {
      path: { name },
      query: { path, base, message: message.trim() === "" ? undefined : message.trim() },
    },
  });
  if (error !== undefined) throw failure(error, response);
  return data;
}

/** Renames a file of a directory module, from its revision base. */
export async function moveCompModuleFile(
  name: string,
  base: string,
  from: string,
  to: string,
  message: string,
): Promise<CompModuleDetail> {
  const { data, error, response } = await api.POST("/compliance/modules/{name}/move", {
    params: { path: { name } },
    body: { from, to, base, message: message.trim() === "" ? undefined : message.trim() },
  });
  if (error !== undefined) throw failure(error, response);
  return data;
}

/** Turns a script module into a directory whose entry, scripts/main, is the script. */
export async function convertCompModule(name: string, base: string): Promise<CompModuleDetail> {
  const { data, error, response } = await api.POST("/compliance/modules/{name}/convert", {
    params: { path: { name } },
    body: { base },
  });
  if (error !== undefined) throw failure(error, response);
  return data;
}

/**
 * Gives a module another name or order, from its revision base: the
 * modulesets naming it follow the new name.
 */
export async function renameCompModule(
  name: string,
  base: string,
  next: { name: string; order: number },
  message: string,
): Promise<CompModuleDetail> {
  const { data, error, response } = await api.POST("/compliance/modules/{name}/rename", {
    params: { path: { name } },
    body: { ...next, base, message: message.trim() === "" ? undefined : message.trim() },
  });
  if (error !== undefined) throw failure(error, response);
  return data;
}

/** Makes a file of a directory module executable, or not, from its revision base. */
export async function setCompModuleExecutable(
  name: string,
  base: string,
  path: string,
  executable: boolean,
): Promise<CompModuleDetail> {
  const { data, error, response } = await api.POST("/compliance/modules/{name}/mode", {
    params: { path: { name } },
    body: { path, executable, base },
  });
  if (error !== undefined) throw failure(error, response);
  return data;
}

/** What changed in a module since one of its versions, a commit of its history. */
export function useCompModuleDiff(name: string, rev: string | undefined) {
  return useQuery({
    queryKey: ["compliance-modules", name, "diff", rev],
    enabled: rev !== undefined,
    queryFn: async () => {
      const { data, error } = await api.GET("/compliance/modules/{name}/versions/{rev}/diff", {
        params: { path: { name, rev: rev ?? "" } },
      });
      if (error !== undefined) throw new Error(problemText(error));
      return data;
    },
  });
}

/** Brings a module back to one of its versions, from its revision base: a new commit. */
export async function restoreCompModule(
  name: string,
  base: string,
  rev: string,
): Promise<CompModuleDetail> {
  const { data, error, response } = await api.POST("/compliance/modules/{name}/restore", {
    params: { path: { name } },
    body: { rev, base },
  });
  if (error !== undefined) throw failure(error, response);
  return data;
}

/** Replaces every file of a module with those of an archive, from its revision base. */
export async function replaceCompModuleArchive(
  name: string,
  base: string,
  archive: File,
  message: string,
): Promise<CompModuleDetail> {
  const form = new FormData();
  form.append("base", base);
  if (message.trim() !== "") form.append("message", message.trim());
  form.append("archive", archive, archive.name);
  const { data, error, response } = await api.PUT("/compliance/modules/{name}/archive", {
    params: { path: { name } },
    body: { base, archive: archive.name },
    bodySerializer: () => form,
  });
  if (error !== undefined) throw failure(error, response);
  return data;
}

/** Downloads a module as a tarball rooted at its entry, S<order>-<name>. */
export async function downloadCompModule(name: string, entry: string): Promise<void> {
  const { data, error } = await api.GET("/compliance/modules/{name}/archive", {
    params: { path: { name } },
    parseAs: "blob",
  });
  if (error !== undefined) throw new Error(problemText(error));
  download(data, `${entry}.tar.gz`);
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/**
 * The name of a new module: a letter, then letters, digits and _.+-, 64 at
 * most, as the API accepts it.
 */
export const MODULE_NAME = /^[A-Za-z][A-Za-z0-9_.+-]{0,63}$/;

/** The largest order of a module. */
export const MAX_ORDER = 99999;
