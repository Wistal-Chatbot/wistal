import Link from "next/link";
import { type RunStatus, aiReports, recentRuns } from "@/lib/mock-data";
import { ReportIcon } from "../_components/icons";
import styles from "./ReportsList.module.css";

const runStatusClass: Record<RunStatus, string> = {
  Zakończone: styles.statusDone,
  "W toku": styles.statusPending,
  Błąd: styles.statusError,
};

export function ReportsList() {
  const activeReports = aiReports.filter((r) => r.active);

  return (
    <div className={styles.page}>
      <p className={styles.intro}>
        Ustrukturyzowane raporty generowane przez AI. Wybierz raport, aby uruchomić go
        z parametrami i otrzymać wynik jako wyrenderowany widok.
      </p>

      <div className={styles.grid}>
        {activeReports.map((report) => (
          <div className={styles.reportCard} key={report.id}>
            <div className={styles.cardHead}>
              <span className={styles.cardIcon}>
                <ReportIcon size={18} stroke="#1E2188" />
              </span>
              <div className={styles.cardName}>{report.name}</div>
            </div>
            <div className={styles.cardDesc}>{report.desc}</div>
            <Link className={styles.runButton} href={`/app/reports/${report.id}/run`}>
              Uruchom raport
            </Link>
          </div>
        ))}
      </div>

      <div className={styles.recentCard}>
        <div className={styles.recentHead}>Ostatnie uruchomienia</div>
        <table className={styles.recentTable}>
          <tbody>
            {recentRuns.map((run, i) => (
              <tr key={i} className={styles.recentRow}>
                <td className={styles.runTitle}>
                  <Link className={styles.runLink} href={`/app/reports/${run.reportId}/run`}>
                    {run.title}
                  </Link>
                </td>
                <td className={styles.runDate}>{run.date}</td>
                <td className={styles.runUser}>{run.user}</td>
                <td className={styles.runStatusCell}>
                  <span className={`${styles.status} ${runStatusClass[run.status]}`}>
                    {run.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
