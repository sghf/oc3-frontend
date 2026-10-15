import { useQuery } from "@tanstack/react-query";
import type { components } from "@/lib/api/schema";
import { api } from "@/lib/api/client";

export type AssistantConversation = components["schemas"]["AssistantConversation"];
export type AssistantMessage = components["schemas"]["AssistantMessage"];
export type AssistantStreamEvent = components["schemas"]["AssistantStreamEvent"];
export type AssistantConfirmation = components["schemas"]["AssistantConfirmation"];
export type AssistantFeedback = components["schemas"]["AssistantFeedback"];
export type AssistantFeedbackRequest = components["schemas"]["AssistantFeedbackRequest"];
export type AssistantFeedbackReason = components["schemas"]["AssistantFeedbackReason"];
type AssistantError = components["schemas"]["AssistantError"];

/** An error of the assistant: the agent's or the relay's, with its stable code. */
export class AssistantFailure extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function failure(error: AssistantError | undefined, status: number): AssistantFailure {
  return new AssistantFailure(
    error?.error.code ?? "unknown",
    error?.error.message ?? `HTTP ${String(status)}`,
    status,
  );
}

/** Whether the assistant is configured, and whether the user can use it now. */
export function useAssistantStatus() {
  return useQuery({
    queryKey: ["assistant", "status"],
    queryFn: async () => {
      const { data, error } = await api.GET("/assistant/status");
      if (error !== undefined) throw new Error("status");
      return data;
    },
  });
}

/** The user's conversations, the most recently updated first. */
export function useConversations(enabled: boolean) {
  return useQuery({
    queryKey: ["assistant", "conversations"],
    enabled,
    queryFn: async () => {
      const { data, error, response } = await api.GET("/assistant/conversations");
      if (error !== undefined) throw failure(error, response.status);
      return data.conversations;
    },
  });
}

/** The stored messages of a conversation, in chronological order (one page). */
export function useMessages(conversationId: string | null) {
  return useQuery({
    queryKey: ["assistant", "messages", conversationId],
    enabled: conversationId !== null,
    queryFn: async () => {
      const { data, error, response } = await api.GET(
        "/assistant/conversations/{conversation_id}/messages",
        { params: { path: { conversation_id: conversationId ?? "" }, query: { limit: 100 } } },
      );
      if (error !== undefined) throw failure(error, response.status);
      return data;
    },
  });
}

export async function createConversation(): Promise<AssistantConversation> {
  const { data, error, response } = await api.POST("/assistant/conversations");
  if (error !== undefined) throw failure(error, response.status);
  return data.conversation;
}

export async function deleteConversation(id: string): Promise<void> {
  const { error, response } = await api.DELETE("/assistant/conversations/{conversation_id}", {
    params: { path: { conversation_id: id } },
  });
  if (error !== undefined) throw failure(error, response.status);
}

export async function renameConversation(id: string, title: string): Promise<void> {
  const { error, response } = await api.PATCH("/assistant/conversations/{conversation_id}", {
    params: { path: { conversation_id: id } },
    body: { title },
  });
  if (error !== undefined) throw failure(error, response.status);
}

/** The action a conversation waits a decision on, if any. */
export async function pendingConfirmation(id: string): Promise<AssistantConfirmation | undefined> {
  const { data, error, response } = await api.GET("/assistant/conversations/{conversation_id}", {
    params: { path: { conversation_id: id } },
  });
  if (error !== undefined) throw failure(error, response.status);
  return data.pending_confirmation;
}

/**
 * Reads a stream of server-sent events, calling `onEvent` with each event of the
 * turn as it arrives: `event: <type>`, then `data: <JSON>`, ended by an empty line.
 */
async function readEvents(
  stream: ReadableStream<Uint8Array>,
  onEvent: (event: AssistantStreamEvent) => void,
): Promise<void> {
  const reader = stream.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let end = buffer.indexOf("\n\n");
    while (end !== -1) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const data = block
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (data !== "") {
        try {
          onEvent(JSON.parse(data) as AssistantStreamEvent);
        } catch {
          // A malformed event is skipped; the turn goes on.
        }
      }
      end = buffer.indexOf("\n\n");
    }
  }
}

/** Sends a prompt and streams the turn, until completed, error or a confirmation. */
export async function streamTurn(
  conversationId: string,
  prompt: string,
  onEvent: (event: AssistantStreamEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const { data, error, response } = await api.POST(
    "/assistant/conversations/{conversation_id}/turns",
    {
      params: { path: { conversation_id: conversationId } },
      body: { prompt },
      parseAs: "stream",
      signal,
    },
  );
  if (error !== undefined || data === null || data === undefined) {
    throw failure(error as AssistantError | undefined, response.status);
  }
  await readEvents(data, onEvent);
}

/** Approves or rejects the action a turn waits on, and streams the rest of the turn. */
export async function streamConfirmation(
  conversationId: string,
  confirmation: AssistantConfirmation,
  decision: "approve" | "reject",
  onEvent: (event: AssistantStreamEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const { data, error, response } = await api.POST(
    "/assistant/conversations/{conversation_id}/turns/{turn_id}/confirmation",
    {
      params: { path: { conversation_id: conversationId, turn_id: confirmation.turn_id } },
      body: { confirmation_id: confirmation.id, decision },
      parseAs: "stream",
      signal,
    },
  );
  if (error !== undefined || data === null || data === undefined) {
    throw failure(error as AssistantError | undefined, response.status);
  }
  await readEvents(data, onEvent);
}

/** Gives or replaces the feedback of the user on a completed turn. */
export async function setFeedback(
  conversationId: string,
  turnId: string,
  feedback: AssistantFeedbackRequest,
): Promise<void> {
  const { error, response } = await api.PUT(
    "/assistant/conversations/{conversation_id}/turns/{turn_id}/feedback",
    { params: { path: { conversation_id: conversationId, turn_id: turnId } }, body: feedback },
  );
  if (error !== undefined) throw failure(error, response.status);
}

/** Withdraws the feedback of the user on a turn. */
export async function deleteFeedback(conversationId: string, turnId: string): Promise<void> {
  const { error, response } = await api.DELETE(
    "/assistant/conversations/{conversation_id}/turns/{turn_id}/feedback",
    { params: { path: { conversation_id: conversationId, turn_id: turnId } } },
  );
  if (error !== undefined) throw failure(error, response.status);
}
