import { OutlookApp } from "./OutlookApp";

/**
 * Task-pane entry. Rendering is delegated to the client `OutlookApp`, which
 * waits for `Office.onReady()`, checks the stored Bearer token, and shows either
 * the login step or the chat pane.
 */
export default function Page() {
  return <OutlookApp />;
}
