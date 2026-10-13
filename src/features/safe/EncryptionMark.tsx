import { useTranslation } from "react-i18next";
import { KeyIcon } from "@/components/ui/icons";

/**
 * Whether a safe file is encrypted at rest: a key and a word, or a hollow mark and
 * a word, never the colour alone. A key rather than the padlock of the safe itself.
 */
export function EncryptionMark({ encrypted }: { encrypted: boolean }) {
  const { t } = useTranslation();
  return encrypted ? (
    <span className="inline-flex items-center gap-1 text-state-up">
      <KeyIcon className="h-3.5 w-3.5" aria-hidden="true" />
      {t("safe.encryption.encrypted")}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-ink-muted">
      <span aria-hidden="true">○</span>
      {t("safe.encryption.plaintext")}
    </span>
  );
}
