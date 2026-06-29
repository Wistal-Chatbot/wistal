import type { AiUsage } from "./types";

/** AI usage figures for the topbar badge + popover. Mirrors the prototype. */
export const aiUsage: AiUsage = {
  percent: 68,
  period: "Czerwiec 2026",
  usedTokens: "1 360 000",
  totalTokens: "2 000 000",
  queriesToday: "1 284",
  monthlyCost: "2 140 zł",
  topUsers: [
    { name: "A. Nowak · Handel", tokens: "312k" },
    { name: "J. Kowalski · Handel", tokens: "268k" },
    { name: "M. Wójcik · Magazyn", tokens: "154k" },
  ],
};
