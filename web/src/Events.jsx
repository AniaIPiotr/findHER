// Events.jsx
import React, { useEffect, useState } from "react";
import {
  ArrowLeft,
  Calendar as CalendarIcon,
  MapPin,
  Plus,
  Users,
  X,
  Check,
  LogOut as LeaveIcon,
  Trash2,
} from "lucide-react";
import "./Events.css";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

const formatDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const initialsOf = (p) => {
  const base = (
    p.name ? `${p.name} ${p.surname || ""}` : p.email || "?"
  ).trim();
  return base
    .split(/\s+/)
    .map((x) => x[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
};

const displayName = (p) =>
  [p.name, p.surname].filter(Boolean).join(" ") || p.email || "User";

export default function Events({ onBack }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: "",
    event_date: "",
    place: "",
    description: "",
  });
  const [expanded, setExpanded] = useState({});

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API}/events`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load events");
      setEvents(await res.json());
    } catch (e) {
      setError("Could not load events.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`${API}/events`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Could not create event");
      }
      setForm({ name: "", event_date: "", place: "", description: "" });
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.message || "Could not create event");
    } finally {
      setSubmitting(false);
    }
  };

  const joinEvent = async (id) => {
    await fetch(`${API}/events/${id}/join`, {
      method: "POST",
      credentials: "include",
    });
    setExpanded((prev) => ({ ...prev, [id]: true }));
    await load();
  };

  const leaveEvent = async (id) => {
    await fetch(`${API}/events/${id}/leave`, {
      method: "DELETE",
      credentials: "include",
    });
    await load();
  };

  const deleteEvent = async (id) => {
    if (!window.confirm("Delete this event? This cannot be undone.")) return;
    await fetch(`${API}/events/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    await load();
  };

  const toggleExpanded = (id) =>
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <main className="events-page">
      <header className="events-header">
        <button
          type="button"
          className="events-back"
          onClick={() => onBack?.()}
          aria-label="Back to dashboard"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="events-title">
          <h1>Events</h1>
          <p>Meetups, coffee chats and workshops near you.</p>
        </div>
        <button
          type="button"
          className="events-add"
          onClick={() => setShowForm((s) => !s)}
        >
          {showForm ? <X size={16} /> : <Plus size={16} />}
          <span>{showForm ? "Cancel" : "Add event"}</span>
        </button>
      </header>

      {showForm && (
        <form className="events-form" onSubmit={handleCreate}>
          <div className="events-form-row">
            <label>
              <span>Name</span>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Sunday brunch"
              />
            </label>
            <label>
              <span>Date &amp; time</span>
              <input
                type="datetime-local"
                required
                value={form.event_date}
                onChange={(e) =>
                  setForm({ ...form, event_date: e.target.value })
                }
              />
            </label>
          </div>
          <label>
            <span>Place</span>
            <input
              type="text"
              required
              value={form.place}
              onChange={(e) => setForm({ ...form, place: e.target.value })}
              placeholder="Café Flora, Kraków"
            />
          </label>
          <label>
            <span>Description</span>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              placeholder="What's the plan?"
            />
          </label>
          <div className="events-form-actions">
            <button
              type="submit"
              className="events-form-submit"
              disabled={submitting}
            >
              {submitting ? "Creating…" : "Create event"}
            </button>
          </div>
        </form>
      )}

      {error && <div className="events-error">{error}</div>}

      {loading ? (
        <div className="events-empty">Loading events…</div>
      ) : events.length === 0 ? (
        <div className="events-empty">
          No events yet. Be the first to host one!
        </div>
      ) : (
        <section className="events-list">
          {events.map((ev) => (
            <article
              key={ev.id}
              className={`event-card ${ev.is_joined ? "is-joined" : ""}`}
            >
              <div className="event-card-head">
                <div>
                  <h3>{ev.name}</h3>
                  <div className="event-meta">
                    <span>
                      <CalendarIcon size={14} /> {formatDate(ev.event_date)}
                    </span>
                    <span>
                      <MapPin size={14} /> {ev.place}
                    </span>
                  </div>
                </div>
                <div className="event-badges">
                  {ev.is_creator && (
                    <span className="event-badge event-badge--creator">
                      Host
                    </span>
                  )}
                  {ev.is_joined && !ev.is_creator && (
                    <span className="event-badge event-badge--joined">
                      Joined
                    </span>
                  )}
                </div>
              </div>

              {ev.description && (
                <p className="event-description">{ev.description}</p>
              )}

              <div className="event-participants">
                <button
                  type="button"
                  className="event-participants-toggle"
                  onClick={() => toggleExpanded(ev.id)}
                >
                  <Users size={14} />
                  <span>
                    {ev.participant_count}{" "}
                    {ev.participant_count === 1 ? "attendee" : "attendees"}
                  </span>
                  <div className="event-avatars">
                    {ev.participants.slice(0, 5).map((p) => (
                      <span
                        key={p.id}
                        className="event-avatar"
                        title={displayName(p)}
                      >
                        {initialsOf(p)}
                      </span>
                    ))}
                  </div>
                </button>

                {expanded[ev.id] && (
                  <ul className="event-participant-list">
                    {ev.participants.map((p) => (
                      <li key={p.id}>
                        <span className="event-avatar event-avatar--small">
                          {initialsOf(p)}
                        </span>
                        <span className="event-participant-name">
                          {displayName(p)}
                          {p.id === ev.creator_id && (
                            <em className="event-participant-host"> · host</em>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {!ev.is_joined && (
                  <p className="event-locked-hint">
                    Join the event to see who's coming.
                  </p>
                )}
              </div>

              <div className="event-actions">
                {ev.is_joined ? (
                  ev.is_creator ? (
                    <button
                      type="button"
                      className="event-btn event-btn--danger"
                      onClick={() => deleteEvent(ev.id)}
                    >
                      <Trash2 size={14} />
                      <span>Delete</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="event-btn event-btn--ghost"
                      onClick={() => leaveEvent(ev.id)}
                    >
                      <LeaveIcon size={14} />
                      <span>Leave</span>
                    </button>
                  )
                ) : (
                  <button
                    type="button"
                    className="event-btn event-btn--primary"
                    onClick={() => joinEvent(ev.id)}
                  >
                    <Check size={14} />
                    <span>Join</span>
                  </button>
                )}
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
