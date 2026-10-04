// Dashboard.jsx
import React from "react";
import {
  LogOut,
  Heart,
  Users,
  Sparkles,
  MapPin,
  Calendar,
  Compass,
} from "lucide-react";
import "./Dashboard.css";

export default function Dashboard({
  user,
  onSignOut,
  onNavigate,
  interests = [],
}) {
  const displayName = user?.name || user?.email || "there";
  const firstName = displayName.split(" ")[0];
  const userInterests = Array.isArray(user?.interests)
    ? user.interests
    : interests;

  const initials = (user?.name || user?.email || "?")
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <div className="dashboard-logo">
          <div className="logo-mark">FH</div>
          <span>findHER</span>
        </div>

        <div className="dashboard-user">
          {user?.picture ? (
            <img
              className="dashboard-avatar"
              src={user.picture}
              alt=""
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="dashboard-avatar dashboard-avatar--fallback">
              {initials}
            </div>
          )}
          <div className="dashboard-user-info">
            <strong>{user?.name || user?.email}</strong>
            <span>{user?.email}</span>
          </div>
          <button
            type="button"
            className="dashboard-signout"
            onClick={onSignOut}
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <section className="dashboard-hero">
        <p className="eyebrow">WELCOME BACK</p>
        <h1>Hi {firstName} 👋</h1>
        <p>
          Your profile is ready. Start discovering inspiring women around you.
        </p>
      </section>

      <section className="dashboard-grid">
        <article className="dashboard-card">
          <div className="dashboard-card-icon">
            <Compass size={20} />
          </div>
          <h3>Discover</h3>
          <p>Browse women near you and find someone who shares your vibe.</p>
          <button
            className="dashboard-card-cta"
            type="button"
            onClick={() => onNavigate?.("explore")}
          >
            Start exploring
          </button>
        </article>

        {/*
        <article className="dashboard-card">
          <div className="dashboard-card-icon">
            <Heart size={20} />
          </div>
          <h3>Matches</h3>
          <p>You don't have any matches yet — keep swiping to find yours.</p>
          <button className="dashboard-card-cta" type="button" disabled>
            No matches yet
          </button>
        </article>
        */}

        <article className="dashboard-card">
          <div className="dashboard-card-icon">
            <Users size={20} />
          </div>
          <h3>Groups</h3>
          <p>Join circles built around your interests and meet new people.</p>
<button
  className="dashboard-card-cta"
  type="button"
  onClick={() => onNavigate?.("groups")}
>
  See groups
</button>
        </article>
        <article className="dashboard-card">
          <div className="dashboard-card-icon">
            <Calendar size={20} />
          </div>
          <h3>Events</h3>
          <p>Local meetups, coffee chats, and workshops happening soon.</p>
          <button
            className="dashboard-card-cta"
            type="button"
            onClick={() => onNavigate?.("events")}
          >
            View events
          </button>
        </article>
      </section>

      {userInterests.length > 0 && (
        <section className="dashboard-interests">
          <div className="dashboard-section-header">
            <Sparkles size={16} />
            <h3>Your interests</h3>
          </div>
          <div className="interest-list">
            {userInterests.map((interest) => (
              <span className="interest-tag" key={interest}>
                <span>{interest}</span>
              </span>
            ))}
          </div>
        </section>
      )}
      {/*
      <section className="dashboard-location">
        <MapPin size={16} />
        <span>Discovering women near you</span>
      </section>
      */}
    </main>
  );
}
