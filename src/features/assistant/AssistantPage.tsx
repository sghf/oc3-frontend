import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Markdown } from "@/components/ui/Markdown";
import { YamlCode } from "@/components/ui/YamlCode";
import { AnswerFeedback } from "./AnswerFeedback";
import { ObjectIcon } from "@/components/opensvc/ObjectIcon";
import { RelativeTime } from "@/components/ui/RelativeTime";
import { SendIcon, SparklesIcon, TrashIcon } from "@/components/ui/icons";
import {
  AssistantFailure,
  createConversation,
  deleteConversation,
  pendingConfirmation,
  streamDecision,
  streamPrompt,
  useAssistantStatus,
  useConversations,
  useMessages,
  type AssistantConfirmation,
  type AssistantInterrupt,
  type AssistantRunEvent,
} from "./use-assistant";
import { dateTimeFormat } from "@/lib/date-format";
import { formatRelativeInstant } from "@/lib/format";
import { useNow } from "@/lib/use-now";

/** The questions the empty conversation suggests, keys of `assistant.suggestions`. */
const SUGGESTIONS = ["servicesDown", "criticalAlerts", "silentNodes", "compliance"] as const;

/** The composer grows with its text up to this many lines, then scrolls. */
const MAX_LINES = 8;

/** A tool the agent called during the turn on display, with its JSON arguments as streamed. */
interface ToolActivity {
  id: string;
  name: string;
  args: string;
  done: boolean;
  failed: boolean;
}

/** The turn being streamed, shown after the stored messages until it is stored. */
interface LiveTurn {
  prompt: string;
  answer: string;
  tools: ToolActivity[];
  streaming: boolean;
  /** RUN_FINISHED or RUN_ERROR came: a stream ending without either was cut off. */
  ended: boolean;
  error: string | null;
  confirmation: AssistantConfirmation | null;
}

const newTurn = (prompt: string): LiveTurn => ({
  prompt,
  answer: "",
  tools: [],
  streaming: true,
  ended: false,
  error: null,
  confirmation: null,
});

/** Whether the JSON result of a tool tells an error, as an MCP result does with isError. */
function toolFailed(content: string | undefined): boolean {
  try {
    const result: unknown = JSON.parse(content ?? "");
    return (
      typeof result === "object" &&
      result !== null &&
      (result as { isError?: unknown }).isError === true
    );
  } catch {
    return false;
  }
}

/**
 * The confirmation of an interrupt: the tool and the exact arguments of its call,
 * those of its TOOL_CALL_ARGS, never the text of the model, which may describe it
 * otherwise. Arguments that do not read as JSON are shown as they came.
 */
function confirmationOf(
  interrupt: AssistantInterrupt,
  tools: ToolActivity[],
): AssistantConfirmation {
  const call = tools.find((tool) => tool.id === interrupt.toolCallId);
  let args: unknown = call?.args ?? "";
  try {
    args = JSON.parse(call?.args ?? "");
  } catch {
    // Kept as the text streamed.
  }
  const metadata = interrupt.metadata;
  return {
    id: interrupt.id,
    turn_id: metadata?.turnId ?? "",
    tool: metadata?.tool ?? { name: call?.name ?? "", title: call?.name ?? "", destructive: true },
    arguments: args,
    argument_types: metadata?.argumentTypes,
    expires_at: interrupt.expiresAt ?? "",
  };
}

function errorText(t: (key: string) => string, err: unknown): string {
  if (err instanceof DOMException && err.name === "AbortError")
    return t("assistant.errors.stopped");
  if (err instanceof AssistantFailure) {
    if (err.code === "assistant_token_unavailable") return t("assistant.errors.token");
    if (err.code === "assistant_unreachable") return t("assistant.errors.unreachable");
    return err.message;
  }
  return t("assistant.errors.unknown");
}

/**
 * The conversation with the AI assistant: the user's conversations in a column,
 * the one open with its history, and the turn in progress streamed as the agent
 * writes it, with the tools it calls. oc3 relays every request to the agent with
 * the user's access token (`/api/assistant/...`): nothing goes from the browser to
 * the agent directly.
 *
 * The assistant answers from what the user may see, and asks in this view before
 * any action: an action waiting a decision shows its exact arguments, with
 * Approve and Reject.
 */
export function AssistantPage() {
  const { t } = useTranslation();
  const status = useAssistantStatus();
  const available = status.data?.available === true;

  return (
    <section className="flex h-[calc(100dvh-2.75rem-2rem)] flex-col gap-3">
      <div className="flex min-h-7 items-center gap-3">
        <h1 className="flex items-center gap-2 text-title font-semibold">
          <ObjectIcon kind="ai" className="h-5 w-5" />
          {t("assistant.title")}
        </h1>
      </div>
      {status.isPending ? (
        <p className="text-ink-muted">{t("detail.loading")}</p>
      ) : !available ? (
        <Unavailable reason={status.data?.reason ?? "disabled"} />
      ) : (
        <Assistant />
      )}
    </section>
  );
}

/** Why the assistant cannot be used, in the frame the conversation would take. */
function Unavailable({ reason }: { reason: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 rounded-(--radius-panel) border border-line bg-surface-raised p-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent">
        <SparklesIcon className="h-6 w-6" />
      </div>
      <p role="status" className="max-w-prose text-ink-muted">
        <span aria-hidden="true">○ </span>
        {t(`assistant.unavailable.${reason}`)}
      </p>
    </div>
  );
}

function Assistant() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const conversations = useConversations(true);
  const [selected, setSelected] = useState<string | null>(null);
  // The conversation on display is remounted when the user opens one, not when
  // its first prompt creates it: that would stop the turn being streamed.
  const [opened, setOpened] = useState(0);
  const open = (id: string | null) => {
    setSelected(id);
    setOpened((n) => n + 1);
  };
  const [deleting, setDeleting] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  async function remove(id: string) {
    setListError(null);
    try {
      await deleteConversation(id);
      if (selected === id) open(null);
      await queryClient.invalidateQueries({ queryKey: ["assistant", "conversations"] });
    } catch (err) {
      setListError(errorText(t, err));
    } finally {
      setDeleting(null);
    }
  }

  const titleOf = (title: string) => (title === "" ? t("assistant.untitled") : title);

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 md:grid-cols-[15rem_1fr]">
      <nav
        aria-label={t("assistant.conversations")}
        className="flex min-h-0 flex-col gap-2 overflow-hidden rounded-(--radius-panel) border border-line bg-surface-raised p-2 max-md:hidden"
      >
        <button
          type="button"
          onClick={() => {
            open(null);
          }}
          className="flex h-8 items-center justify-center gap-1.5 rounded-(--radius-control) border border-line px-3 text-ink hover:bg-surface-sunken"
        >
          <SparklesIcon className="h-3.5 w-3.5 text-accent" />
          {t("assistant.newConversation")}
        </button>
        {listError !== null && (
          <p role="alert" className="text-state-down">
            ■ {listError}
          </p>
        )}
        <ul className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
          {conversations.isPending && (
            <li className="px-2 text-ink-muted">{t("detail.loading")}</li>
          )}
          {conversations.isError && (
            <li role="alert" className="px-2 text-state-down">
              ■ {errorText(t, conversations.error)}
            </li>
          )}
          {conversations.data?.length === 0 && (
            <li className="px-2 text-ink-muted">{t("assistant.noConversation")}</li>
          )}
          {conversations.data?.map((conversation) => (
            <li key={conversation.id} className="group relative">
              <button
                type="button"
                aria-current={conversation.id === selected ? "true" : undefined}
                onClick={() => {
                  open(conversation.id);
                }}
                className="flex w-full flex-col items-start rounded-(--radius-control) px-2 py-1.5 pr-8 text-left hover:bg-surface-sunken aria-[current=true]:bg-accent-soft"
              >
                <span className="w-full truncate">{titleOf(conversation.title)}</span>
                <span className="text-ink-muted">
                  <RelativeTime value={conversation.updated_at} locale={i18n.language} />
                </span>
              </button>
              {deleting === conversation.id ? (
                <span className="absolute top-1 right-1 flex gap-1 rounded-(--radius-control) bg-surface-raised p-0.5 shadow">
                  <button
                    type="button"
                    onClick={() => {
                      void remove(conversation.id);
                    }}
                    className="h-6 rounded-(--radius-control) bg-state-down px-2 text-accent-ink"
                  >
                    {t("detail.delete")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDeleting(null);
                    }}
                    className="h-6 rounded-(--radius-control) border border-line px-2"
                  >
                    {t("detail.cancel")}
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  aria-label={t("assistant.deleteConversation", {
                    title: titleOf(conversation.title),
                  })}
                  title={t("assistant.deleteConversation", { title: titleOf(conversation.title) })}
                  onClick={() => {
                    setDeleting(conversation.id);
                  }}
                  className="absolute top-1.5 right-1 flex h-6 w-6 items-center justify-center rounded-(--radius-control) text-ink-muted opacity-0 group-hover:opacity-100 hover:bg-surface-sunken hover:text-ink focus-visible:opacity-100"
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      </nav>
      <Conversation
        key={opened}
        conversationId={selected}
        onCreated={(id) => {
          setSelected(id);
        }}
      />
    </div>
  );
}

/** One conversation: its history, the turn in progress, and the composer. */
function Conversation({
  conversationId,
  onCreated,
}: {
  conversationId: string | null;
  onCreated: (id: string) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [id, setId] = useState(conversationId);
  const history = useMessages(id);
  const [live, setLive] = useState<LiveTurn | null>(null);
  const [draft, setDraft] = useState("");
  const abort = useRef<AbortController | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const inputId = useId();
  const hintId = useId();

  // An action waiting a decision when the conversation opens.
  useEffect(() => {
    if (conversationId === null) return;
    let cancelled = false;
    void pendingConfirmation(conversationId)
      .then((confirmation) => {
        if (!cancelled && confirmation !== undefined)
          setLive({ ...newTurn(""), streaming: false, ended: true, confirmation });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  // The latest message stays in sight.
  useEffect(() => {
    const log = logRef.current;
    if (log !== null) log.scrollTop = log.scrollHeight;
  }, [history.data, live]);

  // The composer fits its text, up to MAX_LINES.
  useEffect(() => {
    const input = inputRef.current;
    if (input === null) return;
    input.style.height = "auto";
    const lineHeight = parseFloat(getComputedStyle(input).lineHeight) || 20;
    input.style.height = `${String(Math.min(input.scrollHeight, lineHeight * MAX_LINES + 16))}px`;
  }, [draft]);

  // A turn still streaming when the conversation is left stops.
  useEffect(
    () => () => {
      abort.current?.abort();
    },
    [],
  );

  function onEvent(event: AssistantRunEvent) {
    setLive((turn) => {
      if (turn === null) return turn;
      switch (event.type) {
        case "TEXT_MESSAGE_START":
          // One message per answer of the model: the next one starts a paragraph.
          return turn.answer === "" ? turn : { ...turn, answer: `${turn.answer}\n\n` };
        case "TEXT_MESSAGE_CONTENT":
          return { ...turn, answer: turn.answer + (event.delta ?? "") };
        case "TOOL_CALL_START":
          return {
            ...turn,
            tools: [
              ...turn.tools,
              {
                id: event.toolCallId ?? "",
                name: event.toolCallName ?? "",
                args: "",
                done: false,
                failed: false,
              },
            ],
          };
        case "TOOL_CALL_ARGS":
          return {
            ...turn,
            tools: turn.tools.map((tool) =>
              tool.id === event.toolCallId
                ? { ...tool, args: tool.args + (event.delta ?? "") }
                : tool,
            ),
          };
        case "TOOL_CALL_RESULT":
          return {
            ...turn,
            tools: turn.tools.map((tool) =>
              tool.id === event.toolCallId
                ? { ...tool, done: true, failed: toolFailed(event.content) }
                : tool,
            ),
          };
        case "RUN_FINISHED": {
          const outcome = event.outcome;
          const interrupt = outcome?.type === "interrupt" ? outcome.interrupts?.[0] : undefined;
          if (interrupt !== undefined)
            return {
              ...turn,
              streaming: false,
              ended: true,
              confirmation: confirmationOf(interrupt, turn.tools),
            };
          // Calls of tools of the interface, which this interface does not offer.
          if ((outcome?.pendingToolCallIds ?? []).length > 0)
            return {
              ...turn,
              streaming: false,
              ended: true,
              error: t("assistant.errors.clientTools"),
            };
          return { ...turn, streaming: false, ended: true };
        }
        case "RUN_ERROR":
          return {
            ...turn,
            streaming: false,
            ended: true,
            error:
              event.code === "tool_call_limit"
                ? t("assistant.errors.toolCallLimit")
                : event.code === "request_timeout"
                  ? t("assistant.errors.timeout")
                  : t("assistant.errors.unknown"),
          };
        default:
          // RUN_STARTED, MESSAGES_SNAPSHOT and CUSTOM notes for the developer.
          return turn;
      }
    });
  }

  async function finish(conversation: string) {
    await queryClient.invalidateQueries({ queryKey: ["assistant", "messages", conversation] });
    await queryClient.invalidateQueries({ queryKey: ["assistant", "conversations"] });
    // The stored history now holds the turn, unless it failed or waits a decision.
    setLive((turn) =>
      turn !== null && turn.error === null && turn.confirmation === null ? null : turn,
    );
  }

  async function run(conversation: string, call: (signal: AbortSignal) => Promise<void>) {
    const controller = new AbortController();
    abort.current = controller;
    try {
      await call(controller.signal);
      // A stream ended without RUN_FINISHED nor RUN_ERROR was cut off: the agent
      // does not resume it, and the turn is not stored.
      setLive((turn) =>
        turn === null
          ? turn
          : turn.ended
            ? { ...turn, streaming: false }
            : { ...turn, streaming: false, error: t("assistant.errors.cut") },
      );
      await finish(conversation);
    } catch (err) {
      setLive((turn) =>
        turn === null ? turn : { ...turn, streaming: false, error: errorText(t, err) },
      );
    } finally {
      abort.current = null;
    }
  }

  async function send(text: string) {
    const prompt = text.trim();
    if (prompt === "" || live?.streaming === true) return;
    setDraft("");
    setLive(newTurn(prompt));
    let conversation = id;
    if (conversation === null) {
      try {
        conversation = (await createConversation()).id;
      } catch (err) {
        setLive((turn) =>
          turn === null ? turn : { ...turn, streaming: false, error: errorText(t, err) },
        );
        return;
      }
      setId(conversation);
      onCreated(conversation);
    }
    const target = conversation;
    // The last message this client shows, by which the agent knows it is in phase.
    const stored = history.data?.messages.at(-1);
    const last = stored === undefined ? undefined : { id: stored.id, role: stored.role };
    await run(target, (signal) => streamPrompt(target, prompt, last, onEvent, signal));
  }

  async function decide(decision: "approve" | "reject") {
    const confirmation = live?.confirmation;
    if (id === null || confirmation === null || confirmation === undefined) return;
    setLive((turn) =>
      turn === null
        ? turn
        : { ...turn, confirmation: null, streaming: true, ended: false, error: null },
    );
    const target = id;
    await run(target, (signal) =>
      streamDecision(target, confirmation.id, decision === "approve", onEvent, signal),
    );
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send(draft);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends, Shift+Enter breaks the line; a composition in progress is left alone.
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send(draft);
    }
  }

  const time = dateTimeFormat({ hour: "2-digit", minute: "2-digit" });
  const messages = history.data?.messages ?? [];
  // The feedback goes under the last answer of each turn, which a confirmation
  // may have split.
  const lastOfTurn = new Set<string>();
  for (const turn of new Set(messages.map((m) => m.turn_id))) {
    const last = messages.filter((m) => m.turn_id === turn && m.role === "assistant").at(-1);
    if (last !== undefined) lastOfTurn.add(last.id);
  }
  const empty = messages.length === 0 && live === null && !(id !== null && history.isPending);
  const streaming = live?.streaming === true;
  const showAnswer =
    live !== null &&
    (live.streaming ||
      live.answer !== "" ||
      live.tools.length > 0 ||
      live.error !== null ||
      live.confirmation !== null);

  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-(--radius-panel) border border-line bg-surface-raised">
      <div
        ref={logRef}
        role="log"
        aria-live="polite"
        aria-busy={streaming}
        aria-label={t("assistant.conversation")}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        {id !== null && history.isPending ? (
          <p className="p-4 text-ink-muted">{t("detail.loading")}</p>
        ) : history.isError ? (
          <p role="alert" className="p-4 text-state-down">
            ■ {errorText(t, history.error)}
          </p>
        ) : empty ? (
          <EmptyState
            onPick={(text) => {
              setDraft(text);
              inputRef.current?.focus();
            }}
          />
        ) : (
          <ol className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6">
            {messages.map((message) =>
              message.role === "user" ? (
                <UserMessage
                  key={message.id}
                  text={message.text}
                  at={message.created_at}
                  time={time}
                />
              ) : (
                <AssistantMessage key={message.id}>
                  <Markdown text={message.text} />
                  {id !== null && lastOfTurn.has(message.id) && (
                    <AnswerFeedback
                      conversationId={id}
                      turnId={message.turn_id}
                      feedback={message.feedback}
                    />
                  )}
                </AssistantMessage>
              ),
            )}
            {live !== null && live.prompt !== "" && (
              <UserMessage text={live.prompt} at={new Date().toISOString()} time={time} />
            )}
            {live !== null && showAnswer && (
              <AssistantMessage>
                {live.tools.length > 0 && (
                  <ul className="flex flex-wrap gap-1.5" aria-label={t("assistant.tools")}>
                    {live.tools.map((tool, index) => (
                      <li
                        key={tool.id === "" ? `${tool.name}-${String(index)}` : tool.id}
                        className="inline-flex items-center gap-1 rounded-(--radius-pill) border border-line bg-surface px-2 text-ink-muted"
                      >
                        <span
                          aria-hidden="true"
                          className={
                            tool.failed
                              ? "text-state-down"
                              : tool.done
                                ? "text-state-up"
                                : "animate-pulse"
                          }
                        >
                          {tool.failed ? "■" : tool.done ? "●" : "○"}
                        </span>
                        <span className="font-mono">{tool.name}</span>
                        <span className="sr-only">
                          {t(
                            tool.failed
                              ? "assistant.toolFailed"
                              : tool.done
                                ? "assistant.toolDone"
                                : "assistant.toolRunning",
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {live.answer !== "" && <Markdown text={live.answer} />}
                {live.streaming && live.answer === "" && (
                  <p className="text-ink-muted">
                    <span aria-hidden="true" className="animate-pulse">
                      ○{" "}
                    </span>
                    {t("assistant.thinking")}
                  </p>
                )}
                {live.error !== null && (
                  <p role="alert" className="text-state-down">
                    ■ {live.error}
                  </p>
                )}
                {live.confirmation !== null && (
                  <ConfirmationCard
                    confirmation={live.confirmation}
                    onDecide={(decision) => {
                      void decide(decision);
                    }}
                  />
                )}
              </AssistantMessage>
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
            {streaming ? (
              <button
                type="button"
                onClick={() => {
                  abort.current?.abort();
                }}
                aria-label={t("assistant.composer.stop")}
                title={t("assistant.composer.stop")}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line text-ink hover:bg-surface-sunken"
              >
                <span aria-hidden="true" className="h-3 w-3 rounded-sm bg-current" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={draft.trim() === "" || (live !== null && live.confirmation !== null)}
                aria-label={t("assistant.composer.send")}
                title={t("assistant.composer.send")}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink disabled:opacity-40"
              >
                <SendIcon className="h-4 w-4" />
              </button>
            )}
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
  );
}

function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  const { t } = useTranslation();
  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center gap-6 px-4 py-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent">
        <SparklesIcon className="h-6 w-6" />
      </div>
      <div className="flex flex-col gap-2">
        <h2 className="text-title font-semibold text-balance">{t("assistant.empty.title")}</h2>
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
                onPick(t(`assistant.suggestions.${key}`));
              }}
              className="h-full w-full rounded-(--radius-panel) border border-line bg-surface px-3 py-2.5 text-left text-ink transition-colors hover:border-accent hover:bg-accent-soft focus-visible:border-accent"
            >
              {t(`assistant.suggestions.${key}`)}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function UserMessage({ text, at, time }: { text: string; at: string; time: Intl.DateTimeFormat }) {
  const { t } = useTranslation();
  const date = new Date(at);
  return (
    <li className="flex flex-col items-end gap-1">
      <span className="sr-only">{t("assistant.you")}</span>
      <p className="max-w-[85%] rounded-(--radius-panel) rounded-br-(--radius-control) bg-accent-soft px-3 py-2 whitespace-pre-wrap text-ink">
        {text}
      </p>
      {!Number.isNaN(date.getTime()) && (
        <time dateTime={date.toISOString()} className="text-ink-muted">
          {time.format(date)}
        </time>
      )}
    </li>
  );
}

function AssistantMessage({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <li className="flex gap-3">
      <div
        aria-hidden="true"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent"
      >
        <SparklesIcon className="h-4 w-4" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <span className="font-medium">{t("assistant.name")}</span>
        {children}
      </div>
    </li>
  );
}

/** The MIME types shown as YAML: the registered one and its usual aliases. */
const YAML_TYPES = new Set(["application/yaml", "application/x-yaml", "text/yaml", "text/x-yaml"]);

/**
 * The arguments of an action waiting a decision, one by one under their name,
 * each as its MIME type says (`argument_types`), never as its content looks: YAML
 * as code, coloured, indentation kept; any other text as written, its line breaks
 * and spaces kept; a value other than text as JSON. Arguments that are not an
 * object of named values show as JSON whole.
 */
function ConfirmationArguments({ args, types }: { args: unknown; types: Record<string, string> }) {
  const { t } = useTranslation();
  const box = "rounded-(--radius-control) bg-surface-sunken p-2 font-mono text-data";
  if (typeof args !== "object" || args === null || Array.isArray(args))
    return (
      <pre className={`max-h-80 overflow-auto whitespace-pre-wrap ${box}`}>
        {JSON.stringify(args, null, 2)}
      </pre>
    );
  const entries = Object.entries(args as Record<string, unknown>);
  if (entries.length === 0)
    return <p className="text-ink-muted">{t("assistant.confirmation.noArguments")}</p>;
  return (
    <dl className="flex max-h-96 flex-col gap-2 overflow-auto">
      {entries.map(([name, value]) => {
        const type = types[name];
        const yaml = typeof value === "string" && type !== undefined && YAML_TYPES.has(type);
        return (
          <div key={name} className="flex flex-col gap-0.5">
            <dt className="flex items-baseline gap-2">
              <code className="font-mono font-medium">{name}</code>
              {type !== undefined && <span className="text-data text-ink-muted">{type}</span>}
            </dt>
            <dd>
              {yaml ? (
                <YamlCode text={value} lineNumbers className={`overflow-x-auto ${box}`} />
              ) : (
                <pre className={`break-words whitespace-pre-wrap ${box}`}>
                  {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
                </pre>
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

/** An action waiting the user's decision: what runs, with its exact arguments. */
function ConfirmationCard({
  confirmation,
  onDecide,
}: {
  confirmation: AssistantConfirmation;
  onDecide: (decision: "approve" | "reject") => void;
}) {
  const { t, i18n } = useTranslation();
  const destructive = confirmation.tool.destructive;
  // The confirmation lasts 10 minutes: past its expiry, the call does not run.
  const now = useNow(1000);
  const expiresAt = Date.parse(confirmation.expires_at);
  const expired = !Number.isNaN(expiresAt) && expiresAt <= now;
  return (
    <div
      role="group"
      aria-label={t("assistant.confirmation.label")}
      className={`flex flex-col gap-2 rounded-(--radius-panel) border p-3 ${destructive ? "border-state-down" : "border-state-warn"}`}
    >
      <p className="font-medium">
        <span aria-hidden="true" className={destructive ? "text-state-down" : "text-state-warn"}>
          ▲{" "}
        </span>
        {t(destructive ? "assistant.confirmation.destructive" : "assistant.confirmation.question", {
          title: confirmation.tool.title,
        })}
      </p>
      <ConfirmationArguments
        args={confirmation.arguments}
        types={confirmation.argument_types ?? {}}
      />
      {!Number.isNaN(expiresAt) && (
        <p className={expired ? "text-state-down" : "text-ink-muted"}>
          {expired
            ? `■ ${t("assistant.confirmation.expired")}`
            : t("assistant.confirmation.expires", {
                when: formatRelativeInstant(expiresAt, i18n.language, now),
              })}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={expired}
          onClick={() => {
            onDecide("approve");
          }}
          className={`h-8 rounded-(--radius-control) px-3 font-medium text-accent-ink ${destructive ? "bg-state-down" : "bg-accent"}`}
        >
          {t("assistant.confirmation.approve")}
        </button>
        <button
          type="button"
          autoFocus
          onClick={() => {
            onDecide("reject");
          }}
          className="h-8 rounded-(--radius-control) border border-line px-3"
        >
          {t("assistant.confirmation.reject")}
        </button>
      </div>
    </div>
  );
}
