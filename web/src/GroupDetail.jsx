// GroupDetail.jsx
import React, { useEffect, useState } from "react";
import {
  ArrowLeft,
  LogOut,
  UserPlus,
  X,
  Check,
  Mail,
  MapPin,
} from "lucide-react";
import { groupsApi } from "./api";
import "./Groups.css";

export default function GroupDetail({ groupId, currentUser, onBack, onSignOut }) {
  const [group, setGroup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteMsg, setInviteMsg] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const res = await groupsApi.get(groupId);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      setGroup(await res.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [groupId]);

  const isOwner = group && currentUser?.id === group.owner_id;

  const handleInvite = async () => {
    const email = inviteEmail.trim();
    if (!email) return;
    setInviting(true);
    setInviteMsg("");
    try {
      const res = await groupsApi.invite(groupId, email);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Invite failed");
      }
      setGroup(await res.json());
      setInviteEmail("");
      setInviteMsg("Invitation sent!");
    } catch (e) {
      setInviteMsg(e.message);
    } finally {
      setInviting(false);
    }
  };

  const handleLeave = async () => {
    if (!window.confirm("Leave this group?")) return;
    await groupsApi.leave(groupId);
    onBack();
  };

  // ---------- Render ----------
  return (
    <main className="groups-page">
      <header className="groups-header">
        <button
          type="button"
          className="groups-back"
          onClick={onBack}
          aria-label="Back"
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
        >
          <LogOut size={16} />
        </button>
      </header>

      {loading ? (
        <div className="groups-empty">Loading…</div>
      ) : error ? (
        <div className="groups-empty">
          <h3>Something went wrong</h3>
          <p>{error}</p>
          <button type="button" className="groups-create-btn" onClick={onBack}>
            Back
          </button>
        </div>
      ) : (
        <>
          <section className="groups-hero">
            <p className="eyebrow">GROUP</p>
            <div className="groups-hero-row">
              <h1>{group.name}</h1>
              {isOwner && (
                <button
                  type="button"
                  className="groups-create-btn"
                  onClick={() => setInviteOpen(true)}
                >
                  <UserPlus size={16} />
                  Invite
                </button>
              )}
            </div>
            {group.description && (
              <p className="groups-sub">{group.description}</p>
            )}
          </section>

          <section className="group-members">
            <header className="group-members-header">
              <h2>Members</h2>
              <span>
                {group.member_count}{" "}
                {group.member_count === 1 ? "person" : "people"}
              </span>
            </header>

            <ul className="group-members-list">
              {group.members.map((m) => (
                <li key={m.id} className="member-card">
                  <div className="member-avatar">
                    {m.name ? m.name.charAt(0).toUpperCase() : "?"}
                  </div>
                  <div className="member-info">
                    <div className="member-name-row">
                      <h4>
                        {m.name} {m.surname}
                      </h4>
                      {m.status === "owner" && (
                        <span className="member-badge">Owner</span>
                      )}
                      {m.status === "invited" && (
                        <span className="member-badge member-badge--pending">
                          Invited
                        </span>
                      )}
                    </div>
                    {m.bio && <p className="member-bio">{m.bio}</p>}
                    <div className="member-meta">
                      {m.city && (
                        <span>
                          <MapPin size={12} />
                          {m.city}
                        </span>
                      )}
                      {m.interests?.length > 0 && (
                        <span className="member-tags">
                          {m.interests.slice(0, 4).map((t) => (
                            <em key={t}>{t}</em>
                          ))}
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {!isOwner && (
            <button type="button" className="group-leave" onClick={handleLeave}>
              Leave group
            </button>
          )}

          {/* ---------- Modal: zaproszenie ---------- */}
          {inviteOpen && (
            <div className="modal-overlay" onClick={() => setInviteOpen(false)}>
              <div
                className="modal-panel"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
              >
                <header className="modal-header">
                  <h3>Invite to {group.name}</h3>
                  <button
                    type="button"
                    className="modal-close"
                    onClick={() => setInviteOpen(false)}
                    aria-label="Close"
                  >
                    <X size={18} />
                  </button>
                </header>

                <div className="modal-body">
                  <label className="modal-label">
                    <span>Email</span>
                    <div className="invite-row">
                      <input
                        type="email"
                        value={inviteEmail}
                        onChange={(e) => {
                          setInviteEmail(e.target.value);
                          setInviteMsg("");
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleInvite();
                          }
                        }}
                        placeholder="friend@example.com"
                        autoFocus
                      />
                      <button
                        type="button"
                        className="modal-primary modal-primary--compact"
                        onClick={handleInvite}
                        disabled={inviting || !inviteEmail.trim()}
                      >
                        {inviting ? "…" : "Send"}
                      </button>
                    </div>
                  </label>

                  {inviteMsg && (
                    <p
                      className={
                        inviteMsg.toLowerCase().includes("sent")
                          ? "invite-ok"
                          : "invite-err"
                      }
                    >
                      {inviteMsg}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}