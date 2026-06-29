import Link from "next/link";
import { type Tone, auditReport } from "@/lib/mock-data";
import { ChevronLeft, CommentIcon, RefreshIcon } from "../_components/icons";
import styles from "./ReportResult.module.css";

const barColor: Record<Tone, string> = {
  good: "#2f7d5b",
  warn: "#c9962b",
  bad: "#b4402e",
};

const valueColor: Record<Tone, string> = {
  good: "#1f6b4a",
  warn: "#9a6a18",
  bad: "#b4402e",
};

export function ReportResult({ reportId }: { reportId?: string }) {
  const report = auditReport;
  const ring = `conic-gradient(#1E2188 0% ${report.scorePct}%, #e7eaef ${report.scorePct}% 100%)`;
  const rerunHref = `/app/reports/${reportId ?? report.reportId}/run`;

  return (
    <div className={styles.page}>
      <Link className={styles.backLink} href="/app/reports">
        <ChevronLeft size={15} />
        Wszystkie raporty
      </Link>

      <div className={styles.card}>
        <div className={styles.cardHead}>
          <div className={styles.scoreRing} style={{ background: ring }}>
            <div className={styles.scoreInner}>
              <span className={styles.scoreValue}>{report.score}</span>
              <span className={styles.scoreMax}>/ {report.scoreMax}</span>
            </div>
          </div>
          <div className={styles.headInfo}>
            <div className={styles.headEyebrow}>{report.eyebrow}</div>
            <div className={styles.headCompany}>{report.company}</div>
            <div className={styles.headMeta}>{report.meta}</div>
          </div>
          <div className={styles.headActions}>
            <span className={styles.riskBadge}>{report.riskLabel}</span>
            <button type="button" className={styles.ghostButton}>
              Pobierz PDF
            </button>
          </div>
        </div>

        <div className={styles.split}>
          <div className={styles.splitLeft}>
            <div className={styles.sectionLabel}>OCENA RYZYKA</div>
            <div className={styles.riskBars}>
              {report.riskBars.map((bar) => (
                <div key={bar.label}>
                  <div className={styles.riskRow}>
                    <span>{bar.label}</span>
                    <span style={{ color: valueColor[bar.tone] }}>{bar.valueLabel}</span>
                  </div>
                  <div className={styles.riskTrack}>
                    <div
                      className={styles.riskFill}
                      style={{ width: `${bar.pct}%`, background: barColor[bar.tone] }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.splitRight}>
            <div className={styles.sectionLabel}>DANE FINANSOWE</div>
            <table className={styles.finTable}>
              <thead>
                <tr>
                  <th className={styles.finThLeft}>ROK</th>
                  <th className={styles.finThRight}>PRZYCHÓD</th>
                  <th className={styles.finThRight}>ZYSK</th>
                </tr>
              </thead>
              <tbody>
                {report.financials.map((row) => (
                  <tr key={row.year} className={styles.finRow}>
                    <td className={styles.finYear}>{row.year}</td>
                    <td className={styles.finRevenue}>{row.revenue}</td>
                    <td
                      className={styles.finProfit}
                      style={{ color: valueColor[row.profitTone] }}
                    >
                      {row.profit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className={styles.finSource}>{report.financialsSource}</div>
          </div>
        </div>

        <div className={styles.recommendation}>
          <div className={styles.sectionLabel}>REKOMENDACJA AI</div>
          <p className={styles.recText}>
            {report.recommendation.map((seg, i) => (
              <span key={i} style={seg.bold ? { fontWeight: 700 } : undefined}>
                {seg.text}
              </span>
            ))}
          </p>
        </div>
      </div>

      <div className={styles.footer}>
        <div className={styles.footMeta}>
          Czas generowania: {report.genTime} · Tabele: {report.tables}
        </div>
        <div className={styles.footActions}>
          <button type="button" className={styles.ghostButton}>
            <CommentIcon size={14} />
            Dodaj komentarz
          </button>
          <Link className={styles.ghostButton} href={rerunHref}>
            <RefreshIcon size={14} />
            Uruchom ponownie
          </Link>
        </div>
      </div>
    </div>
  );
}
