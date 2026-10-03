import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { Plus, X, ArrowRight } from "lucide-react";
import "./App.css";

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
    });
  };

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
                  <span>E-mail</span>
                  <input
                    type="email"
                    name="email"
                    value={form.email}
                    onChange={updateField}
                    placeholder="anna@example.com"
                    autoComplete="email"
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
