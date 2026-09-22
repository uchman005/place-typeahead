import { PlaceSearch } from "@/components/PlaceSearch";

export default function Page() {
  return (
    <main className="page">
      <header className="intro">
        <h1>Where are you looking for?</h1>
        <p>
          Search any area, town or city in Nigeria. Results come from the Open-Meteo geocoder through
          this app&rsquo;s own <code>/api/places</code> route.
        </p>
      </header>

      <PlaceSearch />

      <footer className="keys">
        <p>
          <kbd>↑</kbd> <kbd>↓</kbd> move through results, <kbd>Enter</kbd> chooses, <kbd>Esc</kbd> closes
          the list (press again to clear).
        </p>
      </footer>
    </main>
  );
}
