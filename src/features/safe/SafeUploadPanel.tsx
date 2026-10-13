import { useEffect, useId, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { SlideOver } from "@/components/ui/SlideOver";
import { ObjectIcon } from "@/components/opensvc/ObjectIcon";
import { formatBytes, uploadSafeFile } from "./use-safe";

const INPUT = "h-8 w-full rounded-(--radius-control) border border-line bg-surface px-2";

/**
 * The form sending a file to the safe: a new file, or a new version of `fileId`,
 * which keeps its id, so that the safe:// references keep naming it. The name to
 * tell the file by is the uploaded file's own by default.
 */
export function SafeUploadForm({
  fileId,
  currentName,
  onUploaded,
  onCancel,
}: {
  fileId?: string;
  /** The name of the file a new version is for: kept unless another is typed. */
  currentName?: string;
  onUploaded: (id: number | undefined) => void;
  onCancel?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const ids = useId();
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");

  const upload = useMutation({
    mutationFn: () => {
      if (file === null) throw new Error(t("safe.upload.noFile"));
      return uploadSafeFile(file, name, fileId);
    },
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({ queryKey: ["safe"] });
      setFile(null);
      setName("");
      onUploaded(id);
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    upload.mutate();
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
      <div>
        <label className="mb-1 block font-medium" htmlFor={`${ids}-file`}>
          {t("safe.upload.file")}
          <span className="text-state-down" aria-hidden="true">
            {" "}
            *
          </span>
          <span className="sr-only"> ({t("tags.create.required")})</span>
        </label>
        <input
          id={`${ids}-file`}
          type="file"
          required
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
          }}
          className="block w-full text-ink file:mr-3 file:h-8 file:rounded-(--radius-control) file:border file:border-line file:bg-surface file:px-3 file:text-ink"
        />
        {file !== null && (
          <p className="mt-1 text-ink-muted">
            {file.name} · {formatBytes(file.size, i18n.language)}
          </p>
        )}
      </div>
      <div>
        <label className="mb-1 block font-medium" htmlFor={`${ids}-name`}>
          {t("safe.fields.name")}
        </label>
        <input
          id={`${ids}-name`}
          autoComplete="off"
          value={name}
          placeholder={currentName ?? file?.name ?? ""}
          onChange={(event) => {
            setName(event.target.value);
          }}
          aria-describedby={`${ids}-name-hint`}
          className={INPUT}
        />
        <p id={`${ids}-name-hint`} className="mt-1 text-ink-muted">
          {fileId === undefined ? t("safe.upload.nameHint") : t("safe.upload.versionNameHint")}
        </p>
      </div>
      {upload.isError && (
        <p role="alert" className="text-state-down">
          ■ {upload.error.message}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {onCancel !== undefined && (
          <button
            type="button"
            onClick={onCancel}
            disabled={upload.isPending}
            className="h-8 rounded-(--radius-control) border border-line px-3"
          >
            {t("detail.cancel")}
          </button>
        )}
        <button
          type="submit"
          disabled={upload.isPending || file === null}
          className="h-8 rounded-(--radius-control) bg-accent px-3 font-medium text-accent-ink disabled:opacity-60"
        >
          {upload.isPending
            ? t("safe.upload.uploading")
            : fileId === undefined
              ? t("safe.upload.submit")
              : t("safe.upload.submitVersion")}
        </button>
      </div>
    </form>
  );
}

/** Uploading a new file into the safe, in a drawer of its own. */
export function SafeUploadPanel({
  open,
  onClose,
  onUploaded,
}: {
  open: boolean;
  onClose: () => void;
  onUploaded: (id: number | undefined) => void;
}) {
  const { t } = useTranslation();
  // Every opening starts from an empty form.
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    if (open) setGeneration((g) => g + 1);
  }, [open]);
  return (
    <SlideOver
      open={open}
      title={t("safe.upload.title")}
      onClose={onClose}
      closeLabel={t("detail.close")}
      resizeLabel={t("detail.resize")}
      leading={<ObjectIcon kind="safe" />}
    >
      <p className="mb-3 text-ink-muted">{t("safe.upload.intro")}</p>
      <SafeUploadForm
        key={generation}
        onUploaded={(id) => {
          onClose();
          onUploaded(id);
        }}
      />
    </SlideOver>
  );
}
