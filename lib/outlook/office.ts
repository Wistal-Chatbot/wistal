/**
 * Thin, defensive wrapper over the tiny slice of the Office.js API the task pane
 * uses (read-mode Outlook): waiting for the host, reading the open message's
 * sender + subject, and refreshing that when a pinned pane switches messages.
 *
 * Office.js is loaded from the CDN by `app/outlook/layout.tsx`, so everything
 * here is browser-only and reads `window.Office` lazily. We ship a minimal
 * ambient typing (below) instead of depending on `@types/office-js`.
 */

export interface EmailContext {
  fromName: string;
  fromEmail: string;
  subject: string;
}

interface OfficeItem {
  subject?: string;
  from?: { displayName?: string; emailAddress?: string } | null;
}

interface OfficeMailbox {
  item?: OfficeItem | null;
  addHandlerAsync?: (
    eventType: unknown,
    handler: () => void,
    optionsOrCallback?: unknown,
    callback?: (result: unknown) => void,
  ) => void;
  removeHandlerAsync?: (
    eventType: unknown,
    handler: () => void,
    optionsOrCallback?: unknown,
    callback?: (result: unknown) => void,
  ) => void;
}

interface OfficeReadyInfo {
  host?: unknown;
  platform?: unknown;
}

interface OfficeJs {
  onReady: (
    callback?: (info: OfficeReadyInfo) => void,
  ) => Promise<OfficeReadyInfo>;
  context?: { mailbox?: OfficeMailbox };
  EventType?: { ItemChanged?: unknown };
  HostType?: { Outlook?: unknown };
}

declare global {
  interface Window {
    Office?: OfficeJs;
  }
}

function getOffice(): OfficeJs | null {
  if (typeof window === "undefined") return null;
  return window.Office ?? null;
}

/**
 * Resolves once Office.js has loaded and the host handshake is done. Polls for
 * the `window.Office` global (the CDN script loads shortly after hydration),
 * then awaits `Office.onReady()`. Resolves `{ ready: false }` on timeout — e.g.
 * when the pane is opened in a plain browser during `next dev` — so the panel
 * still renders (just without email context).
 */
export async function whenOfficeReady(
  timeoutMs = 8000,
): Promise<{ ready: boolean; inOutlook: boolean }> {
  if (typeof window === "undefined") return { ready: false, inOutlook: false };

  const start = Date.now();
  while (!getOffice()) {
    if (Date.now() - start > timeoutMs) return { ready: false, inOutlook: false };
    await new Promise((resolve) => setTimeout(resolve, 60));
  }

  const office = getOffice();
  if (!office) return { ready: false, inOutlook: false };

  try {
    const info = await office.onReady();
    const inOutlook = info?.host === office.HostType?.Outlook;
    return { ready: true, inOutlook };
  } catch {
    return { ready: false, inOutlook: false };
  }
}

/** Reads the currently open message's sender + subject, or null if none. */
export function readEmailContext(): EmailContext | null {
  const item = getOffice()?.context?.mailbox?.item;
  if (!item) return null;

  const subject = (item.subject ?? "").trim();
  const fromName = (item.from?.displayName ?? "").trim();
  const fromEmail = (item.from?.emailAddress ?? "").trim();

  // Nothing useful to show (e.g. no message selected) → treat as no context.
  if (!subject && !fromName && !fromEmail) return null;

  return { fromName, fromEmail, subject };
}

/**
 * Registers a handler that fires when a **pinned** pane switches to another
 * message (Mailbox 1.5 `ItemChanged`). Returns an unsubscribe function. A no-op
 * (returning a no-op cleanup) when the host doesn't support pinning.
 */
export function registerItemChanged(handler: () => void): () => void {
  const office = getOffice();
  const mailbox = office?.context?.mailbox;
  const eventType = office?.EventType?.ItemChanged;
  if (!mailbox?.addHandlerAsync || eventType === undefined) {
    return () => {};
  }

  mailbox.addHandlerAsync(eventType, handler);
  return () => {
    mailbox.removeHandlerAsync?.(eventType, handler);
  };
}
