import React, { useState, useEffect, useRef, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { Plus, X, ArrowRight, LogOut } from "lucide-react";
import "./App.css";

/* ==================================================================
   KONFIGURACJA LOGOWANIA GOOGLE
   ------------------------------------------------------------------
   1. Wejdź na https://console.cloud.google.com/apis/credentials
   2. Utwórz "OAuth 2.0 Client ID" → typ "Web application"
   3. W "Authorized JavaScript origins" dodaj adres aplikacji,
      np. http://localhost:5173  (bez końcowego slasha)
   4. Wklej wygenerowany Client ID poniżej (zamiast placeholdera).
   ================================================================== */
const GOOGLE_CLIENT_ID = "TWOJ_CLIENT_ID.apps.googleusercontent.com";

const GOOGLE_CONFIGURED =
  Boolean(GOOGLE_CLIENT_ID) &&
  !GOOGLE_CLIENT_ID.startsWith("TWOJ_") &&
  GOOGLE_CLIENT_ID.endsWith(".apps.googleusercontent.com");

/* Dekodowanie payloadu z ID tokena (JWT) zwróconego przez Google.
   Uwaga: to tylko odczyt danych do UI — w prawdziwej aplikacji
   token MUSI zostać zweryfikowany po stronie serwera. */
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
  } catch {
    return null;
  }
}

/* Oficjalne logo Google (używane tylko w widoku "nieskonfigurowane") */
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

  /* ---- Google ---- */
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
      setError("To zainteresowanie jest już na liście.");
      return;
    }

    setInterests([...interests, interest]);
    setForm({ ...form, interest: "" });
    setError("");
  };

  const removeInterest = (index) => {
    setInterests(interests.filter((_, i) => i !== index));
  };

  /* ---------------- GOOGLE: obsługa odpowiedzi ---------------- */
  const handleGoogleCredential = useCallback((response) => {
    const payload = decodeJwt(response?.credential);

    if (!payload?.email) {
      setError("Nie udało się zalogować przez Google. Spróbuj ponownie.");
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
    window.google?.accounts?.id?.disableAutoSelect();
    setGoogleUser(null);
    setForm((prev) => ({
      ...prev,
      firstName: "",
      lastName: "",
      email: "",
    }));
    setError("");
    setSubmitted(false);
  };

  /* ---------------- GOOGLE: ładowanie skryptu GIS ---------------- */
  useEffect(() => {
    if (!GOOGLE_CONFIGURED) return;

    if (document.getElementById("google-gsi-client")) {
      setGoogleScriptReady(true);
      return;
    }

    const script = document.createElement("script");
    script.id = "google-gsi-client";
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => setGoogleScriptReady(true);
    script.onerror = () =>
      setError("Nie udało się wczytać modułu logowania Google.");

    document.head.appendChild(script);
  }, []);

  /* ---------------- GOOGLE: render przycisku ---------------- */
  useEffect(() => {
    if (!googleScriptReady) return;

    const container = googleSlotRef.current;
    if (!container || !window.google?.accounts?.id) return;

    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleGoogleCredential,
      auto_select: false,
      cancel_on_tap_outside: true,
    });

    const width = Math.min(
      400,
      Math.max(240, Math.round(container.offsetWidth || 340)),
    );

    container.innerHTML = "";
    window.google.accounts.id.renderButton(container, {
      type: "standard",
      theme: "filled_black",
      size: "large",
      text: "continue_with",
      shape: "pill",
      logo_alignment: "center",
      width,
    });
  }, [googleScriptReady, googleUser, handleGoogleCredential]);

  /* ---------------- Submit ---------------- */
  const handleSubmit = (e) => {
    e.preventDefault();

    const nameRegex = /^[A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż ]+$/;

    if (!form.firstName.trim()) return setError("Podaj imię.");
    if (!nameRegex.test(form.firstName.trim())) {
      return setError("Imię może zawierać tylko litery alfabetu.");
    }

    if (!form.lastName.trim()) return setError("Podaj nazwisko.");
    if (!nameRegex.test(form.lastName.trim())) {
      return setError("Nazwisko może zawierać tylko litery alfabetu.");
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      return setError("Podaj prawidłowy adres e-mail.");
    }

    const age = Number(form.age);
    if (!Number.isInteger(age) || age < 18 || age > 120) {
      return setError("Musisz mieć ukończone 18 lat, aby dołączyć.");
    }

    if (!interests.length) {
      return setError("Dodaj przynajmniej jedno zainteresowanie.");
    }

    setError("");
    setSubmitted(true);

    console.log({
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
                Witaj w findHER! Twój profil został utworzony.
              </div>
            )}

            {/* ---------------- GOOGLE AUTH ---------------- */}
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
                    aria-label="Wyloguj z Google"
                    title="Wyloguj z Google"
                  >
                    <LogOut size={15} />
                  </button>
                </div>
              ) : GOOGLE_CONFIGURED ? (
                <div className="google-slot" ref={googleSlotRef} />
              ) : (
                <>
                  <button type="button" className="google-placeholder" disabled>
                    <GoogleIcon />
                    Kontynuuj z Google
                  </button>
                  <p className="google-hint">
                    Ustaw <code>GOOGLE_CLIENT_ID</code> w <code>main.jsx</code>,
                    aby włączyć logowanie Google.
                  </p>
                </>
              )}
            </div>

            {!googleUser && (
              <div className="auth-divider">
                <span>lub</span>
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="fields-row">
                <label>
                  <span>Imię</span>
                  <input
                    name="firstName"
                    value={form.firstName}
                    onChange={updateField}
                    placeholder="Anna"
                    autoComplete="given-name"
                  />
                </label>

                <label>
                  <span>Nazwisko</span>
                  <input
                    name="lastName"
                    value={form.lastName}
                    onChange={updateField}
                    placeholder="Kowalska"
                    autoComplete="family-name"
                  />
                </label>
              </div>

              <div className="fields-row">
                <label>
                  <span>
                    E-mail
                    {googleUser && (
                      <em className="verified-badge">zweryfikowany</em>
                    )}
                  </span>
                  <input
                    type="email"
                    name="email"
                    value={form.email}
                    onChange={updateField}
                    placeholder="anna@example.com"
                    autoComplete="email"
                    readOnly={Boolean(googleUser)}
                  />
                </label>

                <label>
                  <span>Wiek</span>
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
                  <span>Zainteresowania</span>
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
                    placeholder="np. joga, podróże, sztuka"
                  />

                  <button type="button" onClick={addInterest}>
                    <Plus size={17} />
                    Dodaj
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
                          aria-label={`Usuń ${interest}`}
                        >
                          <X size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button className="submit-button" type="submit">
                Dołącz do findHER
                <ArrowRight size={18} />
              </button>
            </form>

            <p className="login">
              Masz już konto? <a href="#login">Zaloguj się</a>
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
