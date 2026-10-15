import { useId, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ThumbsDownIcon, ThumbsUpIcon } from "@/components/ui/icons";
import {
  AssistantFailure,
  deleteFeedback,
  setFeedback,
  type AssistantFeedback,
  type AssistantFeedbackReason,
  type AssistantFeedbackRequest,
} from "./use-assistant";

/** The reasons an answer falls short, in the order the agent lists them. */
const REASONS: AssistantFeedbackReason[] = [
  "not_answered",
  "missing_information",
  "incorrect_or_outdated",
  "hard_to_understand",
  "action_not_done",
];

/** What the agent accepts as the expectation of the user. */
const EXPECTED_MAX = 1000;

/**
 * The feedback of the user on an answer of the assistant, under the last message
 * of its turn: helpful or not. A thumb down is sent at once, then the reasons and
 * what was expected may follow, sent as a second, complete feedback; pressing
 * the chosen thumb again withdraws the feedback. The agent keeps the feedback
 * without the identity of the user.
 */
export function AnswerFeedback({
  conversationId,
  turnId,
  feedback,
}: {
  conversationId: string;
  turnId: string;
  feedback: AssistantFeedback | undefined;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const id = useId();
  // The rating on display: the stored one, then the last one sent from here.
  const [rating, setRating] = useState<"up" | "down" | null>(feedback?.rating ?? null);
  const [details, setDetails] = useState(false);
  const [reasons, setReasons] = useState<AssistantFeedbackReason[]>(feedback?.reasons ?? []);
  const [expected, setExpected] = useState(feedback?.expected ?? "");
  const [sent, setSent] = useState<"rating" | "details" | "withdrawn" | null>(null);

  const send = useMutation({
    mutationFn: async (next: AssistantFeedbackRequest | null) => {
      if (next === null) await deleteFeedback(conversationId, turnId);
      else await setFeedback(conversationId, turnId, next);
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["assistant", "messages", conversationId] }),
  });

  function rate(next: "up" | "down") {
    if (send.isPending) return;
    if (rating === next) {
      // The chosen thumb again: the feedback is withdrawn.
      setRating(null);
      setDetails(false);
      setSent("withdrawn");
      send.mutate(null, {
        onError: () => {
          setRating(next);
        },
      });
      return;
    }
    const previous = rating;
    setRating(next);
    setDetails(next === "down");
    if (next === "up") setReasons([]);
    setSent("rating");
    send.mutate(
      { rating: next },
      {
        onError: () => {
          setRating(previous);
        },
      },
    );
  }

  function sendDetails() {
    setSent("details");
    const text = expected.trim();
    send.mutate(
      {
        rating: "down",
        ...(reasons.length > 0 ? { reasons } : {}),
        ...(text !== "" ? { expected: text } : {}),
      },
      {
        onSuccess: () => {
          setDetails(false);
        },
      },
    );
  }

  const thumb =
    "flex h-7 w-7 items-center justify-center rounded-(--radius-control) border border-line text-ink-muted hover:bg-surface-sunken hover:text-ink aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-ink disabled:opacity-60";
  const error = send.error;

  return (
    <div className="flex flex-col gap-2">
      <div role="group" aria-labelledby={`${id}-q`} className="flex flex-wrap items-center gap-1.5">
        <span id={`${id}-q`} className="mr-1 text-ink-muted">
          {t("assistant.feedback.question")}
        </span>
        <button
          type="button"
          aria-pressed={rating === "up"}
          disabled={send.isPending}
          onClick={() => {
            rate("up");
          }}
          title={rating === "up" ? t("assistant.feedback.withdraw") : t("assistant.feedback.up")}
          className={thumb}
        >
          <ThumbsUpIcon className="h-3.5 w-3.5" />
          <span className="sr-only">{t("assistant.feedback.up")}</span>
        </button>
        <button
          type="button"
          aria-pressed={rating === "down"}
          disabled={send.isPending}
          onClick={() => {
            rate("down");
          }}
          title={
            rating === "down" ? t("assistant.feedback.withdraw") : t("assistant.feedback.down")
          }
          className={thumb}
        >
          <ThumbsDownIcon className="h-3.5 w-3.5" />
          <span className="sr-only">{t("assistant.feedback.down")}</span>
        </button>
        {rating === "down" && !details && (
          <button
            type="button"
            onClick={() => {
              setDetails(true);
            }}
            className="text-accent underline-offset-2 hover:underline"
          >
            {t("assistant.feedback.tellMore")}
          </button>
        )}
        <span role="status" className="text-ink-muted">
          {send.isSuccess && sent !== null && t(`assistant.feedback.sent.${sent}`)}
        </span>
      </div>
      {error !== null && (
        <p role="alert" className="text-state-down">
          ■{" "}
          {error instanceof AssistantFailure && error.code === "feedback_limit"
            ? t("assistant.feedback.limit")
            : error instanceof AssistantFailure && error.code === "conversation_expired"
              ? t("assistant.feedback.expired")
              : t("assistant.feedback.failed", { message: error.message })}
        </p>
      )}
      {details && rating === "down" && (
        <fieldset className="flex max-w-xl flex-col gap-2 rounded-(--radius-panel) border border-line p-3">
          <legend className="px-1 font-medium">{t("assistant.feedback.why")}</legend>
          {REASONS.map((reason) => (
            <label key={reason} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={reasons.includes(reason)}
                onChange={(event) => {
                  setReasons((previous) =>
                    event.target.checked
                      ? [...previous, reason]
                      : previous.filter((r) => r !== reason),
                  );
                }}
              />
              {t(`assistant.feedback.reasons.${reason}`)}
            </label>
          ))}
          <label htmlFor={`${id}-expected`} className="mt-1 font-medium">
            {t("assistant.feedback.expected")}
          </label>
          <textarea
            id={`${id}-expected`}
            value={expected}
            maxLength={EXPECTED_MAX}
            rows={3}
            onChange={(event) => {
              setExpected(event.target.value);
            }}
            aria-describedby={`${id}-count`}
            className="rounded-(--radius-control) border border-line bg-surface px-2 py-1"
          />
          <span id={`${id}-count`} className="text-right text-ink-muted">
            {t("assistant.feedback.count", { count: expected.length, max: EXPECTED_MAX })}
          </span>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setDetails(false);
              }}
              className="h-8 rounded-(--radius-control) border border-line px-3 text-ink hover:bg-surface-sunken"
            >
              {t("assistant.feedback.later")}
            </button>
            <button
              type="button"
              disabled={send.isPending || (reasons.length === 0 && expected.trim() === "")}
              onClick={sendDetails}
              className="h-8 rounded-(--radius-control) bg-accent px-3 font-medium text-accent-ink disabled:opacity-60"
            >
              {t("assistant.feedback.send")}
            </button>
          </div>
          <p className="text-ink-muted">{t("assistant.feedback.privacy")}</p>
        </fieldset>
      )}
    </div>
  );
}
