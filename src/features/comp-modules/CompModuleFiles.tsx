import { useId, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { DownloadIcon, PencilIcon, PlusIcon, TrashIcon, UploadIcon } from "@/components/ui/icons";
import {
  StaleModuleError,
  convertCompModule,
  deleteCompModuleFile,
  downloadCompModule,
  moveCompModuleFile,
  putCompModuleFile,
  replaceCompModuleArchive,
  setCompModuleExecutable,
  useCompModuleFile,
  type CompModuleDetail,
} from "./comp-modules-api";
import { useModuleWrite } from "./use-module-write";

const INPUT = "h-8 w-full rounded-(--radius-control) border border-line bg-surface px-2";
const BUTTON =
  "flex h-7 items-center gap-1.5 rounded-(--radius-control) border border-line px-2 text-ink-muted hover:text-ink disabled:opacity-60";
const AREA =
  "w-full rounded-(--radius-control) border border-line bg-surface px-2 py-1 font-mono text-data whitespace-pre";
const SECTION = "flex flex-col gap-2";

/** The entry of a directory module, which the agents run: it cannot go. */
function isEntry(module: CompModuleDetail, path: string): boolean {
  return module.kind === "directory" && path === module.entry;
}

export function WriteError({ error, onReload }: { error: Error | null; onReload: () => void }) {
  const { t } = useTranslation();
  if (error === null) return null;
  return (
    <div role="alert" className="text-state-down">
      ■ {error.message}
      {error instanceof StaleModuleError && (
        <button type="button" onClick={onReload} className="ml-2 text-accent hover:underline">
          {t("compModules.edit.reload")}
        </button>
      )}
    </div>
  );
}

/** Text or bytes: a file read from the disk, as the API takes it. */
async function readUpload(file: File): Promise<{ content: string | Uint8Array; script: boolean }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const script = bytes[0] === 0x23 && bytes[1] === 0x21;
  if (bytes.includes(0)) return { content: bytes, script };
  try {
    return { content: new TextDecoder("utf-8", { fatal: true }).decode(bytes), script };
  } catch {
    return { content: bytes, script };
  }
}

/**
 * The files of a module, read, and changed by a CompManager: the script of a
 * script module, edited or turned into a directory; the files of a directory
 * module, edited, added, uploaded, renamed or removed; the whole module
 * downloaded as an archive, or replaced from one. Each change is a commit.
 */
export function ModuleFiles({ module, canEdit }: { module: CompModuleDetail; canEdit: boolean }) {
  const { t } = useTranslation();
  const id = useId();
  const write = useModuleWrite(module);
  // The file shown: the script of a script module, the entry of a directory.
  const [selected, setSelected] = useState<string>(
    module.kind === "script"
      ? ""
      : module.entry !== ""
        ? module.entry
        : (module.files[0]?.path ?? ""),
  );
  // A file being written: one of the module, or a new one (isNew).
  const [editing, setEditing] = useState<{ path: string; isNew: boolean } | undefined>();
  const [renaming, setRenaming] = useState<string | undefined>();
  const [newPath, setNewPath] = useState<string | undefined>();
  const [folder, setFolder] = useState("");
  const [archive, setArchive] = useState<File | undefined>();
  const uploadInput = useRef<HTMLInputElement>(null);
  const archiveInput = useRef<HTMLInputElement>(null);
  const shown = module.files.some((f) => f.path === selected) ? selected : undefined;

  async function upload(files: FileList) {
    const prefix = folder.trim().replace(/^\/+|\/+$/g, "");
    await write.run(async (base) => {
      let current: CompModuleDetail | undefined;
      let revision = base;
      for (const file of Array.from(files)) {
        const { content, script } = await readUpload(file);
        const path = prefix === "" ? file.name : `${prefix}/${file.name}`;
        current = await putCompModuleFile(
          module.name,
          revision,
          { path, content, executable: script },
          t("compModules.edit.uploadMessage", { path }),
        );
        revision = current.changed?.id ?? revision;
      }
      if (current === undefined) throw new Error(t("compModules.edit.noFile"));
      return current;
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={BUTTON}
          onClick={() => {
            void downloadCompModule(module.name, module.path);
          }}
        >
          <DownloadIcon />
          {t("compModules.edit.download")}
        </button>
        {canEdit && (
          <>
            <button
              type="button"
              className={BUTTON}
              disabled={write.pending}
              onClick={() => archiveInput.current?.click()}
            >
              <UploadIcon />
              {t("compModules.edit.replace")}
            </button>
            <input
              ref={archiveInput}
              type="file"
              accept=".tar.gz,.tgz,.zip,application/gzip,application/zip"
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(event) => {
                setArchive(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </>
        )}
        {canEdit && module.kind === "script" && (
          <ConfirmButton
            label={t("compModules.edit.convert")}
            question={t("compModules.edit.convertQuestion")}
            confirmLabel={t("compModules.edit.convertConfirm")}
            cancelLabel={t("detail.cancel")}
            pendingLabel={t("compModules.edit.saving")}
            pending={write.pending}
            inline
            onConfirm={() => {
              void write
                .run((base) => convertCompModule(module.name, base))
                .then((next) => {
                  if (next !== undefined) setSelected(next.entry);
                });
            }}
          />
        )}
      </div>

      {archive !== undefined && (
        <div className="flex flex-wrap items-center gap-3 rounded-(--radius-panel) border border-line p-3">
          <span>{t("compModules.edit.replaceQuestion", { file: archive.name })}</span>
          <ConfirmButton
            label={t("compModules.edit.replaceConfirm")}
            question={t("compModules.edit.replaceSure")}
            confirmLabel={t("compModules.edit.replaceConfirm")}
            cancelLabel={t("detail.cancel")}
            pendingLabel={t("compModules.edit.saving")}
            pending={write.pending}
            inline
            onConfirm={() => {
              const file = archive;
              void write
                .run((base) => replaceCompModuleArchive(module.name, base, file, ""))
                .then((next) => {
                  if (next !== undefined) {
                    setArchive(undefined);
                    setSelected(next.entry);
                  }
                });
            }}
          />
          <button
            type="button"
            className="text-accent hover:underline"
            onClick={() => {
              setArchive(undefined);
            }}
          >
            {t("detail.cancel")}
          </button>
        </div>
      )}

      <WriteError error={write.error} onReload={write.reload} />

      {module.kind === "directory" && (
        <section className={SECTION}>
          <h3 className="font-medium">{t("compModules.files")}</h3>
          <ul className="flex flex-col gap-1">
            {module.files.map((f) => (
              <li key={f.path} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {renaming === f.path ? (
                  <RenameForm
                    path={f.path}
                    pending={write.pending}
                    onCancel={() => {
                      setRenaming(undefined);
                    }}
                    onRename={(to) => {
                      void write
                        .run((base) => moveCompModuleFile(module.name, base, f.path, to, ""))
                        .then((next) => {
                          if (next === undefined) return;
                          setRenaming(undefined);
                          if (selected === f.path) setSelected(to);
                        });
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    aria-current={f.path === shown ? "true" : undefined}
                    onClick={() => {
                      setSelected(f.path);
                      setEditing(undefined);
                    }}
                    className={`text-left font-mono hover:underline ${f.path === shown ? "font-semibold text-ink" : "text-accent"}`}
                  >
                    {f.path}
                  </button>
                )}
                <span className="text-ink-muted">
                  {t("compModules.size", { count: f.size })}
                  {f.executable && ` · ${t("compModules.executable")}`}
                  {isEntry(module, f.path) && ` · ${t("compModules.edit.entry")}`}
                </span>
                {canEdit && renaming !== f.path && (
                  <span className="ml-auto flex items-center gap-2">
                    {!isEntry(module, f.path) && (
                      <button
                        type="button"
                        className="text-accent hover:underline"
                        disabled={write.pending}
                        onClick={() => {
                          void write.run((base) =>
                            setCompModuleExecutable(module.name, base, f.path, !f.executable),
                          );
                        }}
                      >
                        {f.executable
                          ? t("compModules.edit.makeNotExecutable")
                          : t("compModules.edit.makeExecutable")}
                      </button>
                    )}
                    <button
                      type="button"
                      className="text-accent hover:underline"
                      onClick={() => {
                        setRenaming(f.path);
                      }}
                    >
                      {t("compModules.edit.rename")}
                    </button>
                    {!isEntry(module, f.path) && (
                      <ConfirmButton
                        label={t("compModules.edit.delete")}
                        question={t("compModules.edit.deleteQuestion", { path: f.path })}
                        confirmLabel={t("compModules.edit.delete")}
                        cancelLabel={t("detail.cancel")}
                        pendingLabel={t("compModules.edit.saving")}
                        pending={write.pending}
                        icon={<TrashIcon />}
                        inline
                        onConfirm={() => {
                          void write.run((base) =>
                            deleteCompModuleFile(module.name, base, f.path, ""),
                          );
                        }}
                      />
                    )}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {canEdit && (
            <div className="flex flex-wrap items-end gap-2">
              {newPath === undefined ? (
                <button
                  type="button"
                  className={BUTTON}
                  onClick={() => {
                    setNewPath("");
                  }}
                >
                  <PlusIcon />
                  {t("compModules.edit.newFile")}
                </button>
              ) : (
                <form
                  className="flex flex-wrap items-end gap-2"
                  onSubmit={(event: FormEvent) => {
                    event.preventDefault();
                    if (newPath.trim() === "") return;
                    setEditing({ path: newPath.trim(), isNew: true });
                    setNewPath(undefined);
                  }}
                >
                  <label className="flex flex-col gap-1">
                    <span className="font-medium">{t("compModules.edit.newPath")}</span>
                    <input
                      autoFocus
                      value={newPath}
                      onChange={(event) => {
                        setNewPath(event.target.value);
                      }}
                      placeholder="lib/helpers.sh"
                      spellCheck={false}
                      className={`${INPUT} w-64 font-mono`}
                    />
                  </label>
                  <button type="submit" className={BUTTON}>
                    {t("compModules.edit.write")}
                  </button>
                  <button
                    type="button"
                    className="h-7 text-accent hover:underline"
                    onClick={() => {
                      setNewPath(undefined);
                    }}
                  >
                    {t("detail.cancel")}
                  </button>
                </form>
              )}
              <label className="flex flex-col gap-1" htmlFor={`${id}-folder`}>
                <span className="font-medium">{t("compModules.edit.folder")}</span>
                <input
                  id={`${id}-folder`}
                  value={folder}
                  onChange={(event) => {
                    setFolder(event.target.value);
                  }}
                  placeholder="lib"
                  spellCheck={false}
                  className={`${INPUT} w-40 font-mono`}
                />
              </label>
              <button
                type="button"
                className={BUTTON}
                disabled={write.pending}
                onClick={() => uploadInput.current?.click()}
              >
                <UploadIcon />
                {t("compModules.edit.upload")}
              </button>
              <input
                ref={uploadInput}
                type="file"
                multiple
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
                onChange={(event) => {
                  const files = event.target.files;
                  if (files !== null && files.length > 0) void upload(files);
                  event.target.value = "";
                }}
              />
            </div>
          )}
        </section>
      )}

      {editing !== undefined ? (
        <FileEditor
          key={`${editing.path}:${editing.isNew}`}
          module={module}
          path={editing.path}
          isNew={editing.isNew}
          pending={write.pending}
          onCancel={() => {
            setEditing(undefined);
          }}
          onSave={(content, executable, message) => {
            void write
              .run((base) =>
                putCompModuleFile(
                  module.name,
                  base,
                  { path: editing.path, content, executable },
                  message,
                ),
              )
              .then((next) => {
                if (next === undefined) return;
                setSelected(editing.path);
                setEditing(undefined);
              });
          }}
        />
      ) : (
        shown !== undefined && (
          <FileView
            name={module.name}
            path={shown}
            onEdit={
              canEdit
                ? () => {
                    setEditing({ path: shown, isNew: false });
                  }
                : undefined
            }
          />
        )
      )}
    </div>
  );
}

function RenameForm({
  path,
  pending,
  onRename,
  onCancel,
}: {
  path: string;
  pending: boolean;
  onRename: (to: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [to, setTo] = useState(path);
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (to.trim() !== "" && to.trim() !== path) onRename(to.trim());
      }}
    >
      <input
        autoFocus
        aria-label={t("compModules.edit.renameTo", { path })}
        value={to}
        onChange={(event) => {
          setTo(event.target.value);
        }}
        spellCheck={false}
        className={`${INPUT} w-64 font-mono`}
      />
      <button type="submit" disabled={pending} className={BUTTON}>
        {t("compModules.edit.rename")}
      </button>
      <button type="button" onClick={onCancel} className="text-accent hover:underline">
        {t("detail.cancel")}
      </button>
    </form>
  );
}

function FileView({
  name,
  path,
  onEdit,
}: {
  name: string;
  path: string;
  /** Absent for a reader: no edit offered. */
  onEdit?: () => void;
}) {
  const { t } = useTranslation();
  const file = useCompModuleFile(name, path);
  return (
    <section className={SECTION}>
      <div className="flex items-center gap-3">
        <h3 className="font-medium">
          {path === "" ? t("compModules.script") : <span className="font-mono">{path}</span>}
        </h3>
        {onEdit !== undefined &&
          file.data !== undefined &&
          !file.data.binary &&
          !file.data.truncated && (
            <button type="button" onClick={onEdit} className={BUTTON}>
              <PencilIcon />
              {t("compModules.edit.edit")}
            </button>
          )}
      </div>
      {file.isPending ? (
        <p className="text-ink-muted">{t("list.loading")}</p>
      ) : file.isError ? (
        <p role="alert" className="text-state-down">
          ■ {file.error.message}
        </p>
      ) : file.data.binary ? (
        <p className="text-ink-muted">{t("compModules.binary")}</p>
      ) : (
        <>
          <pre className="max-h-[32rem] overflow-auto rounded-(--radius-panel) border border-line bg-surface-sunken p-3 font-mono text-data whitespace-pre">
            {file.data.content}
          </pre>
          {file.data.truncated && <p className="text-ink-muted">{t("compModules.truncated")}</p>}
        </>
      )}
    </section>
  );
}

function FileEditor({
  module,
  path,
  isNew,
  pending,
  onSave,
  onCancel,
}: {
  module: CompModuleDetail;
  path: string;
  isNew: boolean;
  pending: boolean;
  onSave: (content: string, executable: boolean, message: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const file = useCompModuleFile(isNew ? undefined : module.name, isNew ? undefined : path);
  const meta = module.files.find((f) => f.path === path);
  const entry = isEntry(module, path) || module.kind === "script";
  // The draft starts from the file once read; a reload keeps it.
  const [draft, setDraft] = useState<string | undefined>(isNew ? "" : undefined);
  const [executable, setExecutable] = useState(meta?.executable ?? false);
  const [message, setMessage] = useState("");
  const content = draft ?? file.data?.content;

  if (content === undefined) {
    return file.isError ? (
      <p role="alert" className="text-state-down">
        ■ {file.error.message}
      </p>
    ) : (
      <p className="text-ink-muted">{t("list.loading")}</p>
    );
  }

  return (
    <form
      className={SECTION}
      onSubmit={(event) => {
        event.preventDefault();
        onSave(content, entry || executable, message);
      }}
    >
      <label className="font-medium" htmlFor={`${id}-content`}>
        {path === "" ? t("compModules.script") : <span className="font-mono">{path}</span>}
      </label>
      <textarea
        id={`${id}-content`}
        value={content}
        onChange={(event) => {
          setDraft(event.target.value);
        }}
        rows={22}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        wrap="off"
        className={AREA}
      />
      {module.kind === "directory" && (
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={entry || executable}
            disabled={entry}
            onChange={(event) => {
              setExecutable(event.target.checked);
            }}
          />
          {t("compModules.executable")}
          {entry && (
            <span className="text-ink-muted">({t("compModules.edit.entryExecutable")})</span>
          )}
        </label>
      )}
      <label className="flex flex-col gap-1" htmlFor={`${id}-message`}>
        <span className="font-medium">{t("compModules.fields.message")}</span>
        <input
          id={`${id}-message`}
          value={message}
          onChange={(event) => {
            setMessage(event.target.value);
          }}
          placeholder={t("compModules.edit.messagePlaceholder", {
            path: path === "" ? module.name : path,
          })}
          className={INPUT}
        />
      </label>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="h-8 rounded-(--radius-control) bg-accent px-3 font-medium text-accent-ink disabled:opacity-60"
        >
          {pending ? t("compModules.edit.saving") : t("compModules.edit.save")}
        </button>
        <button type="button" onClick={onCancel} className="text-accent hover:underline">
          {t("detail.cancel")}
        </button>
      </div>
    </form>
  );
}
