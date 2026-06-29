"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  type TableDef,
  type TableRecord,
  badgeColorsFor,
  erpTables,
} from "@/lib/mock-data";
import { ChatIcon, CloseIcon, DownloadIcon, SearchIcon } from "../_components/icons";
import styles from "./DataBrowser.module.css";

const ALL = "Wszystkie";

function cellText(value: TableRecord[string]): string {
  return value == null ? "" : String(value);
}

export function DataBrowser() {
  const router = useRouter();
  const [tableKey, setTableKey] = useState<string>("towary");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>(ALL);
  const [menuOpen, setMenuOpen] = useState(false);
  const [detail, setDetail] = useState<{ table: TableDef; record: TableRecord } | null>(null);

  const table = useMemo(
    () => erpTables.find((t) => t.key === tableKey) ?? erpTables[0],
    [tableKey],
  );

  const showChips = table.key === "towary";

  const categories = useMemo(() => {
    if (!showChips) return [];
    const prefixes = Array.from(
      new Set(table.rows.map((r) => cellText(r.kod).slice(0, 3))),
    );
    return [ALL, ...prefixes];
  }, [showChips, table]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return table.rows.filter((r) => {
      const matchesSearch =
        !q || table.columns.some((c) => cellText(r[c.key]).toLowerCase().includes(q));
      const matchesCategory =
        !showChips || category === ALL || cellText(r.kod).startsWith(category);
      return matchesSearch && matchesCategory;
    });
  }, [table, search, category, showChips]);

  function selectTable(key: string) {
    setTableKey(key);
    setMenuOpen(false);
    setSearch("");
    setCategory(ALL);
  }

  function askAboutRecord() {
    if (!detail) return;
    const title = cellText(detail.record[detail.table.columns[0].key]);
    const prompt = `Przeanalizuj rekord ${title} z tabeli ${detail.table.label}. Podaj kluczowe informacje, powiązania i ewentualne ryzyka.`;
    router.push(`/app/chat?prompt=${encodeURIComponent(prompt)}`);
  }

  const detailTitle = detail
    ? cellText(detail.record[detail.table.columns[0].key])
    : "";

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.toolbar}>
          <div className={styles.toolbarRow}>
            <div className={styles.selectorWrap}>
              <button
                type="button"
                className={styles.selector}
                onClick={() => setMenuOpen((v) => !v)}
              >
                <span className={styles.selectorTag}>TABELA:</span>
                {table.label}
                <span className={styles.selectorCaret}>▼</span>
              </button>
              {menuOpen ? (
                <>
                  <button
                    type="button"
                    aria-label="Zamknij listę tabel"
                    className={styles.menuBackdrop}
                    onClick={() => setMenuOpen(false)}
                  />
                  <div className={styles.tableMenu}>
                    {erpTables.map((t) => (
                      <button
                        type="button"
                        key={t.key}
                        className={t.key === table.key ? styles.tableOptActive : styles.tableOpt}
                        onClick={() => selectTable(t.key)}
                      >
                        <div className={styles.tableOptLabel}>{t.label}</div>
                        <div className={styles.tableOptDesc}>{t.desc}</div>
                      </button>
                    ))}
                  </div>
                </>
              ) : null}
            </div>

            <div className={styles.searchField}>
              <span className={styles.searchIcon}>
                <SearchIcon size={15} stroke="#9aa3b1" />
              </span>
              <input
                className={styles.searchInput}
                placeholder="Szukaj w tabeli…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className={styles.spacer} />

            <button type="button" className={styles.exportButton}>
              <DownloadIcon size={15} />
              Eksport CSV
            </button>
          </div>

          {showChips ? (
            <div className={styles.chips}>
              <span className={styles.chipsLabel}>KATEGORIA</span>
              {categories.map((c) => (
                <button
                  type="button"
                  key={c}
                  className={c === category ? styles.chipActive : styles.chip}
                  onClick={() => setCategory(c)}
                >
                  {c}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                {table.columns.map((c) => (
                  <th
                    key={c.key}
                    className={styles.th}
                    style={{ textAlign: c.align === "right" ? "right" : "left" }}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={i}
                  className={styles.row}
                  onClick={() => setDetail({ table, record: r })}
                >
                  {table.columns.map((c) => {
                    const value = cellText(r[c.key]);
                    if (c.badge) {
                      const [bg, fg] = badgeColorsFor(value);
                      return (
                        <td key={c.key} className={styles.tdBadge}>
                          <span className={styles.badge} style={{ background: bg, color: fg }}>
                            {value}
                          </span>
                        </td>
                      );
                    }
                    return (
                      <td
                        key={c.key}
                        className={c.mono ? styles.tdMono : styles.td}
                        style={{ textAlign: c.align === "right" ? "right" : "left" }}
                      >
                        {value}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className={styles.footer}>
          <div className={styles.count}>
            Wyświetlono <strong>{rows.length}</strong> pozycji
          </div>
          <button type="button" className={styles.loadMore}>
            Załaduj więcej
          </button>
        </div>
      </div>

      {detail ? (
        <>
          <button
            type="button"
            aria-label="Zamknij szczegóły"
            className={styles.drawerBackdrop}
            onClick={() => setDetail(null)}
          />
          <div className={styles.drawer}>
            <div className={styles.drawerHead}>
              <div>
                <div className={styles.drawerEyebrow}>{detail.table.label}</div>
                <div className={styles.drawerTitle}>{detailTitle}</div>
              </div>
              <button type="button" className={styles.drawerClose} onClick={() => setDetail(null)}>
                <CloseIcon size={20} />
              </button>
            </div>
            <div className={styles.drawerBody}>
              {detail.table.columns.map((c) => (
                <div className={styles.drawerField} key={c.key}>
                  <span className={styles.drawerLabel}>{c.label}</span>
                  <span className={styles.drawerValue}>{cellText(detail.record[c.key])}</span>
                </div>
              ))}
            </div>
            <div className={styles.drawerFooter}>
              <button type="button" className={styles.askButton} onClick={askAboutRecord}>
                <ChatIcon size={17} />
                Zapytaj AI o ten rekord
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
