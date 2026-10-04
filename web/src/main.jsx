import React, { useState, useEffect, useRef, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { Plus, X, ArrowRight, LogOut, Check } from "lucide-react";
import "./App.css";
import { authApi, createUser } from "./api";
import Dashboard from "./Dashboard";
import Explore from "./Explore";
import Events from "./Events";

const GOOGLE_CLIENT_ID =
  "4201094175-6m5g8qthid8hrnq6broebfq2ek699n0j.apps.googleusercontent.com";

const GOOGLE_CONFIGURED =
  Boolean(GOOGLE_CLIENT_ID) &&
  !GOOGLE_CLIENT_ID.startsWith("YOUR_") &&
  GOOGLE_CLIENT_ID.endsWith(".apps.googleusercontent.com");

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

function GoogleIcon({ size = 17 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

function App() {
  const [view, setView] = useState("dashboard");

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    age: "",
    city: "",
    bio: "",
    interest: "",
  });
  const [interests, setInterests] = useState([]);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // auth: { loading, user }
  const [auth, setAuth] = useState({ loading: true, user: null });
  const [googleScriptReady, setGoogleScriptReady] = useState(false);
  const googleSlotRef = useRef(null);

  const googleUser = auth.user;

  const updateField = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setError("");
    setSubmitted(false);
  };

  const addInterest = () => {
    const interest = form.interest.trim().toLowerCase();
    if (!interest) return;
    if (interests.some((item) => item === interest)) {
      setError("This interest is already on the list.");
      return;
    }
    setInterests([...interests, interest]);
    setForm({ ...form, interest: "" });
    setError("");
  };

  const toggleInterest = (interest) => {
    setInterests((prev) =>
      prev.includes(interest)
        ? prev.filter((item) => item !== interest)
        : [...prev, interest],
    );
    setError("");
  };

  const removeInterest = (index) => {
    setInterests(interests.filter((_, i) => i !== index));
  };

  /* ============================================================
     AUTH: sprawdź sesję przy starcie (httpOnly cookie)
     ============================================================ */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authApi.me();
        const data = await res.json();
        if (cancelled) return;
        if (data.authenticated) {
          setAuth({ loading: false, user: data.user });
          setForm((prev) => ({ ...prev, email: data.user.email }));
          if (data.user.name) {
            setForm((prev) => ({
              ...prev,
              firstName: data.user.name || "",
              lastName: data.user.surname || "",
              age: data.user.age != null ? String(data.user.age) : "",
              city: data.user.city || "",
              bio: data.user.bio || "",
            }));
          }
          if (Array.isArray(data.user.interests)) {
            setInterests(data.user.interests);
          }
          if (data.user.profile_completed) {
            setSubmitted(true);
          }
        } else {
          setAuth({ loading: false, user: null });
        }
      } catch (e) {
        console.error("[auth/me] failed", e);
        if (!cancelled) setAuth({ loading: false, user: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* ============================================================
     GOOGLE: callback – wyślij credential do backendu
     ============================================================ */
  const handleGoogleCredential = useCallback(async (response) => {
    const credential = response?.credential;
    if (!credential) {
      setError("Failed to sign in with Google. Please try again.");
      return;
    }

    try {
      const res = await authApi.google(credential);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Google sign-in failed");
      }

      const meRes = await authApi.me();
      const me = await meRes.json();
      if (!me.authenticated) {
        throw new Error("Session could not be established.");
      }

      setAuth({ loading: false, user: me.user });
      setForm((prev) => ({
        ...prev,
        email: me.user.email,
        firstName: me.user.name || prev.firstName,
        lastName: me.user.surname || prev.lastName,
        age: me.user.age != null ? String(me.user.age) : prev.age,
        city: me.user.city || prev.city,
        bio: me.user.bio || prev.bio,
      }));
      if (Array.isArray(me.user.interests) && me.user.interests.length) {
        setInterests(me.user.interests);
      }
      if (me.user.profile_completed) {
        setSubmitted(true);
      }

      setError("");
    } catch (e) {
      console.error("[google auth] failed", e);
      setError(e.message || "Something went wrong.");
    }
  }, []);

  const handleGoogleSignOut = async () => {
    try {
      await authApi.logout();
    } catch (e) {
      console.error("[logout] failed", e);
    }
    window.google?.accounts?.id?.disableAutoSelect();
    setAuth({ loading: false, user: null });
    setForm({
      firstName: "",
      lastName: "",
      email: "",
      age: "",
      city: "",
      bio: "",
      interest: "",
    });
    setInterests([]);
    setError("");
    setSubmitted(false);
    setView("dashboard");
  };

  /* ============================================================
     GOOGLE: load GIS script
     ============================================================ */
  useEffect(() => {
    if (!GOOGLE_CONFIGURED) return;

    let cancelled = false;
    let pollTimer = null;

    const markReadyWhenApiExists = () => {
      const check = () => {
        if (cancelled) return;
        const api = window.google?.accounts?.id;
        if (api) {
          setGoogleScriptReady(true);
        } else {
          pollTimer = setTimeout(check, 100);
        }
      };
      check();
    };

    const existing = document.getElementById("google-gsi-client");
    if (existing) {
      markReadyWhenApiExists();
      return () => {
        cancelled = true;
        if (pollTimer) clearTimeout(pollTimer);
      };
    }

    const script = document.createElement("script");
    script.id = "google-gsi-client";
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;

    script.onload = () => markReadyWhenApiExists();
    script.onerror = () => setError("Failed to load Google sign-in module.");

    document.head.appendChild(script);

    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, []);

  /* ============================================================
     GOOGLE: render button
     ============================================================ */
  useEffect(() => {
    if (!googleScriptReady) return;
    if (googleUser) return;
    const container = googleSlotRef.current;
    if (!container) return;
    if (!window.google?.accounts?.id) return;

    try {
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleGoogleCredential,
        auto_select: false,
        cancel_on_tap_outside: true,
      });
    } catch (e) {
      console.error("[G] initialize() threw:", e);
    }

    const width = Math.min(
      400,
      Math.max(240, Math.round(container.offsetWidth || 340)),
    );

    container.innerHTML = "";
    try {
      window.google.accounts.id.renderButton(container, {
        type: "standard",
        theme: "filled_black",
        size: "large",
        text: "continue_with",
        shape: "pill",
        logo_alignment: "center",
        width,
      });
    } catch (e) {
      console.error("[G] renderButton() threw:", e);
    }
  }, [googleScriptReady, googleUser, handleGoogleCredential]);

  /* ============================================================
     SUBMIT
     ============================================================ */
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!googleUser) {
      setError("Please sign in with Google first.");
      return;
    }
    if (submitting) return;

    const nameRegex = /^[A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż ]+$/;

    if (!form.firstName.trim())
      return setError("Please enter your first name.");
    if (!nameRegex.test(form.firstName.trim()))
      return setError("First name can only contain letters.");
    if (!form.lastName.trim()) return setError("Please enter your last name.");
    if (!nameRegex.test(form.lastName.trim()))
      return setError("Last name can only contain letters.");

    const age = Number(form.age);
    if (!Number.isInteger(age) || age < 18 || age > 120) {
      return setError("You must be at least 18 years old to join.");
    }

    if (!form.city.trim()) return setError("Please enter your city.");

    const bio = form.bio.trim();
    if (bio && bio.length < 10) {
      return setError("Bio should be at least 10 characters.");
    }
    if (bio.length > 300) {
      return setError("Bio can be up to 300 characters.");
    }

    if (!interests.length) {
      return setError("Add at least one interest.");
    }

    setError("");
    setSubmitted(false);
    setSubmitting(true);

    try {
      const payload = {
        name: form.firstName.trim(),
        surname: form.lastName.trim(),
        age,
        city: form.city.trim(),
        bio,
        interests,
      };

      const res = await createUser(payload);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const detail = Array.isArray(err.detail)
          ? err.detail.map((d) => `${d.loc?.join(".")}: ${d.msg}`).join("; ")
          : err.detail;
        throw new Error(detail || "Something went wrong.");
      }

      setSubmitted(true);

      const meRes = await authApi.me();
      const me = await meRes.json();
      if (me.authenticated) {
        setAuth({ loading: false, user: me.user });
      }
    } catch (err) {
      console.error("[submit] error:", err);
      setError(err?.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const initials = (googleUser?.name || googleUser?.email || "?")
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const profileCompleted = Boolean(
    googleUser?.profile_completed ||
    (googleUser?.name && googleUser?.surname && googleUser?.age != null),
  );

  // === EKRAN PO ZALOGOWANIU ===
  if (googleUser && profileCompleted) {
    if (view === "events") {
      return <Events onBack={() => setView("dashboard")} />;
    }

    if (view === "explore") {
      return (
        <Explore
          user={googleUser}
          onBack={() => setView("dashboard")}
          onSignOut={handleGoogleSignOut}
        />
      );
    }

    return (
      <Dashboard
        user={googleUser}
        interests={interests}
        onSignOut={handleGoogleSignOut}
        onNavigate={setView}
      />
    );
  }

  return (
    <main className="page">
      <div className="register-container">
        <section className="intro">
          <div className="logo">
            <div className="logo-mark">FH</div>
            <span>findHER</span>
          </div>
          <div className="intro-content">
            <p className="eyebrow">FIND YOUR CIRCLE</p>
            <h1>
              Meet women
              <br />
              who get you.
            </h1>
            <p className="intro-text">
              findHER connects you with inspiring women near you — for
              friendship and collaboration. Share a few things
              about yourself and start discovering your people.
            </p>
          </div>
          <div className="intro-footer">
            <div className="avatar">FH</div>
            <div>
              <span>Be yourself — everyone here is too.</span>
            </div>
          </div>
        </section>

        <section className="form-section">
          <div className="form-wrapper">
            <div className="mobile-logo">
              <div className="logo-mark">FH</div>
              <span>findHER</span>
            </div>

            <header className="form-header">
              <p className="form-label">PROFILE</p>
              <h2>Join findHER</h2>
              <p>
                Tell us a bit about yourself so we can match you with the right
                women.
              </p>
            </header>

            {error && <div className="error-message">{error}</div>}
            {submitted && profileCompleted && (
              <div className="success-message">
                Welcome to findHER! Your profile has been created.
              </div>
            )}

            <div className="google-auth">
              {auth.loading ? (
                <div className="google-loading">Checking session…</div>
              ) : googleUser ? (
                <div className="google-account">
                  {googleUser.picture ? (
                    <img
                      className="google-avatar"
                      src={googleUser.picture}
                      alt=""
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="google-avatar google-avatar--fallback">
                      {initials}
                    </div>
                  )}
                  <div className="google-account-info">
                    <strong>{googleUser.name || googleUser.email}</strong>
                    <span>{googleUser.email}</span>
                  </div>
                  <button
                    type="button"
                    className="google-signout"
                    onClick={handleGoogleSignOut}
                    aria-label="Sign out of Google"
                    title="Sign out of Google"
                  >
                    <LogOut size={15} />
                  </button>
                </div>
              ) : GOOGLE_CONFIGURED ? (
                <>
                  <p className="google-required-text">
                    Sign in with Google to continue.
                  </p>
                  <div
                    className="google-slot"
                    ref={googleSlotRef}
                    style={{ minHeight: 44, minWidth: 240 }}
                  />
                </>
              ) : (
                <>
                  <button type="button" className="google-placeholder" disabled>
                    <GoogleIcon />
                    Continue with Google
                  </button>
                  <p className="google-hint">
                    Set <code>GOOGLE_CLIENT_ID</code> in <code>main.jsx</code>{" "}
                    to enable Google sign-in.
                  </p>
                </>
              )}
            </div>

            {googleUser && !profileCompleted && (
              <div className="auth-divider">
                <span>or</span>
              </div>
            )}

            {/* Formularz rejestracyjny – tylko gdy zalogowany i brak profilu */}
            {googleUser && !profileCompleted && (
              <form onSubmit={handleSubmit} noValidate>
                <div className="fields-row">
                  <label>
                    <span>First name</span>
                    <input
                      name="firstName"
                      value={form.firstName}
                      onChange={updateField}
                      placeholder="Jane"
                      autoComplete="given-name"
                    />
                  </label>
                  <label>
                    <span>Last name</span>
                    <input
                      name="lastName"
                      value={form.lastName}
                      onChange={updateField}
                      placeholder="Doe"
                      autoComplete="family-name"
                    />
                  </label>
                </div>
                <div className="fields-row">
                  <label>
                    <span>City</span>
                    <input
                      type="text"
                      name="city"
                      value={form.city}
                      onChange={updateField}
                      placeholder="Warsaw"
                      autoComplete="address-level2"
                    />
                  </label>
                </div>

                <div className="fields-row">
                  <label>
                    <span>
                      Email
                      <em className="verified-badge">verified</em>
                    </span>
                    <input
                      type="email"
                      name="email"
                      value={form.email}
                      readOnly
                      autoComplete="email"
                    />
                  </label>
                  <label>
                    <span>Age</span>
                    <input
                      type="number"
                      name="age"
                      min="18"
                      max="120"
                      value={form.age}
                      onChange={updateField}
                      placeholder="24"
                    />
                  </label>
                </div>

                <div className="fields-row">
                  <div>
                    <span>Bio</span>
                    <textarea
                      name="bio"
                      value={form.bio}
                      onChange={updateField}
                      placeholder="A few words about you — what you're into, what you're looking for…"
                      rows={4}
                      maxLength={300}
                    />
                    <small className="char-counter">
                      {form.bio.length}/300
                    </small>
                  </div>
                </div>

                <div className="interests">
                  <label>
                    <span>Interests</span>
                  </label>

                  <div className="interest-presets">
                    {PREDEFINED_INTERESTS.map((preset) => {
                      const active = interests.includes(preset);
                      return (
                        <button
                          type="button"
                          key={preset}
                          className={`interest-chip${active ? " interest-chip--active" : ""}`}
                          onClick={() => toggleInterest(preset)}
                          aria-pressed={active}
                        >
                          {active ? <Check size={13} /> : <Plus size={13} />}
                          {preset}
                        </button>
                      );
                    })}
                  </div>

                  <div className="interest-input">
                    <input
                      type="text"
                      name="interest"
                      value={form.interest}
                      onChange={updateField}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addInterest();
                        }
                      }}
                      placeholder="Or add your own…"
                    />
                    <button type="button" onClick={addInterest}>
                      <Plus size={17} />
                      Add
                    </button>
                  </div>

                  {interests.length > 0 && (
                    <div className="interest-list">
                      {interests.map((interest, index) => (
                        <div className="interest-tag" key={interest}>
                          <span>{interest}</span>
                          <button
                            type="button"
                            onClick={() => removeInterest(index)}
                            aria-label={`Remove ${interest}`}
                          >
                            <X size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  className="submit-button"
                  type="submit"
                  disabled={submitting}
                >
                  {submitting ? "Joining…" : "Join findHER"}
                  <ArrowRight size={18} />
                </button>
              </form>
            )}

            {!googleUser && (
              <p className="login">
                Already have an account?{" "}
                <a
                  href="#login"
                  onClick={(e) => {
                    e.preventDefault();
                    googleSlotRef.current
                      ?.querySelector("div[role=button]")
                      ?.click();
                  }}
                >
                  Log in
                </a>
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
