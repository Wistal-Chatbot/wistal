/**
 * UI-shaped chat types the chat feature renders. They now live in the shared
 * `lib/api/chat-stream` module (also consumed by the Outlook task pane) and are
 * re-exported here so `ChatView` / `chatApi` keep their local `./types` import.
 */

export type {
  UiSource,
  UiMetrics,
  UiMessage,
  UiSession,
} from "@/lib/api/chat-stream";
