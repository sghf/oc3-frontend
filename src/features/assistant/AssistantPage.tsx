import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { ObjectIcon } from "@/components/opensvc/ObjectIcon";
import { SendIcon, SparklesIcon } from "@/components/ui/icons";

/** A message of the conversation: the user's, or the assistant's. */
interface Message {
  id: number;
  role: "user" | "assistant";
  text: string;
  at: Date;
}

/** The questions the empty conversation suggests, keys of `assistant.suggestions`. */
const SUGGESTIONS = ["servicesDown", "criticalAlerts", "silentNodes", "compliance"] as const;

/** The composer grows with its text up to this many lines, then scrolls. */
const MAX_LINES = 8;

/**
 * The conversation with the AI assistant. Not connected yet: the messages stay in
 * the page, and each one gets a note saying so rather than an answer. The layout is
 * the one the connected assistant will use: the conversation filling the view, the
 * composer at its foot, the questions to start with when it is empty.
 *
 * The assistant will answer with what the user may see in the collector, and ask for
 * a confirmation in this view before any action: the foot of the composer says so.
 */
export function AssistantPage() {
  const { t, i18n } = useTranslation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const nextId = useRef(1);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const inputId = useId();
  const hintId = useId();

  // The latest message stays in sight.
  useEffect(() => {
    const log = logRef.current;
    if (log !== null) log.scrollTop = log.scrollHeight;
  }, [messages]);

  // The composer fits its text, up to MAX_LINES.
  useEffect(() => {
    const input = inputRef.current;
    if (input === null) return;
    input.style.height = "auto";
    const lineHeight = parseFloat(getComputedStyle(input).lineHeight) || 20;
    input.style.height = `${Math.min(input.scrollHeight, lineHeight * MAX_LINES + 16)}px`;
  }, [draft]);

  function send(text: string) {
    const question = text.trim();
    if (question === "") return;
    const now = new Date();
    setMessages((previous) => [
      ...previous,
      { id: nextId.current++, role: "user", text: question, at: now },
      { id: nextId.current++, role: "assistant", text: t("assistant.notConnected"), at: now },
    ]);
    setDraft("");
    inputRef.current?.focus();
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    send(draft);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends, Shift+Enter breaks the line; a composition in progress is left alone.
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send(draft);
    }
  }

  const time = new Intl.DateTimeFormat(i18n.language, { hour: "2-digit", minute: "2-digit" });
  const empty = messages.length === 0;

  return (
    <section className="flex h-[calc(100dvh-2.75rem-2rem)] flex-col gap-3">
      <div className="flex min-h-7 items-center gap-3">
        <h1 className="flex items-center gap-2 text-title font-semibold">
          <ObjectIcon kind="ai" className="h-5 w-5" />
          {t("assistant.title")}
        </h1>
        <span className="rounded-(--radius-pill) border border-line px-2 text-ink-muted">
          {t("assistant.preview")}
        </span>
        {/* Right after the title, as the actions of the other views: the right end
            of this line is where the anchor reopening the side panels stands. */}
        {!empty && (
          <button
            type="button"
            onClick={() => {
              setMessages([]);
              inputRef.current?.focus();
            }}
            className="h-7 rounded-(--radius-control) border border-line px-3 text-ink hover:bg-surface-sunken"
          >
            {t("assistant.newConversation")}
          </button>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-(--radius-panel) border border-line bg-surface-raised">
        <div
          ref={logRef}
          role="log"
          aria-live="polite"
          aria-label={t("assistant.conversation")}
          className="min-h-0 flex-1 overflow-y-auto"
        >
          {empty ? (
            <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center gap-6 px-4 py-8 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent">
                <SparklesIcon className="h-6 w-6" />
              </div>
              <div className="flex flex-col gap-2">
                <h2 className="text-title font-semibold text-balance">
                  {t("assistant.empty.title")}
                </h2>
                <p className="max-w-prose text-ink-muted">{t("assistant.empty.intro")}</p>
              </div>
              <ul
                className="grid w-full gap-2 sm:grid-cols-2"
                aria-label={t("assistant.empty.suggestions")}
              >
                {SUGGESTIONS.map((key) => (
                  <li key={key}>
                    <button
                      type="button"
                      onClick={() => {
                        setDraft(t(`assistant.suggestions.${key}`));
                        inputRef.current?.focus();
                      }}
                      className="h-full w-full rounded-(--radius-panel) border border-line bg-surface px-3 py-2.5 text-left text-ink transition-colors hover:border-accent hover:bg-accent-soft focus-visible:border-accent"
                    >
                      {t(`assistant.suggestions.${key}`)}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <ol className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6">
              {messages.map((message) =>
                message.role === "user" ? (
                  <li key={message.id} className="flex flex-col items-end gap-1">
                    <span className="sr-only">{t("assistant.you")}</span>
                    <p className="max-w-[85%] rounded-(--radius-panel) rounded-br-(--radius-control) bg-accent-soft px-3 py-2 whitespace-pre-wrap text-ink">
                      {message.text}
                    </p>
                    <time dateTime={message.at.toISOString()} className="text-ink-muted">
                      {time.format(message.at)}
                    </time>
                  </li>
                ) : (
                  <li key={message.id} className="flex gap-3">
                    <div
                      aria-hidden="true"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent"
                    >
                      <SparklesIcon className="h-4 w-4" />
                    </div>
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="font-medium">{t("assistant.name")}</span>
                      <p className="flex items-start gap-1.5 text-ink-muted">
                        <span aria-hidden="true">○</span>
                        {message.text}
                      </p>
                    </div>
                  </li>
                ),
              )}
            </ol>
          )}
        </div>

        <form onSubmit={onSubmit} className="border-t border-line bg-surface p-3">
          <div className="mx-auto max-w-3xl">
            <label htmlFor={inputId} className="sr-only">
              {t("assistant.composer.label")}
            </label>
            <div className="flex items-end gap-2 rounded-(--radius-panel) border border-line bg-surface-raised p-2 focus-within:border-accent">
              <textarea
                id={inputId}
                ref={inputRef}
                rows={1}
                value={draft}
                placeholder={t("assistant.composer.placeholder")}
                aria-describedby={hintId}
                onChange={(event) => {
                  setDraft(event.target.value);
                }}
                onKeyDown={onKeyDown}
                className="max-h-56 min-h-8 flex-1 resize-none bg-transparent px-1 py-1 leading-6 text-ink outline-none placeholder:text-ink-muted"
              />
              <button
                type="submit"
                disabled={draft.trim() === ""}
                aria-label={t("assistant.composer.send")}
                title={t("assistant.composer.send")}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink disabled:opacity-40"
              >
                <SendIcon className="h-4 w-4" />
              </button>
            </div>
            <p
              id={hintId}
              className="mt-1.5 flex flex-wrap justify-between gap-x-4 gap-y-1 text-ink-muted"
            >
              <span>{t("assistant.composer.scope")}</span>
              <span>{t("assistant.composer.keys")}</span>
            </p>
          </div>
        </form>
      </div>
    </section>
  );
}
