import type { Metadata } from "next";
import type { ReactNode } from "react";
import Script from "next/script";

import styles from "./layout.module.css";

/**
 * Minimal layout for the Outlook task pane. It lives in its own `app/outlook`
 * segment — a sibling of `/app`, so it doesn't inherit the dashboard's sidebar
 * shell or its `/app` auth guard (the pane authenticates itself with a Bearer
 * token). It loads Office.js from the CDN scoped to this route only. IBM Plex
 * fonts + the design tokens come from the root layout / `globals.css`.
 */

export const metadata: Metadata = {
  title: "Wistal ERP — Asystent Outlook",
  description: "Asystent ERP Wistal w panelu bocznym Outlooka.",
};

export default function OutlookLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.root}>
      {children}
      <Script
        src="https://appsforoffice.microsoft.com/lib/1/hosted/office.js"
        strategy="afterInteractive"
      />
    </div>
  );
}
