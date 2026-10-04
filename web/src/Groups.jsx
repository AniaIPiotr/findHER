// Groups.jsx
import React, { useEffect, useState } from "react";
import {
  ArrowLeft,
  Plus,
  Users,
  X,
  LogOut,
  UserPlus,
  ChevronRight,
} from "lucide-react";
import { groupsApi } from "./api";
import GroupDetail from "./GroupDetail.jsx";
import "./Groups.css";

export default function Groups({ user, onBack, onSignOut }) {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openGroupId, setOpenGroupId] = useState(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await groupsApi.list();
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setGroups(await res.json());
    } catch (e) {
      console.error("[groups] load failed", e);
      setError("Couldn't load groups.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    setError("");
    try {
      const res = await groupsApi.create({ name, description: newDesc.trim() });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Create failed");
      }
      const g = await res.json();
      setGroups((prev) => [...prev, g]);
      setCreateOpen(false);
      setNewName("");
      setNewDesc("");
      setOpenGroupId(g.id);
    } catch (e) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  };

  // Jeśli otwarta grupa – pokaż jej szczegóły
  if (openGroupId != null) {
    return (
      <GroupDetail
        groupId={openGroupId}
        currentUser={user}
        onBack={() => {
          setOpenGroupId(null);
          load();
        }}
        onSignOut={onSignOut}
      />
    );
  }

  return (
    <main className="groups-page">
      <header className="groups-header">
        <button
          type="button"
          className="groups-back"
          onClick={onBack}
          aria-label="Back to dashboard"
        >
          <ArrowLeft size={18} />
        </button>

        <div className="groups-logo">
          <div className="logo-mark">FH</div>
          <span>findHER</span>
        </div>

        <button
          type="button"
          className="groups-signout"
          onClick={onSignOut}
          aria-label="Sign out"
          title="Sign out"
        >
          <LogOut size={16} />
        </button>
      </header>

      <section className="groups-hero">
        <p className="eyebrow">YOUR CIRCLES</p>
        <div className="groups-hero-row">
          <h1>Groups</h1>
          <button
            type="button"
            className="groups-create-btn"
            onClick={() => setCreateOpen(true)}
          >
            <Plus size={16} />
            New group
          </button>
        </div>
        <p className="groups-sub">
          Create a circle, invite women by email, and see each other's profiles.
        </p>
      </section>

      {error && <div className="groups-error">{error}</div>}

      {loading ? (
        <div className="groups-empty">Loading…</div>
      ) : groups.length === 0 ? (
        <div className="groups-empty">
          <Users size={28} />
          <h3>No groups yet</h3>
          <p>Create your first circle and invite friends by email.</p>
        </div>
      ) : (
        <ul className="groups-list">
          {groups.map((g) => (
            <li key={g.id}>
              <button
                type="button"
                className="group-card"
                onClick={() => setOpenGroupId(g.id)}
              >
                <div className="group-card-left">
                  <div className="group-avatar">
                    {g.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="group-card-info">
                    <h3>{g.name}</h3>
                    <span>
                      {g.member_count}{" "}
                      {g.member_count === 1 ? "member" : "members"}
                      {g.description ? ` · ${g.description}` : ""}
                    </span>
                  </div>
                </div>
                <ChevronRight size={18} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* ---------- Modal: nowa grupa ---------- */}
      {createOpen && (
        <div className="modal-overlay" onClick={() => setCreateOpen(false)}>
          <div
            className="modal-panel"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <header className="modal-header">
              <h3>New group</h3>
              <button
                type="button"
                className="modal-close"
                onClick={() => setCreateOpen(false)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </header>

            <div className="modal-body">
              <label className="modal-label">
                <span>Name</span>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Warsaw Book Club"
                  autoFocus
                />
              </label>

              <label className="modal-label">
                <span>
                  Description <em className="optional-badge">optional</em>
                </span>
                <textarea
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="What's this group about?"
                  rows={3}
                  maxLength={200}
                />
              </label>
            </div>

            <footer className="modal-footer">
              <button
                type="button"
                className="modal-secondary"
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="modal-primary"
                onClick={handleCreate}
                disabled={creating || !newName.trim()}
              >
                {creating ? "Creating…" : "Create group"}
              </button>
            </footer>
          </div>
        </div>
      )}
    </main>
  );
}