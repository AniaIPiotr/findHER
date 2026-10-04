# main.py
# ============================================================
#  findHER — backend (FastAPI + SQLite + SQLAlchemy)
# ============================================================
import os
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import FastAPI, Depends, HTTPException, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from pydantic import BaseModel, EmailStr
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Table,
    Text,
    create_engine,
    func,
    select,
)
from sqlalchemy.orm import Session, declarative_base, relationship, sessionmaker

# ============================================================
#  KONFIGURACJA
# ============================================================
GOOGLE_CLIENT_ID = os.getenv(
    "GOOGLE_CLIENT_ID",
    "4201094175-6m5g8qthid8hrnq6broebfq2ek699n0j.apps.googleusercontent.com",
)
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY") or secrets.token_hex(32)
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 15
REFRESH_TOKEN_EXPIRE_DAYS = 30
IS_PROD = os.getenv("ENV", "dev") == "production"

DB = "findher.db"

app = FastAPI()

origins = ["https://mzums.com", "http://localhost:5173"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------- BAZA ----------
def get_conn():
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    with get_conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                google_sub TEXT UNIQUE,
                name TEXT,
                surname TEXT,
                city TEXT,
                email TEXT UNIQUE NOT NULL,
                age INTEGER,
                interests JSON,
                bio TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)
        # migracja dla istniejącej tabeli bez google_sub
        cols = {r["name"] for r in conn.execute("PRAGMA table_info(users)")}
        if "google_sub" not in cols:
            conn.execute("ALTER TABLE users ADD COLUMN google_sub TEXT")
        conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub ON users(google_sub)"
        )
        conn.execute("""
            CREATE TABLE IF NOT EXISTS refresh_tokens (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                token_hash TEXT NOT NULL UNIQUE,
                expires_at TEXT NOT NULL,
                revoked INTEGER NOT NULL DEFAULT 0,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens(user_id)"
        )

        # ---------- EVENTS ----------
        conn.execute("""
            CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                creator_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                event_date TEXT NOT NULL,
                place TEXT NOT NULL,
                description TEXT DEFAULT '',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_events_date ON events(event_date)"
        )
        conn.execute("""
            CREATE TABLE IF NOT EXISTS event_participants (
                event_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                joined_at TEXT DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (event_id, user_id),
                FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_event_participants_user ON event_participants(user_id)"
        )


init_db()

# ---------- MODELE ----------
class GoogleAuthRequest(BaseModel):
    credential: str


class ProfileIn(BaseModel):
    name: str
    surname: str
    age: int
    city: str = ""
    bio: str = ""
    interests: List[str] = []


class UserOut(BaseModel):
    id: int
    email: str
    name: str
    surname: str
    age: Optional[int] = None
    city: str = ""
    bio: str = ""
    interests: List[str] = []
    profile_completed: bool = False


class GoogleAuthIn(BaseModel):
    credential: str


class GroupCreate(BaseModel):
    name: str
    event_date: str  # ISO string, np. "2024-06-15T18:00"
    place: str
    description: str = ""


class GroupInvite(BaseModel):
    email: EmailStr


class GroupMemberOut(BaseModel):
    id: int
    name: str
    surname: str
    email: str
    city: str = ""
    bio: str = ""
    age: int = 0
    interests: List[str] = []
    status: str  # "owner" | "accepted" | "invited"


class GroupOut(BaseModel):
    id: int
    name: str
    description: str
    owner_id: int
    created_at: datetime
    member_count: int
    members: List[GroupMemberOut] = []


# ============================================================
#  APP + CORS
# ============================================================
app = FastAPI(title="findHER API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
#  HELPERS: sesja / serializacja
# ============================================================
import json
import secrets


def user_to_out(u: User) -> UserOut:
    return UserOut(
        id=u.id,
        email=u.email,
        name=u.name or "",
        surname=u.surname or "",
        age=u.age,
        city=u.city or "",
        bio=u.bio or "",
        interests=u.interests_list(),
        profile_completed=bool(u.profile_completed),
    )


def create_session(db: Session, user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    expires = datetime.utcnow() + timedelta(days=SESSION_TTL_DAYS)
    db.add(SessionToken(token=token, user_id=user_id, expires_at=expires))
    db.commit()
    return token


def set_session_cookie(response: Response, token: str):
    response.set_cookie(
        key=SESSION_COOKIE,
        value=token,
        httponly=True,
        samesite="lax",
        secure=False,   # True na HTTPS w produkcji
        max_age=SESSION_TTL_DAYS * 24 * 3600,
        path="/",
    )


def clear_session_cookie(response: Response):
    response.delete_cookie(SESSION_COOKIE, path="/")


def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    row = db.get(SessionToken, token)
    if not row or row.expires_at < datetime.utcnow():
        raise HTTPException(status_code=401, detail="Session expired")

    user = db.get(User, row.user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


# ============================================================
#  AUTH: Google
# ============================================================
@app.post("/auth/google")
def auth_google(
    payload: GoogleAuthIn,
    response: Response,
    db: Session = Depends(get_db),
):
    try:
        info = google_id_token.verify_oauth2_token(
            payload.credential,
            google_requests.Request(),
            GOOGLE_CLIENT_ID,
        )
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid Google token: {e}")

    email = info.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="Google account has no email")

    user = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
    if not user:
        user = User(
            email=email,
            name=info.get("given_name", "") or "",
            surname=info.get("family_name", "") or "",
            profile_completed=False,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    else:
        # aktualizuj avatar / imię z Google, jeśli się zmieniło
        changed = False
        if changed:
            db.commit()
            db.refresh(user)

    token = create_session(db, user.id)
    set_session_cookie(response, token)
    return {"ok": True, "user": user_to_out(user).model_dump()}


@app.get("/auth/me")
def auth_me(request: Request, db: Session = Depends(get_db)):
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        return {"authenticated": False, "user": None}

    row = db.get(SessionToken, token)
    if not row or row.expires_at < datetime.utcnow():
        return {"authenticated": False, "user": None}

    user = db.get(User, row.user_id)
    if not user:
        return {"authenticated": False, "user": None}

    return {"authenticated": True, "user": user_to_out(user).model_dump()}


@app.post("/auth/logout")
def auth_logout(response: Response, request: Request, db: Session = Depends(get_db)):
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        row = db.get(SessionToken, token)
        if row:
            db.delete(row)
            db.commit()
    clear_session_cookie(response)
    return {"ok": True}


# ============================================================
#  USERS
# ============================================================
@app.post("/add-User")
def add_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    me: User = Depends(current_user),
):
    name = payload.name.strip()
    surname = payload.surname.strip()
    city = (payload.city or "").strip()
    bio = (payload.bio or "").strip()

    if not name:
        raise HTTPException(400, "Name is required")
    if not surname:
        raise HTTPException(400, "Surname is required")
    if payload.age is None or payload.age < 18 or payload.age > 120:
        raise HTTPException(400, "Age must be between 18 and 120")
    if not city:
        raise HTTPException(400, "City is required")

    me.name = name
    me.surname = surname
    me.age = payload.age
    me.city = city
    me.bio = bio
    me.interests = json.dumps(payload.interests or [])
    me.profile_completed = True

    db.commit()
    db.refresh(me)
    return user_to_out(me)


# ---------- USERS ----------
@app.post("/add-User", response_model=UserOut, status_code=201)
def add_user(p: ProfileIn, request: Request):
    user = require_user(request)
    user_id = int(user["sub"])

    with get_conn() as conn:
        cur = conn.execute(
            "UPDATE users SET name=?, surname=?, city=?, age=?, interests=?, bio=? WHERE id=?",
            (p.name, p.surname, p.city, p.age, json.dumps(p.interests), p.bio, user_id),
        )
        if cur.rowcount == 0:
            raise HTTPException(404, "User not found")
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()

    r = dict(row)
    r["interests"] = json.loads(r["interests"] or "[]")
    return r


@app.get("/Users", response_model=list[UserOut])
def list_users():
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM users WHERE name IS NOT NULL"
        ).fetchall()
    out = []
    for row in rows:
        r = dict(row)
        r["interests"] = json.loads(r["interests"] or "[]")
        out.append(r)
    return out


@app.get("/Users/{user_id}", response_model=UserOut)
def get_user(user_id: int):
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if row is None:
        raise HTTPException(404, "Not found")
    r = dict(row)
    r["interests"] = json.loads(r["interests"] or "[]")
    return r


# ---------- EVENTS ----------
def _serialize_event(conn, ev_row: sqlite3.Row, current_user_id: int | None) -> dict:
    ev = dict(ev_row)
    parts = conn.execute(
        """
        SELECT u.id, u.name, u.surname, u.email, u.city, ep.joined_at
        FROM event_participants ep
        JOIN users u ON u.id = ep.user_id
        WHERE ep.event_id = ?
        ORDER BY (u.id = ?) DESC, ep.joined_at ASC
        """,
        (ev["id"], ev["creator_id"]),
    ).fetchall()
    participants = [dict(p) for p in parts]
    ev["participants"] = participants
    ev["participant_count"] = len(participants)
    ev["is_creator"] = current_user_id is not None and ev["creator_id"] == current_user_id
    ev["is_joined"] = (
        current_user_id is not None
        and any(p["id"] == current_user_id for p in participants)
    )
    return ev


@app.post("/events", status_code=201)
def create_event(p: EventIn, request: Request):
    user = require_user(request)
    user_id = int(user["sub"])
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO events (creator_id, name, event_date, place, description) "
            "VALUES (?, ?, ?, ?, ?)",
            (user_id, p.name, p.event_date, p.place, p.description),
        )
        event_id = cur.lastrowid
        # twórca automatycznie jest uczestnikiem
        conn.execute(
            "INSERT INTO event_participants (event_id, user_id) VALUES (?, ?)",
            (event_id, user_id),
        )
    return {"ok": True, "id": event_id}


@app.get("/groups/{group_id}", response_model=GroupOut)
def get_group(
    group_id: int,
    db: Session = Depends(get_db),
    me: User = Depends(current_user),
):
    group = db.get(Group, group_id)
    if not group:
        raise HTTPException(404, "Group not found")

    row = db.execute(
        select(group_members.c.status)
        .where(group_members.c.group_id == group_id)
        .where(group_members.c.user_id == me.id)
    ).first()

    if not row:
        raise HTTPException(403, "You are not a member of this group")

    return _serialize_group(group, db)


@app.post("/groups/{group_id}/invite", response_model=GroupOut)
def invite_member(
    group_id: int,
    payload: GroupInvite,
    db: Session = Depends(get_db),
    me: User = Depends(current_user),
):
    group = db.get(Group, group_id)
    if not group:
        raise HTTPException(404, "Group not found")
    if group.owner_id != me.id:
        raise HTTPException(403, "Only the group owner can invite members")

    invited = db.execute(
        select(User).where(User.email == payload.email)
    ).scalar_one_or_none()
    if not invited:
        raise HTTPException(404, "No user with that email")

    existing = db.execute(
        select(group_members.c.status)
        .where(group_members.c.group_id == group_id)
        .where(group_members.c.user_id == invited.id)
    ).first()

    if existing:
        raise HTTPException(400, "User is already a member or already invited")

    db.execute(
        group_members.insert().values(
            group_id=group_id, user_id=invited.id, status="invited"
        )
    )
    db.commit()
    db.refresh(group)
    return _serialize_group(group, db)


@app.get("/events/{event_id}/participants")
def get_event_participants(event_id: int, request: Request):
    """Twardy endpoint: lista uczestników tylko dla członków/hostów."""
    user = require_user(request)
    user_id = int(user["sub"])
    with get_conn() as conn:
        ev = conn.execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone()
        if ev is None:
            raise HTTPException(404, "Event not found")

        is_member = conn.execute(
            "SELECT 1 FROM event_participants WHERE event_id = ? AND user_id = ?",
            (event_id, user_id),
        ).fetchone()
        if not is_member:
            raise HTTPException(403, "Join the event to see participants")

        rows = conn.execute(
            """
            SELECT u.id, u.name, u.surname, u.email, u.city, ep.joined_at
            FROM event_participants ep
            JOIN users u ON u.id = ep.user_id
            WHERE ep.event_id = ?
            ORDER BY (u.id = ?) DESC, ep.joined_at ASC
            """,
            (event_id, ev["creator_id"]),
        ).fetchall()

    return [dict(r) for r in rows]


@app.post("/events/{event_id}/join")
def join_event(event_id: int, request: Request):
    user = require_user(request)
    user_id = int(user["sub"])
    with get_conn() as conn:
        ev = conn.execute("SELECT id FROM events WHERE id = ?", (event_id,)).fetchone()
        if ev is None:
            raise HTTPException(404, "Event not found")
        try:
            conn.execute(
                "INSERT INTO event_participants (event_id, user_id) VALUES (?, ?)",
                (event_id, user_id),
            )
        except sqlite3.IntegrityError:
            pass  # już dołączył
    return {"ok": True}


@app.post("/groups/{group_id}/decline", status_code=204)
def decline_invite(
    group_id: int,
    db: Session = Depends(get_db),
    me: User = Depends(current_user),
):
    db.execute(
        group_members.delete()
        .where(group_members.c.group_id == group_id)
        .where(group_members.c.user_id == me.id)
        .where(group_members.c.status == "invited")
    )
    db.commit()
    return Response(status_code=204)


@app.delete("/groups/{group_id}/leave", status_code=204)
def leave_group(
    group_id: int,
    db: Session = Depends(get_db),
    me: User = Depends(current_user),
):
    group = db.get(Group, group_id)
    if not group:
        raise HTTPException(404, "Group not found")
    if group.owner_id == me.id:
        raise HTTPException(
            400, "Owner cannot leave — delete the group instead"
        )

    db.execute(
        group_members.delete()
        .where(group_members.c.group_id == group_id)
        .where(group_members.c.user_id == me.id)
    )
    db.commit()
    return Response(status_code=204)


@app.delete("/groups/{group_id}", status_code=204)
def delete_group(
    group_id: int,
    db: Session = Depends(get_db),
    me: User = Depends(current_user),
):
    group = db.get(Group, group_id)
    if not group:
        raise HTTPException(404, "Group not found")
    if group.owner_id != me.id:
        raise HTTPException(403, "Only the owner can delete the group")

    db.execute(
        group_members.delete().where(group_members.c.group_id == group_id)
    )
    db.delete(group)
    db.commit()
    return Response(status_code=204)


# ============================================================
#  FAVICON (żeby nie spamować 404)
# ============================================================
@app.get("/favicon.ico", include_in_schema=False)
def favicon():
    return Response(status_code=204)


# ============================================================
#  START
# ============================================================
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)