// Explore.jsx
import React, { useState } from "react";
import {
  ArrowLeft,
  X,
  Heart,
  Star,
  MapPin,
  LogOut,
  RotateCcw,
} from "lucide-react";
import "./Explore.css";

// Mock – podmień na dane z backendu
const MOCK_PROFILES = [
  {
    id: 1,
    name: "Maya",
    age: 27,
    location: "Warsaw · 2 km",
    bio: "Coffee addict, weekend hiker, and always up for a deep conversation.",
    interests: ["coffee", "hiking", "books", "travel"],
    picture: "https://i.pravatar.cc/600?img=47",
  },
  {
    id: 2,
    name: "Zofia",
    age: 31,
    location: "Warsaw · 4 km",
    bio: "Ceramics teacher. Looking for a running buddy and gallery companion.",
    interests: ["art", "running", "wine", "photography"],
    picture: "https://i.pravatar.cc/600?img=45",
  },
  {
    id: 3,
    name: "Klara",
    age: 24,
    location: "Warsaw · 1 km",
    bio: "Plant mom, bookworm, occasional DJ. Ask me about my vinyls.",
    interests: ["music", "books", "meditation", "gaming"],
    picture: "https://i.pravatar.cc/600?img=32",
  },
  {
    id: 4,
    name: "Ines",
    age: 29,
    location: "Warsaw · 6 km",
    bio: "Yoga in the morning, wine in the evening. Balanced, right?",
    interests: ["yoga", "wine", "brunch", "fashion"],
    picture: "https://i.pravatar.cc/600?img=44",
  },
  {
    id: 5,
    name: "Nora",
    age: 26,
    location: "Warsaw · 3 km",
    bio: "Full-stack dev by day, painter by night. Cats welcome.",
    interests: ["tech", "painting", "movies", "coffee"],
    picture: "https://i.pravatar.cc/600?img=48",
  },
];

export default function Explore({ user, onBack, onSignOut }) {
  const [index, setIndex] = useState(0);
  const [liked, setLiked] = useState([]);
  const [lastAction, setLastAction] = useState(null);

  const current = MOCK_PROFILES[index];
  const isDone = index >= MOCK_PROFILES.length;

  const handleAction = (action) => {
    if (!current) return;
    if (action === "like" || action === "superlike") {
      setLiked((prev) => [...prev, current.id]);
    }
    setLastAction(action);
    setIndex((i) => i + 1);
  };

  const handleReset = () => {
    setIndex(0);
    setLiked([]);
    setLastAction(null);
  };

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

        <button
          type="button"
          className="explore-signout"
          onClick={onSignOut}
          aria-label="Sign out"
          title="Sign out"
        >
          <LogOut size={16} />
        </button>
      </header>

      <section className="explore-stage">
        {isDone ? (
          <div className="explore-empty">
            <h2>That's everyone for now 🌸</h2>
            <p>New women join every day — check back soon.</p>
            <button
              type="button"
              className="explore-reset"
              onClick={handleReset}
            >
              <RotateCcw size={16} />
              Start over
            </button>
          </div>
        ) : (
          <article className="explore-card" key={current.id}>
            <div className="explore-photo">
              <img
                src={current.picture}
                alt={current.name}
                referrerPolicy="no-referrer"
              />
              <div className="explore-photo-gradient" />
              <div className="explore-photo-info">
                <h2>
                  {current.name}
                  <span>{current.age}</span>
                </h2>
                <div className="explore-location">
                  <MapPin size={13} />
                  <span>{current.location}</span>
                </div>
              </div>
            </div>

            <div className="explore-body">
              <p className="explore-bio">{current.bio}</p>
              <div className="explore-tags">
                {current.interests.map((tag) => (
                  <span className="explore-tag" key={tag}>
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </article>
        )}
      </section>

      {!isDone && (
        <section className="explore-actions">
          <button
            type="button"
            className="explore-btn explore-btn--pass"
            onClick={() => handleAction("pass")}
            aria-label="Pass"
          >
            <X size={26} />
          </button>

          <button
            type="button"
            className="explore-btn explore-btn--super"
            onClick={() => handleAction("superlike")}
            aria-label="Super like"
          >
            <Star size={22} />
          </button>

          <button
            type="button"
            className="explore-btn explore-btn--like"
            onClick={() => handleAction("like")}
            aria-label="Like"
          >
            <Heart size={26} />
          </button>
        </section>
      )}

      <footer className="explore-footer">
        <span>
          {Math.min(index + 1, MOCK_PROFILES.length)} /{" "}
          {MOCK_PROFILES.length}
        </span>
        <span>
          {liked.length} liked{lastAction ? ` · last: ${lastAction}` : ""}
        </span>
      </footer>
    </main>
  );
}