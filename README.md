# findHER 🌸

A community platform that connects women nearby — for friendship, collaboration, or something more. Users sign in with Google, build a profile with interests, discover other women, and create/join local events.

---

## ✨ Features

- **Google Sign-In** — OAuth 2.0 via Google Identity Services, JWT session cookies (access + refresh with rotation)
- **Profile creation** — name, surname, city, age, bio, and interests (predefined chips + custom)
- **Explore** — browse other users and their interests
- **Events** — create and join local meetups with date, place, and description
  - Creator automatically becomes a participant
  - Participants list is **only visible to members** (hidden until you join)
  - Host can delete; members can leave; non-members see a lock hint
- **Secure by design** — HTTP-only cookies, hashed refresh tokens, server-side participant gating

---

## 🧱 Tech Stack

| Layer    | Tech                                          |
| -------- | --------------------------------------------- |
| Frontend | React 18, Vite, lucide-react                  |
| Backend  | FastAPI, SQLite, `python-jose`, `google-auth` |
| Auth     | Google Identity Services + JWT (HS256)        |
| Styling  | Plain CSS (dark theme)                        |

---

## 📁 Project Structure

```
.
├── backend/
│ ├── main.py # FastAPI app: auth, users, events
│ └── findher.db # SQLite (auto-created on first run)
│
├── frontend/
│ ├── main.jsx # Entry point + <App/> (auth state, routing)
│ ├── App.css
│ ├── api.js # fetch wrappers (authApi, createUser)
│ ├── Dashboard.jsx # Post-login dashboard
│ ├── Dashboard.css
│ ├── Explore.jsx # Browse other users
│ ├── Events.jsx # Events list + create + join/leave
│ ├── Events.css
│ └── index.css
│
└── README.md

```

---

## 🚀 Getting Started

### Prerequisites

- Node.js ≥ 18
- Python ≥ 3.10
- A Google OAuth Client ID ([console.cloud.google.com](https://console.cloud.google.com/apis/credentials))

### 1. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate
pip install fastapi uvicorn python-jose[cryptography] google-auth pydantic
```

Set environment variables:

```bash
export GOOGLE_CLIENT_ID="<your-client-id>.apps.googleusercontent.com"
export JWT_SECRET_KEY="<random-long-string>"   # optional in dev; generated if missing
export ENV="dev"                                # "production" enables Secure cookies
```

Run:

```bash
uvicorn main:app --reload --port 8000
```

The SQLite file (`findher.db`) and all tables (users, refresh_tokens, events, event_participants) are created automatically on first startup.

### 2. Frontend

```bash
cd frontend
npm install
```

Create `.env`:

```env
VITE_API_URL=http://localhost:8000
```

Run:

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

> **Important:** In `main.jsx`, set `GOOGLE_CLIENT_ID` to the same client ID used on the backend, and add `http://localhost:5173` to **Authorized JavaScript origins** in Google Cloud Console.

---

## 🔐 Authentication Flow

1. User clicks the Google button → Google returns an **ID token (credential)**.
2. Frontend POSTs it to `/auth/google`.
3. Backend verifies the token with Google, upserts the user, and sets two HTTP-only cookies:
   - `access_token` (15 min, JWT)
   - `refresh_token` (30 days, opaque, SHA-256 hashed in DB)
4. Protected endpoints read the access token from the cookie.
5. `/auth/refresh` rotates the refresh token on each use.
6. `/auth/logout` revokes the refresh token and clears cookies.

---

## 🗄️ Data Model

### `users`

| Column     | Type        | Notes             |
| ---------- | ----------- | ----------------- |
| id         | INTEGER PK  |                   |
| google_sub | TEXT UNIQUE | Google subject ID |
| name       | TEXT        |                   |
| surname    | TEXT        |                   |
| city       | TEXT        |                   |
| email      | TEXT UNIQUE |                   |
| age        | INTEGER     |                   |
| interests  | JSON        | array of strings  |
| bio        | TEXT        |                   |
| created_at | TEXT        |                   |

### `refresh_tokens`

| Column     | Type        | Notes                         |
| ---------- | ----------- | ----------------------------- |
| id         | INTEGER PK  |                               |
| user_id    | INTEGER FK  | → users(id) ON DELETE CASCADE |
| token_hash | TEXT UNIQUE | SHA-256 of raw token          |
| expires_at | TEXT        |                               |
| revoked    | INTEGER     | 0 / 1                         |
| created_at | TEXT        |                               |

### `events`

| Column      | Type       | Notes                         |
| ----------- | ---------- | ----------------------------- |
| id          | INTEGER PK |                               |
| creator_id  | INTEGER FK | → users(id) ON DELETE CASCADE |
| name        | TEXT       |                               |
| event_date  | TEXT       | ISO string                    |
| place       | TEXT       |                               |
| description | TEXT       |                               |
| created_at  | TEXT       |                               |

### `event_participants`

| Column    | Type       | Notes                          |
| --------- | ---------- | ------------------------------ |
| event_id  | INTEGER FK | → events(id) ON DELETE CASCADE |
| user_id   | INTEGER FK | → users(id) ON DELETE CASCADE  |
| joined_at | TEXT       |                                |

Primary key: `(event_id, user_id)`.

---

## 📡 API Reference

### Auth

| Method | Endpoint        | Description                            |
| ------ | --------------- | -------------------------------------- |
| POST   | `/auth/google`  | Verify Google credential, set cookies  |
| POST   | `/auth/refresh` | Rotate refresh token, issue new access |
| POST   | `/auth/logout`  | Revoke refresh token, clear cookies    |
| GET    | `/auth/me`      | Current session info                   |

### Users

| Method | Endpoint      | Description                   |
| ------ | ------------- | ----------------------------- |
| POST   | `/add-User`   | Create/update current profile |
| GET    | `/Users`      | List all users with profiles  |
| GET    | `/Users/{id}` | Get single user               |

### Events

| Method | Endpoint                    | Description                                         |
| ------ | --------------------------- | --------------------------------------------------- |
| POST   | `/events`                   | Create event (creator auto-joins)                   |
| GET    | `/events`                   | List all events (participants hidden unless joined) |
| GET    | `/events/{id}`              | Single event                                        |
| GET    | `/events/{id}/participants` | Participants list (403 unless a member)             |
| POST   | `/events/{id}/join`         | Join event                                          |
| DELETE | `/events/{id}/leave`        | Leave event (creator cannot leave)                  |
| DELETE | `/events/{id}`              | Delete event (creator only)                         |

---

## 🛡️ Security Notes

- **HTTP-only cookies** — tokens are not readable from JavaScript.
- **Refresh token rotation** — every `/auth/refresh` invalidates the old token.
- **Hashed refresh tokens** — DB leak doesn't expose usable tokens.
- **Server-side gating** — even if a client tampers with the UI, `/events` will not return participants for non-members.
- **SameSite=strict + Secure** in production (`ENV=production`).

---

## 🧪 Manual Testing Checklist

- [ ] Sign in with Google → cookies are set → `/auth/me` returns user
- [ ] Complete profile → `profile_completed: true`
- [ ] Create event → appears in list with **Host** badge
- [ ] As another user: see the event, count `1 attendee`, lock hint
- [ ] Click **Join** → avatars appear, list expands
- [ ] DevTools → Network → `/events` does **not** contain other participants when you're not a member
- [ ] Creator cannot **Leave** (button shows **Delete** instead)
- [ ] Refresh page → session persists (access + refresh rotation)
- [ ] Logout → cookies cleared, `/auth/me` returns `authenticated: false`

---

## 🗺️ Roadmap

- [ ] Matches (swipe / like)
- [ ] Groups & group chat
- [ ] Event chat / comments
- [ ] Email notifications
- [ ] Profile pictures upload
- [ ] Location-based filtering (city / radius)
- [ ] i18n (EN / PL)
