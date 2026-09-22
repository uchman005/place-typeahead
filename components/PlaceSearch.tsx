"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useTypeahead } from "@/hooks/useTypeahead";
import { fetchPlaces, normaliseQuery, placeLabel, MIN_QUERY_LENGTH, type Place } from "@/lib/places";
import { Highlight } from "./Highlight";

export interface PlaceSearchProps {
  fetcher?: (query: string, signal: AbortSignal) => Promise<Place[]>;
  onSelect?: (place: Place) => void;
  debounceMs?: number;
  label?: string;
  placeholder?: string;
}

/**
 * Editable combobox with list autocomplete (WAI-ARIA APG pattern).
 * Focus stays on the input; the active option is conveyed via aria-activedescendant.
 */
export function PlaceSearch({
  fetcher = fetchPlaces,
  onSelect,
  debounceMs = 250,
  label = "Area, town or city",
  placeholder = "Try Lekki, Ikeja or Enugu",
}: PlaceSearchProps) {
  const ids = useId();
  const listId = `${ids}-list`;
  const statusId = `${ids}-status`;
  const optionId = (i: number) => `${ids}-opt-${i}`;

  // inputValue is what's in the box; searchTerm is what the user actually typed.
  // Choosing a result fills the box without firing a new search for the full label.
  const [inputValue, setInputValue] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [selected, setSelected] = useState<Place | null>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const { status, results, error, isPending, retry } = useTypeahead<Place>(searchTerm, {
    fetcher,
    normalise: normaliseQuery,
    debounceMs,
    minChars: MIN_QUERY_LENGTH,
  });

  // A new result set invalidates the old highlight.
  useEffect(() => setActiveIndex(-1), [results]);

  // Keep the active option in view when navigating a scrolled list.
  useEffect(() => {
    if (activeIndex < 0) return;
    const el = listRef.current?.querySelector<HTMLElement>(`#${CSS.escape(optionId(activeIndex))}`);
    el?.scrollIntoView?.({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex]);

  const showPanel = open && status !== "idle";
  const showOptions = showPanel && results.length > 0 && status !== "error";

  function choose(place: Place) {
    setSelected(place);
    setInputValue(placeLabel(place));
    setOpen(false);
    setActiveIndex(-1);
    onSelect?.(place);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.nativeEvent.isComposing) return; // don't hijack IME composition

    switch (e.key) {
      case "ArrowDown": {
        e.preventDefault();
        if (!open) return setOpen(true);
        if (results.length) setActiveIndex((i) => (i + 1) % results.length);
        return;
      }
      case "ArrowUp": {
        e.preventDefault();
        if (!open) return setOpen(true);
        if (results.length) setActiveIndex((i) => (i <= 0 ? results.length - 1 : i - 1));
        return;
      }
      case "Enter": {
        if (showOptions && activeIndex >= 0) {
          e.preventDefault();
          choose(results[activeIndex]);
        }
        return;
      }
      case "Escape": {
        e.preventDefault();
        if (open) {
          setOpen(false);
          setActiveIndex(-1);
        } else {
          setInputValue("");
          setSearchTerm("");
          setSelected(null);
        }
        return;
      }
      case "Tab":
        setOpen(false);
        return;
    }
  }

  const busy = status === "loading" || isPending;
  const announcement =
    status === "loading" ? "Searching…"
    : status === "empty" ? `No places match “${searchTerm.trim()}”.`
    : status === "error" ? error?.message ?? "Search failed."
    : status === "success" ? `${results.length} ${results.length === 1 ? "place" : "places"} found. Use up and down arrows to choose.`
    : "";

  return (
    <div className="ps">
      <label htmlFor={`${ids}-input`} className="ps-label">{label}</label>

      <div className="ps-field" data-busy={busy || undefined}>
        <svg className="ps-pin" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12Z" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="12" cy="10" r="2.5" fill="currentColor" />
        </svg>
        <input
          id={`${ids}-input`}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showOptions}
          aria-controls={listId}
          aria-activedescendant={showOptions && activeIndex >= 0 ? optionId(activeIndex) : undefined}
          aria-describedby={statusId}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          placeholder={placeholder}
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setSearchTerm(e.target.value);
            setSelected(null);
            setOpen(true);
          }}
          onFocus={() => searchTerm && setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
        />
        {busy && <span className="ps-spinner" aria-hidden="true" />}
      </div>

      <p id={statusId} className="sr-only" aria-live="polite" aria-atomic="true">
        {open ? announcement : ""}
      </p>

      {showPanel && (
        <div className="ps-panel">
          {showOptions && (
            <ul id={listId} ref={listRef} role="listbox" aria-label="Matching places" className="ps-list" data-stale={status === "loading" || undefined}>
              {results.map((p, i) => (
                <li
                  key={p.id}
                  id={optionId(i)}
                  role="option"
                  aria-selected={i === activeIndex}
                  className="ps-option"
                  // mousedown would blur the input before click lands
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseMove={() => i !== activeIndex && setActiveIndex(i)}
                  onClick={() => choose(p)}
                >
                  <span className="ps-name"><Highlight text={p.name} query={searchTerm} /></span>
                  <span className="ps-meta">{[p.lga, p.state].filter(Boolean).join(", ") || "Nigeria"}</span>
                </li>
              ))}
            </ul>
          )}

          {status === "loading" && results.length === 0 && <p className="ps-note">Searching places…</p>}

          {status === "empty" && (
            <p className="ps-note">
              No places in Nigeria match “{searchTerm.trim()}”. Check the spelling or try a nearby town.
            </p>
          )}

          {status === "error" && (
            <div className="ps-note ps-error" role="alert">
              <span>{error?.message ?? "Search failed."}</span>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={retry}>Try again</button>
            </div>
          )}
        </div>
      )}

      {!showPanel && searchTerm.trim().length > 0 && searchTerm.trim().length < MIN_QUERY_LENGTH && (
        <p className="ps-hint">Type at least {MIN_QUERY_LENGTH} letters.</p>
      )}

      {selected && (
        <section className="ps-picked" aria-label="Selected place">
          <h2>{selected.name}</h2>
          <p>{[selected.lga, selected.state, "Nigeria"].filter(Boolean).join(", ")}</p>
          <dl>
            <div><dt>Latitude</dt><dd>{selected.lat.toFixed(4)}</dd></div>
            <div><dt>Longitude</dt><dd>{selected.lon.toFixed(4)}</dd></div>
            {selected.population ? <div><dt>Population</dt><dd>{selected.population.toLocaleString("en-NG")}</dd></div> : null}
          </dl>
          <a
            href={`https://www.openstreetmap.org/?mlat=${selected.lat}&mlon=${selected.lon}#map=13/${selected.lat}/${selected.lon}`}
            target="_blank"
            rel="noreferrer"
          >
            Open on map
          </a>
        </section>
      )}
    </div>
  );
}
