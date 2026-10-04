// Explore.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  X,
  Heart,
  Star,
  MapPin,
  LogOut,
  RotateCcw,
  SlidersHorizontal,
  Check,
  Plus,
} from "lucide-react";
import { usersApi } from "./api";
import "./Explore.css";

// Opcje filtrów
const CITIES = ["Warsaw", "Kraków", "Wrocław", "Gdańsk", "Poznań", "Łódź"];

const PREDEFINED_INTERESTS = [
  "cybersecurity",
  "programming",
  "data science/AI/ML",
  "robotics",
  "web dev",
  "mobile dev",
  "databases",
  "networks",
  "electronics",
  "embedded",
  "biotechnology",
  "chemistry",
  "physics",
  "mathematics",
  "statistics",
  "astronomy",
  "geology",
  "design",
  "travel",
  "art",
  "music",
  "books",
  "movies",
  "gaming",
];

const DEFAULT_FILTERS = {
  city: "",
  minAge: 18,
  maxAge: 120,
  interests: [],
  matchAll: false,
};

// Normalizacja stringów do porównań (case-insensitive, trim)
const norm = (s) => (s || "").toString().toLowerCase().trim();

export default function Explore({ user, onBack, onSignOut }) {
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [draftFilters, setDraftFilters] = useState(DEFAULT_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [index, setIndex] = useState(0);

  const [extraCities, setExtraCities] = useState([]);
  const [extraInterests, setExtraInterests] = useState([]);
  const [customCity, setCustomCity] = useState("");
  const [customInterest, setCustomInterest] = useState("");

  /* ============================================================
     Pobierz profile z backendu (wymaga sesji, zwraca dane publiczne)
     ============================================================ */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setLoadError("");
      try {
        const res = await usersApi.list();
        if (res.status === 401) {
          // Sesja padła i refresh też — wyślij usera do wylogowania.
          if (!cancelled) {
            setLoadError("Your session expired. Please sign in again.");
          }
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();

        // Wywal aktualnie zalogowanego usera, żeby nie pokazywać siebie
        const myId = user?.id ?? user?.user_id ?? null;

        const list = (Array.isArray(data) ? data : [])
          .filter((p) => !(myId != null && p.id === myId))
          .map((p) => ({
            id: p.id,
            name: p.name || "Anonymous",
            surname: p.surname || "",
            age: p.age ?? 0,
            city: p.city || "Unknown",
            // Backend nie zwraca już emaila w widoku publicznym.
            interests: Array.isArray(p.interests) ? p.interests : [],
            bio: p.bio || "",
            picture: p.picture || p.avatar || "",
            distanceKm: p.distanceKm ?? null,
          }));

        if (!cancelled) setProfiles(list);
      } catch (e) {
        console.error("[explore] load failed", e);
        if (!cancelled) setLoadError("Failed to load profiles.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  /* ============================================================
     Listy do panelu filtrów
     ============================================================ */
  const allCities = useMemo(() => [...CITIES, ...extraCities], [extraCities]);

  const allInterests = useMemo(
    () => [...PREDEFINED_INTERESTS, ...extraInterests],
    [extraInterests],
  );

  /* ============================================================
     Filtrowanie (case-insensitive, partial match dla miasta)
     ============================================================ */
  const filteredProfiles = useMemo(() => {
    const wantedCity = norm(filters.city);
    const wantedInterests = filters.interests.map(norm);

    return profiles.filter((p) => {
      // City – case-insensitive + partial
      if (wantedCity) {
        const c = norm(p.city);
        const ok =
          c === wantedCity || c.includes(wantedCity) || wantedCity.includes(c);
        if (!ok) return false;
      }

      // Age
      if (p.age < filters.minAge || p.age > filters.maxAge) return false;

      // Interests
      if (wantedInterests.length) {
        const userInts = p.interests.map(norm);
        const has = filters.matchAll
          ? wantedInterests.every((i) => userInts.includes(i))
          : wantedInterests.some((i) => userInts.includes(i));
        if (!has) return false;
      }

      return true;
    });
  }, [profiles, filters]);

  // Gdy zmienią się wyniki, wróć do pierwszej karty
  useEffect(() => {
    setIndex(0);
  }, [filters]);

  const current = filteredProfiles[index];
  const isDone = !loading && index >= filteredProfiles.length;

  const activeFilterCount =
    (filters.city ? 1 : 0) +
    (filters.minAge !== DEFAULT_FILTERS.minAge ||
    filters.maxAge !== DEFAULT_FILTERS.maxAge
      ? 1
      : 0) +
    (filters.interests.length ? 1 : 0);

  /* ============================================================
     Akcje
     ============================================================ */

  const handleReset = () => {
    setIndex(0);
  };

  const openFilters = () => {
    setDraftFilters(filters);
    setFiltersOpen(true);
  };

  const applyFilters = () => {
    setFilters(draftFilters);
    setFiltersOpen(false);
  };

  const resetFilters = () => {
    setDraftFilters(DEFAULT_FILTERS);
  };

  const toggleDraftInterest = (interest) => {
    setDraftFilters((prev) => ({
      ...prev,
      interests: prev.interests.includes(interest)
        ? prev.interests.filter((i) => i !== interest)
        : [...prev.interests, interest],
    }));
  };

  const addCustomCity = () => {
    const v = customCity.trim();
    if (!v) return;
    setExtraCities((prev) => (prev.includes(v) ? prev : [...prev, v]));
    setDraftFilters((p) => ({ ...p, city: v }));
    setCustomCity("");
  };

  const addCustomInterest = () => {
    const v = customInterest.trim().toLowerCase();
    if (!v) return;
    setExtraInterests((prev) => (prev.includes(v) ? prev : [...prev, v]));
    setDraftFilters((p) => ({
      ...p,
      interests: p.interests.includes(v) ? p.interests : [...p.interests, v],
    }));
    setCustomInterest("");
  };

  /* ============================================================
     Render
     ============================================================ */
  return (
    <main className="explore-page">
      <header className="explore-header">
        <button
          type="button"
          className="explore-back"
          onClick={onBack}
          aria-label="Back to dashboard"
        >
          <ArrowLeft size={18} />
        </button>

        <div className="explore-logo">
          <div className="logo-mark">FH</div>
          <span>findHER</span>
        </div>

        <div className="explore-header-right">
          <button
            type="button"
            className={`explore-filter-btn${
              activeFilterCount ? " explore-filter-btn--active" : ""
            }`}
            onClick={openFilters}
            aria-label="Filters"
            title="Filters"
          >
            <SlidersHorizontal size={16} />
            {activeFilterCount > 0 && (
              <span className="explore-filter-count">{activeFilterCount}</span>
            )}
          </button>

          <button
            type="button"
            className="explore-signout"
            onClick={onSignOut}
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <section className="explore-stage">
        {loading ? (
          <div className="explore-empty">
            <h2>Loading profiles…</h2>
          </div>
        ) : loadError ? (
          <div className="explore-empty">
            <h2>Couldn't load profiles</h2>
            <p>{loadError}</p>
            <button
              type="button"
              className="explore-reset"
              onClick={() => window.location.reload()}
            >
              <RotateCcw size={16} />
              Retry
            </button>
          </div>
        ) : isDone ? (
          <div className="explore-empty">
            <h2>That's everyone for now 🌸</h2>
            <p>
              {activeFilterCount
                ? "Try loosening your filters to see more women."
                : "New women join every day — check back soon."}
            </p>
            {activeFilterCount > 0 ? (
              <button
                type="button"
                className="explore-reset"
                onClick={() => {
                  setFilters(DEFAULT_FILTERS);
                  setIndex(0);
                }}
              >
                <SlidersHorizontal size={16} />
                Clear filters
              </button>
            ) : (
              <button
                type="button"
                className="explore-reset"
                onClick={handleReset}
              >
                <RotateCcw size={16} />
                Start over
              </button>
            )}
          </div>
        ) : (
          <article className="explore-card" key={current.id}>
            <div className="explore-photo">
              {current.picture ? (
                <img
                  src={current.picture}
                  alt={current.name}
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="explore-photo-fallback">
                  {current.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="explore-photo-gradient" />
              <div className="explore-photo-info">
                <h2>
                  {current.name}
                  {current.surname ? ` ${current.surname}` : ""}
                  {current.age ? <span>{current.age}</span> : null}
                </h2>
                <div className="explore-location">
                  <MapPin size={13} />
                  <span>
                    {current.city}
                    {current.distanceKm != null
                      ? ` · ${current.distanceKm} km`
                      : ""}
                  </span>
                </div>
              </div>
            </div>

            <div className="explore-body">
              {current.bio && <p className="explore-bio">{current.bio}</p>}

              {current.interests.length > 0 && (
                <div className="explore-tags">
                  {current.interests.map((tag) => (
                    <span
                      className={`explore-tag${
                        filters.interests.map(norm).includes(norm(tag))
                          ? " explore-tag--match"
                          : ""
                      }`}
                      key={tag}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </article>
        )}
      </section>

      {!isDone && !loading && !loadError && (
        <section className="explore-actions">
          <button
            type="button"
            className="explore-btn explore-btn--pass"
            onClick={() => setIndex((i) => i + 1)}
            aria-label="Pass"
          >
            <X size={26} />
          </button>
        </section>
      )}

      <footer className="explore-footer">
        <span>
          {isDone || loading ? 0 : index + 1} / {filteredProfiles.length}
        </span>
      </footer>

      {/* ---------- Panel filtrów ---------- */}
      {filtersOpen && (
        <div className="filters-overlay" onClick={() => setFiltersOpen(false)}>
          <div
            className="filters-panel"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <header className="filters-header">
              <h3>Filters</h3>
              <button
                type="button"
                className="filters-close"
                onClick={() => setFiltersOpen(false)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </header>

            <div className="filters-body">
              {/* City */}
              <div className="filters-group">
                <label className="filters-label">City</label>

                <div className="filters-chips">
                  <button
                    type="button"
                    className={`interest-chip${
                      !draftFilters.city ? " interest-chip--active" : ""
                    }`}
                    onClick={() => setDraftFilters((p) => ({ ...p, city: "" }))}
                  >
                    Any
                  </button>

                  {allCities.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`interest-chip${
                        draftFilters.city === c ? " interest-chip--active" : ""
                      }`}
                      onClick={() =>
                        setDraftFilters((p) => ({ ...p, city: c }))
                      }
                    >
                      {c}
                    </button>
                  ))}
                </div>

                <div className="interest-input">
                  <input
                    type="text"
                    value={customCity}
                    onChange={(e) => setCustomCity(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addCustomCity();
                      }
                    }}
                    placeholder="Add your own city…"
                  />
                  <button type="button" onClick={addCustomCity}>
                    <Plus size={16} />
                    Add
                  </button>
                </div>
              </div>

              {/* Age */}
              <div className="filters-group">
                <label className="filters-label">
                  Age
                  <span className="filters-value">
                    {draftFilters.minAge}–{draftFilters.maxAge}
                  </span>
                </label>
                <div className="filters-range">
                  <input
                    type="range"
                    min="18"
                    max="120"
                    value={draftFilters.minAge}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setDraftFilters((p) => ({
                        ...p,
                        minAge: Math.min(v, p.maxAge),
                      }));
                    }}
                  />
                  <input
                    type="range"
                    min="18"
                    max="120"
                    value={draftFilters.maxAge}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setDraftFilters((p) => ({
                        ...p,
                        maxAge: Math.max(v, p.minAge),
                      }));
                    }}
                  />
                </div>
              </div>

              {/* Interests */}
              <div className="filters-group">
                <label className="filters-label">
                  Interests
                  {draftFilters.interests.length > 0 && (
                    <span className="filters-value">
                      {draftFilters.interests.length} selected
                    </span>
                  )}
                </label>

                <div className="filters-chips">
                  {allInterests.map((i) => {
                    const active = draftFilters.interests.includes(i);
                    return (
                      <button
                        key={i}
                        type="button"
                        className={`interest-chip${
                          active ? " interest-chip--active" : ""
                        }`}
                        onClick={() => toggleDraftInterest(i)}
                        aria-pressed={active}
                      >
                        {active && <Check size={13} />}
                        {i}
                      </button>
                    );
                  })}
                </div>

                <div className="interest-input">
                  <input
                    type="text"
                    value={customInterest}
                    onChange={(e) => setCustomInterest(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addCustomInterest();
                      }
                    }}
                    placeholder="Add your own interest…"
                  />
                  <button type="button" onClick={addCustomInterest}>
                    <Plus size={16} />
                    Add
                  </button>
                </div>

                {draftFilters.interests.length > 1 && (
                  <label className="filters-toggle">
                    <input
                      type="checkbox"
                      checked={draftFilters.matchAll}
                      onChange={(e) =>
                        setDraftFilters((p) => ({
                          ...p,
                          matchAll: e.target.checked,
                        }))
                      }
                    />
                    <span>Must match all selected interests</span>
                  </label>
                )}
              </div>
            </div>

            <footer className="filters-footer">
              <button
                type="button"
                className="filters-reset"
                onClick={resetFilters}
              >
                Reset
              </button>
              <button
                type="button"
                className="filters-apply"
                onClick={applyFilters}
              >
                Show results
              </button>
            </footer>
          </div>
        </div>
      )}
    </main>
  );
}
