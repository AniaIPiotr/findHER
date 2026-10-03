import React, { useState, useEffect, useRef, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { Plus, X, ArrowRight, LogOut } from "lucide-react";
import "./App.css";

const GOOGLE_CLIENT_ID =
  "4201094175-6m5g8qthid8hrnq6broebfq2ek699n0j.apps.googleusercontent.com";

const GOOGLE_CONFIGURED =
  Boolean(GOOGLE_CLIENT_ID) &&
  !GOOGLE_CLIENT_ID.startsWith("YOUR_") &&
  GOOGLE_CLIENT_ID.endsWith(".apps.googleusercontent.com");

function decodeJwt(token) {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const json = decodeURIComponent(
      atob(padded)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join(""),
    );
    return JSON.parse(json);
  } catch (e) {
    console.error("[G] decodeJwt failed", e);
    return null;
  }
}

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
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    age: "",
    interest: "",
  });
  const [interests, setInterests] = useState([]);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const [googleUser, setGoogleUser] = useState(null);
  const [googleScriptReady, setGoogleScriptReady] = useState(false);
  const googleSlotRef = useRef(null);

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

  const removeInterest = (index) => {
    setInterests(interests.filter((_, i) => i !== index));
  };

  const handleGoogleCredential = useCallback((response) => {
    console.group("[G] credential callback");
    console.log("[G] raw response:", response);
    const payload = decodeJwt(response?.credential);
    console.log("[G] decoded payload:", payload);
    console.groupEnd();

    if (!payload?.email) {
      setError("Failed to sign in with Google. Please try again.");
      return;
    }

    setGoogleUser({
      sub: payload.sub,
      name: payload.name || payload.email,
      email: payload.email,
      picture: payload.picture || "",
      emailVerified: payload.email_verified,
    });

    setForm((prev) => ({
      ...prev,
      firstName: payload.given_name || prev.firstName,
      lastName: payload.family_name || prev.lastName,
      email: payload.email,
    }));

    setError("");
    setSubmitted(false);
  }, []);

  const handleGoogleSignOut = () => {
    console.log("[G] sign out clicked");
    window.google?.accounts?.id?.disableAutoSelect();
    setGoogleUser(null);
    setForm((prev) => ({ ...prev, firstName: "", lastName: "", email: "" }));
    setError("");
    setSubmitted(false);
  };

  /* ============================================================
     GOOGLE: load GIS script (with polling for API readiness)
     ============================================================ */
  useEffect(() => {
    console.group("[G] === script-load effect ===");
    console.log("[G] GOOGLE_CONFIGURED =", GOOGLE_CONFIGURED);
    console.log("[G] GOOGLE_CLIENT_ID  =", GOOGLE_CLIENT_ID);
    console.groupEnd();

    if (!GOOGLE_CONFIGURED) {
      console.warn("[G] Google not configured — skipping script load.");
      return;
    }

    let cancelled = false;
    let pollTimer = null;

    const markReadyWhenApiExists = (label) => {
      const check = () => {
        if (cancelled) return;
        const api = window.google?.accounts?.id;
        if (api) {
          console.log(
            `[G] API ready via ${label}. window.google.accounts.id:`,
            api,
          );
          setGoogleScriptReady(true);
        } else {
          console.log(
            `[G] ${label}: window.google.accounts.id not ready yet, retrying…`,
          );
          pollTimer = setTimeout(check, 100);
        }
      };
      check();
    };

    const existing = document.getElementById("google-gsi-client");
    if (existing) {
      console.log("[G] Script tag already in DOM:", existing);
      console.log(
        "[G] existing.readyState (non-standard):",
        existing.readyState,
      );
      markReadyWhenApiExists("existing-tag-poll");
      return () => {
        cancelled = true;
        if (pollTimer) clearTimeout(pollTimer);
      };
    }

    console.log("[G] Creating <script> for GIS…");
    const script = document.createElement("script");
    script.id = "google-gsi-client";
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;

    script.onload = () => {
      console.log("[G] script.onload fired");
      console.log("[G] window.google:", window.google);
      console.log("[G] window.google?.accounts:", window.google?.accounts);
      console.log(
        "[G] window.google?.accounts?.id:",
        window.google?.accounts?.id,
      );
      markReadyWhenApiExists("onload-poll");
    };
    script.onerror = (e) => {
      console.error("[G] script.onerror:", e);
      setError("Failed to load Google sign-in module.");
    };

    document.head.appendChild(script);

    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, []);

  /* ============================================================
     GOOGLE: render button (with heavy diagnostics)
     ============================================================ */
  useEffect(() => {
    console.group("[G] === render-button effect ===");
    console.log("[G] googleScriptReady =", googleScriptReady);
    console.log("[G] googleUser        =", googleUser);
    console.log(
      "[G] window.google?.accounts?.id =",
      window.google?.accounts?.id,
    );

    if (!googleScriptReady) {
      console.warn("[G] Not ready yet, bailing.");
      console.groupEnd();
      return;
    }

    const container = googleSlotRef.current;
    console.log("[G] container ref:", container);

    if (!container) {
      console.warn(
        "[G] googleSlotRef.current is null — the DOM node isn't mounted.",
      );
      console.groupEnd();
      return;
    }
    if (!window.google?.accounts?.id) {
      console.warn("[G] window.google.accounts.id missing at render time.");
      console.groupEnd();
      return;
    }

    const rect = container.getBoundingClientRect();
    const cs = getComputedStyle(container);
    console.log("[G] container.getBoundingClientRect():", rect);
    console.log(
      "[G] container.offsetWidth / offsetHeight:",
      container.offsetWidth,
      container.offsetHeight,
    );
    console.log(
      "[G] container.clientWidth / clientHeight:",
      container.clientWidth,
      container.clientHeight,
    );
    console.log(
      "[G] container computed:",
      "display =",
      cs.display,
      "| visibility =",
      cs.visibility,
      "| opacity =",
      cs.opacity,
      "| width =",
      cs.width,
      "| height =",
      cs.height,
      "| overflow =",
      cs.overflow,
    );
    console.log("[G] parent element:", container.parentElement);
    if (container.parentElement) {
      const pcs = getComputedStyle(container.parentElement);
      console.log(
        "[G] parent computed:",
        "display =",
        pcs.display,
        "| visibility =",
        pcs.visibility,
        "| opacity =",
        pcs.opacity,
        "| width =",
        pcs.width,
        "| height =",
        pcs.height,
      );
    }

    console.log("[G] Calling initialize() with client_id:", GOOGLE_CLIENT_ID);
    try {
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleGoogleCredential,
        auto_select: false,
        cancel_on_tap_outside: true,
      });
      console.log("[G] initialize() completed without throwing.");
    } catch (e) {
      console.error("[G] initialize() threw:", e);
    }

    const width = Math.min(
      400,
      Math.max(240, Math.round(container.offsetWidth || 340)),
    );
    console.log("[G] computed button width =", width);

    container.innerHTML = "";
    console.log(
      "[G] cleared container. innerHTML now:",
      JSON.stringify(container.innerHTML),
    );

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
      console.log("[G] renderButton() returned.");
    } catch (e) {
      console.error("[G] renderButton() threw:", e);
    }

    /* --- Post-render inspection --- */
    const inspect = (delay) => {
      setTimeout(() => {
        console.group(`[G] --- post-render inspect (+${delay}ms) ---`);
        console.log(
          "[G] container.childNodes.length:",
          container.childNodes.length,
        );
        console.log(
          "[G] container.children.length:  ",
          container.children.length,
        );
        console.log(
          "[G] container.innerHTML length: ",
          container.innerHTML.length,
        );
        console.log(
          "[G] container.innerHTML (first 400 chars):",
          container.innerHTML.slice(0, 400),
        );

        const iframe = container.querySelector("iframe");
        console.log("[G] iframe in container:", iframe);
        if (iframe) {
          const irect = iframe.getBoundingClientRect();
          const ics = getComputedStyle(iframe);
          console.log("[G] iframe rect:", irect);
          console.log(
            "[G] iframe computed:",
            "display =",
            ics.display,
            "| visibility =",
            ics.visibility,
            "| opacity =",
            ics.opacity,
            "| width =",
            ics.width,
            "| height =",
            ics.height,
          );
          console.log("[G] iframe src:", iframe.src);
        }

        const inner = container.querySelector("div");
        if (inner) {
          const idiv = inner.getBoundingClientRect();
          const ics = getComputedStyle(inner);
          console.log("[G] inner div rect:", idiv);
          console.log(
            "[G] inner div computed:",
            "display =",
            ics.display,
            "| visibility =",
            ics.visibility,
            "| opacity =",
            ics.opacity,
            "| width =",
            ics.width,
            "| height =",
            ics.height,
          );
        }

        console.log(
          "[G] container rect after render:",
          container.getBoundingClientRect(),
        );
        console.groupEnd();
      }, delay);
    };
    inspect(50);
    inspect(300);
    inspect(1000);

    console.groupEnd();
  }, [googleScriptReady, googleUser, handleGoogleCredential]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const nameRegex = /^[A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż ]+$/;

    if (!form.firstName.trim())
      return setError("Please enter your first name.");
    if (!nameRegex.test(form.firstName.trim()))
      return setError("First name can only contain letters.");
    if (!form.lastName.trim()) return setError("Please enter your last name.");
    if (!nameRegex.test(form.lastName.trim()))
      return setError("Last name can only contain letters.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      return setError("Please enter a valid email address.");

    const age = Number(form.age);
    if (!Number.isInteger(age) || age < 18 || age > 120) {
      return setError("You must be at least 18 years old to join.");
    }
    if (!interests.length) return setError("Add at least one interest.");

    setError("");
    setSubmitted(true);
    console.log("[submit] payload:", {
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email,
      age,
      interests,
      google: googleUser
        ? { sub: googleUser.sub, email: googleUser.email }
        : null,
    });
  };

  const initials = (googleUser?.name || googleUser?.email || "?")
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

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
              friendship, collaboration, or something more. Share a few things
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
            {submitted && (
              <div className="success-message">
                Welcome to findHER! Your profile has been created.
              </div>
            )}

            <div className="google-auth">
              {googleUser ? (
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
                    <strong>{googleUser.name}</strong>
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
                <div
                  className="google-slot"
                  ref={googleSlotRef}
                  style={{ minHeight: 44, minWidth: 240 }}
                />
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

            {!googleUser && (
              <div className="auth-divider">
                <span>or</span>
              </div>
            )}

            <form onSubmit={handleSubmit}>
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
                  <span>
                    Email
                    {googleUser && <em className="verified-badge">verified</em>}
                  </span>
                  <input
                    type="email"
                    name="email"
                    value={form.email}
                    onChange={updateField}
                    placeholder="jane@example.com"
                    autoComplete="email"
                    readOnly={Boolean(googleUser)}
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

              <div className="interests">
                <label>
                  <span>Interests</span>
                </label>
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
                    placeholder="e.g. yoga, travel, art"
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

              <button className="submit-button" type="submit">
                Join findHER
                <ArrowRight size={18} />
              </button>
            </form>

            <p className="login">
              Already have an account? <a href="#login">Log in</a>
            </p>
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
