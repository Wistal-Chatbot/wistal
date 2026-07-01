"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type {
  DataQueryRequest,
  DataSchemaColumn,
  DataSchemaTable,
  DataSort,
} from "@/lib/api/data-types";
import { DEFAULT_PAGE_SIZE } from "@/lib/api/data-types";
import { ChatIcon, CloseIcon, DownloadIcon, SearchIcon } from "../_components/icons";
import { fetchDataSchema, queryData } from "./dataBrowserApi";
import styles from "./DataBrowser.module.css";

type DataRow = Record<string, unknown>;
type LoadState = "idle" | "loading" | "ready" | "error";

interface QueryState {
  tableKey: string;
  search: string;
  sort: DataSort | null;
  page: number;
}

const numberFormatter = new Intl.NumberFormat("pl-PL");
const numericFormatter = new Intl.NumberFormat("pl-PL", {
  maximumFractionDigits: 2,
});
const dateFormatter = new Intl.DateTimeFormat("pl-PL", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

function isNumericColumn(column: DataSchemaColumn): boolean {
  return column.type === "integer" || column.type === "numeric";
}

function isMonoColumn(column: DataSchemaColumn): boolean {
  if (column.type !== "text") return true;
  return /(kod|nip|numer|lp|jm|jmp|ksef)/i.test(column.name);
}

function formatCellValue(value: unknown, column: DataSchemaColumn): string {
  if (value == null) return "";

  if (column.type === "date") {
    const date = value instanceof Date ? value : new Date(String(value));
    if (!Number.isNaN(date.getTime())) return dateFormatter.format(date);
    return String(value);
  }

  if (column.type === "integer") {
    const number = typeof value === "number" ? value : Number(value);
    return Number.isFinite(number) ? numberFormatter.format(number) : String(value);
  }

  if (column.type === "numeric") {
    const number = typeof value === "number" ? value : Number(value);
    return Number.isFinite(number) ? numericFormatter.format(number) : String(value);
  }

  return String(value);
}

function sortIndicator(column: DataSchemaColumn, sort: DataSort | null): string {
  if (!column.sortable) return "";
  if (sort?.column !== column.name) return "↕";
  return sort.direction === "asc" ? "▲" : "▼";
}

function preferredTableKey(tables: DataSchemaTable[]): string {
  return tables.find((table) => table.key === "towary")?.key ?? tables[0]?.key ?? "";
}

export function DataBrowser() {
  const router = useRouter();
  const [tables, setTables] = useState<DataSchemaTable[]>([]);
  const [schemaState, setSchemaState] = useState<LoadState>("loading");
  const [schemaRefresh, setSchemaRefresh] = useState(0);
  const [rows, setRows] = useState<DataRow[]>([]);
  const [rowState, setRowState] = useState<LoadState>("idle");
  const [rowRefresh, setRowRefresh] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState<QueryState>({
    tableKey: "",
    search: "",
    sort: null,
    page: 1,
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const [detail, setDetail] = useState<{ table: DataSchemaTable; record: DataRow } | null>(null);

  const table = useMemo(
    () => tables.find((item) => item.key === query.tableKey) ?? null,
    [query.tableKey, tables],
  );

  useEffect(() => {
    let cancelled = false;

    fetchDataSchema()
      .then((schema) => {
        if (cancelled) return;
        const tableKey = preferredTableKey(schema.tables);
        setTables(schema.tables);
        setSearch("");
        setQuery({ tableKey, search: "", sort: null, page: 1 });
        setRowState(tableKey ? "loading" : "idle");
        setSchemaState("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setTables([]);
        setQuery({ tableKey: "", search: "", sort: null, page: 1 });
        setRowState("idle");
        setSchemaState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [schemaRefresh]);

  const trimmedSearch = search.trim();

  useEffect(() => {
    if (trimmedSearch === query.search) return;

    const timeout = window.setTimeout(() => {
      setRows([]);
      setHasMore(false);
      setDetail(null);
      if (query.tableKey) setRowState("loading");
      setQuery((current) => ({
        ...current,
        search: trimmedSearch,
        page: 1,
      }));
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [query.search, query.tableKey, trimmedSearch]);

  useEffect(() => {
    if (!query.tableKey) {
      return;
    }

    let cancelled = false;
    const append = query.page > 1;
    const body: DataQueryRequest = {
      table: query.tableKey,
      page: query.page,
      page_size: DEFAULT_PAGE_SIZE,
    };

    if (query.search) body.global_search = query.search;
    if (query.sort) body.sort = [query.sort];

    queryData(body)
      .then((response) => {
        if (cancelled) return;
        setRows((current) => (append ? [...current, ...response.rows] : response.rows));
        setHasMore(response.has_more);
        setRowState("ready");
      })
      .catch(() => {
        if (cancelled) return;
        if (!append) setRows([]);
        setHasMore(false);
        setRowState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [query, rowRefresh]);

  function selectTable(key: string) {
    setMenuOpen(false);
    if (key === query.tableKey) return;

    setSearch("");
    setRows([]);
    setHasMore(false);
    setDetail(null);
    setRowState("loading");
    setQuery({ tableKey: key, search: "", sort: null, page: 1 });
  }

  function cycleSort(column: DataSchemaColumn) {
    if (!column.sortable) return;

    setRows([]);
    setHasMore(false);
    setDetail(null);
    setRowState("loading");
    setQuery((current) => {
      const currentSort = current.sort;
      let nextSort: DataSort | null = { column: column.name, direction: "asc" };

      if (currentSort?.column === column.name) {
        nextSort =
          currentSort.direction === "asc"
            ? { column: column.name, direction: "desc" }
            : null;
      }

      return { ...current, sort: nextSort, page: 1 };
    });
  }

  function loadMore() {
    if (!hasMore || rowState === "loading") return;
    setRowState("loading");
    setQuery((current) => ({ ...current, page: current.page + 1 }));
  }

  function retrySchema() {
    setSchemaState("loading");
    setRows([]);
    setHasMore(false);
    setDetail(null);
    setRowState("idle");
    setSchemaRefresh((value) => value + 1);
  }

  function retryRows() {
    setRowState("loading");
    setRowRefresh((value) => value + 1);
  }

  function askAboutRecord() {
    if (!detail) return;
    const firstColumn = detail.table.columns[0];
    const title = firstColumn
      ? formatCellValue(detail.record[firstColumn.name], firstColumn)
      : detail.table.label;
    const prompt = `Przeanalizuj rekord ${title} z tabeli ${detail.table.label}. Podaj kluczowe informacje, powiązania i ewentualne ryzyka.`;
    router.push(`/app/chat?prompt=${encodeURIComponent(prompt)}`);
  }

  const detailTitle = detail
    ? formatCellValue(
        detail.record[detail.table.columns[0]?.name ?? ""],
        detail.table.columns[0] ?? {
          name: "",
          label: "",
          type: "text",
          searchable: false,
          filterable: false,
          sortable: false,
        },
      )
    : "";

  const schemaLoading = schemaState === "loading";
  const initialRowsLoading = rowState === "loading" && rows.length === 0;
  const appendingRows = rowState === "loading" && rows.length > 0;

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.toolbar}>
          <div className={styles.toolbarRow}>
            <div className={styles.selectorWrap}>
              <button
                type="button"
                className={styles.selector}
                disabled={schemaLoading || !tables.length}
                onClick={() => setMenuOpen((value) => !value)}
              >
                <span className={styles.selectorTag}>TABELA:</span>
                {table?.label ?? (schemaLoading ? "Ładowanie…" : "Brak tabel")}
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
                    {tables.map((item) => (
                      <button
                        type="button"
                        key={item.key}
                        className={
                          item.key === table?.key ? styles.tableOptActive : styles.tableOpt
                        }
                        onClick={() => selectTable(item.key)}
                      >
                        <div className={styles.tableOptLabel}>{item.label}</div>
                        <div className={styles.tableOptDesc}>{item.description}</div>
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
                disabled={!table || schemaLoading}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>

            <div className={styles.spacer} />

            <button
              type="button"
              className={styles.exportButton}
              disabled
              title="Eksport CSV zostanie dodany w kolejnym kroku"
            >
              <DownloadIcon size={15} />
              Eksport CSV
            </button>
          </div>
        </div>

        {schemaState === "error" ? (
          <div className={styles.statePanel}>
            <div className={styles.stateTitle}>Nie udało się pobrać danych.</div>
            <button
              type="button"
              className={styles.retryButton}
              onClick={retrySchema}
            >
              Spróbuj ponownie
            </button>
          </div>
        ) : schemaLoading ? (
          <div className={styles.statePanel}>Ładowanie tabel…</div>
        ) : table ? (
          <>
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    {table.columns.map((column) => (
                      <th
                        key={column.name}
                        className={cx(styles.th, isNumericColumn(column) && styles.thRight)}
                      >
                        {column.sortable ? (
                          <button
                            type="button"
                            className={cx(
                              styles.sortButton,
                              query.sort?.column === column.name && styles.sortButtonActive,
                            )}
                            onClick={() => cycleSort(column)}
                          >
                            <span>{column.label}</span>
                            <span className={styles.sortIndicator}>
                              {sortIndicator(column, query.sort)}
                            </span>
                          </button>
                        ) : (
                          <span>{column.label}</span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rowState === "error" && rows.length === 0 ? (
                    <tr>
                      <td className={styles.stateCell} colSpan={table.columns.length}>
                        <div className={styles.stateTitle}>Nie udało się pobrać danych.</div>
                        <button
                          type="button"
                          className={styles.retryButton}
                          onClick={retryRows}
                        >
                          Spróbuj ponownie
                        </button>
                      </td>
                    </tr>
                  ) : initialRowsLoading ? (
                    <tr>
                      <td className={styles.stateCell} colSpan={table.columns.length}>
                        Ładowanie danych…
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td className={styles.stateCell} colSpan={table.columns.length}>
                        Brak wyników dla wybranych kryteriów.
                      </td>
                    </tr>
                  ) : (
                    rows.map((row, index) => (
                      <tr
                        key={index}
                        className={styles.row}
                        onClick={() => setDetail({ table, record: row })}
                      >
                        {table.columns.map((column) => (
                          <td
                            key={column.name}
                            className={cx(
                              isMonoColumn(column) ? styles.tdMono : styles.td,
                              isNumericColumn(column) && styles.tdRight,
                            )}
                          >
                            {formatCellValue(row[column.name], column)}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className={styles.footer}>
              <div className={styles.count}>
                Wyświetlono <strong>{rows.length}</strong> pozycji
              </div>
              <button
                type="button"
                className={styles.loadMore}
                disabled={!hasMore || rowState === "loading"}
                onClick={loadMore}
              >
                {appendingRows ? "Ładowanie…" : "Załaduj więcej"}
              </button>
            </div>
          </>
        ) : (
          <div className={styles.statePanel}>Brak dostępnych tabel.</div>
        )}
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
              {detail.table.columns.map((column) => (
                <div className={styles.drawerField} key={column.name}>
                  <span className={styles.drawerLabel}>{column.label}</span>
                  <span className={styles.drawerValue}>
                    {formatCellValue(detail.record[column.name], column)}
                  </span>
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
