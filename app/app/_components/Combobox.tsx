"use client";

import { useEffect, useId, useRef, useState } from "react";

import styles from "./Combobox.module.css";

export interface ComboOption {
  value: string;
  label: string;
}

interface ComboboxProps {
  value: string;
  onChange: (value: string, label: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Static options — filtered client-side as the user types. */
  options?: ComboOption[];
  /** Async source — called (debounced) with the query; server-side search. */
  loadOptions?: (query: string) => Promise<ComboOption[]>;
  emptyText?: string;
}

/**
 * Searchable single-select. Two modes: `options` (client-side filter) or
 * `loadOptions` (debounced async search). Closes on Escape / click-outside
 * (backdrop pattern, mirroring AppShell). Basic arrow-key navigation.
 */
export function Combobox({
  value,
  onChange,
  placeholder,
  disabled,
  options,
  loadOptions,
  emptyText = "Brak wyników",
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [list, setList] = useState<ComboOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const [selectedLabel, setSelectedLabel] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  // Keep the displayed label in sync with the current value (static options).
  useEffect(() => {
    if (!options) return;
    const found = options.find((o) => o.value === value);
    setSelectedLabel(found ? found.label : value);
  }, [options, value]);

  // Load (async) or filter (static) whenever the query changes while open.
  useEffect(() => {
    if (!open) return;

    if (loadOptions) {
      let cancelled = false;
      setLoading(true);
      const timer = setTimeout(async () => {
        try {
          const result = await loadOptions(query);
          if (!cancelled) setList(result);
        } catch {
          if (!cancelled) setList([]);
        } finally {
          if (!cancelled) setLoading(false);
        }
      }, 250);
      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    }

    const q = query.trim().toLowerCase();
    const all = options ?? [];
    setList(
      q
        ? all.filter(
            (o) =>
              o.label.toLowerCase().includes(q) ||
              o.value.toLowerCase().includes(q),
          )
        : all,
    );
  }, [open, query, loadOptions, options]);

  useEffect(() => {
    setActive(0);
  }, [list]);

  function openList() {
    if (disabled) return;
    setQuery("");
    setOpen(true);
  }

  function choose(option: ComboOption) {
    setSelectedLabel(option.label);
    onChange(option.value, option.label);
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, Math.max(list.length - 1, 0)));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
      return;
    }
    if (event.key === "Enter" && open && list[active]) {
      event.preventDefault();
      choose(list[active]);
    }
  }

  return (
    <div className={styles.wrap}>
      <input
        ref={inputRef}
        className={styles.input}
        type="text"
        disabled={disabled}
        placeholder={placeholder}
        value={open ? query : selectedLabel}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={openList}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        autoComplete="off"
      />
      <span className={styles.caret}>▼</span>

      {open ? (
        <>
          <button
            type="button"
            aria-label="Zamknij listę"
            className={styles.backdrop}
            onClick={() => setOpen(false)}
          />
          <div className={styles.menu} role="listbox" id={listboxId}>
            {loading ? (
              <div className={styles.state}>Ładowanie…</div>
            ) : list.length === 0 ? (
              <div className={styles.state}>{emptyText}</div>
            ) : (
              list.map((option, i) => (
                <button
                  type="button"
                  key={option.value}
                  role="option"
                  aria-selected={option.value === value}
                  className={
                    i === active
                      ? styles.optionActive
                      : option.value === value
                        ? styles.optionSelected
                        : styles.option
                  }
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(option)}
                >
                  {option.label}
                </button>
              ))
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
