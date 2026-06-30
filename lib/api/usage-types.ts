export type AiUsageStatus =
  | "normal"
  | "warning"
  | "exceeded"
  | "usage_unavailable";

export interface MonthlyAiUsageDto {
  status: AiUsageStatus;
  period: string;
  limitTokens: number | null;
  usedTokens: number | null;
  remainingTokens: number | null;
  percent: number | null;
  warningPercent: number;
  usageAvailable: boolean;
}

export interface MonthlyAiUsageResponse {
  usage: MonthlyAiUsageDto;
}
