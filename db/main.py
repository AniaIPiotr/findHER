# main.py
# ============================================================
#  findHER — backend (FastAPI + SQLite, raw sqlite3)
# ============================================================
import hashlib
import json
import os
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import Depends, FastAPI, HTTPException, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from jose import JWTError, jwt
from pydantic import BaseModel, EmailStr, field_validator

# ---------- KONFIG ----------
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

app = FastAPI(title="findHER API")

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
        cols = {r["name"] for r in conn.execute("PRAGMA table_info(users)")}
        if "google_sub" not in cols:
            conn.execute("ALTER TABLE users ADD COLUMN google_sub TEXT")
        if "bio" not in cols:
            conn.execute("ALTER TABLE users ADD COLUMN bio TEXT")
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

        # ---------- GROUPS ----------
        conn.execute("""
            CREATE TABLE IF NOT EXISTS groups (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT DEFAULT '',
                owner_id INTEGER NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS group_members (
                group_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                status TEXT NOT NULL DEFAULT 'accepted',
                invited_at TEXT DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (group_id, user_id),
                FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members(user_id)"
        )


init_db()


# ============================================================
#  SCHEMATY PYDANTIC
# ============================================================
class GoogleAuthRequest(BaseModel):
    credential: str


class ProfileIn(BaseModel):
    name: str
    surname: str
    city: str
    age: int
    interests: List[str] = []
    bio: str = ""


class UserOut(BaseModel):
    id: int
    name: Optional[str] = None
    surname: Optional[str] = None
    city: Optional[str] = None
    email: str
    age: Optional[int] = None
    interests: List[str] = []
    bio: Optional[str] = ""

    @field_validator("interests", mode="before")
    @classmethod
    def parse_interests(cls, v):
        if isinstance(v, str):
            return json.loads(v or "[]")
        return v or []


class EventIn(BaseModel):
    name: str
    event_date: str
    place: str
    description: str = ""

    @field_validator("name", "event_date", "place")
    @classmethod
    def not_blank(cls, v: str):
        if not v or not v.strip():
            raise ValueError("Field cannot be blank")
        return v.strip()


class GroupCreate(BaseModel):
    name: str
    description: str = ""


class GroupInvite(BaseModel):
    email: EmailStr


class GroupMemberOut(BaseModel):
    id: int
    name: str = ""
    surname: str = ""
    email: str
    city: str = ""
    bio: str = ""
    age: int = 0
    interests: List[str] = []
    status: str  # "owner" | "accepted" | "invited"


class GroupOut(BaseModel):
    id: int
    name: str
    description: str = ""
    owner_id: int
    created_at: Optional[str] = None
    member_count: int
    members: List[GroupMemberOut] = []


# ============================================================
#  GOOGLE / TOKENY
# ============================================================
def verify_google_id_token(credential: str) -> dict:
    try:
        info = id_token.verify_oauth2_token(
            credential, google_requests.Request(), GOOGLE_CLIENT_ID
        )
    except ValueError as e:
        raise HTTPException(401, f"Invalid Google token: {e}")
    if info.get("iss") not in ("accounts.google.com", "https://accounts.google.com"):
        raise HTTPException(401, "Wrong issuer")
    if not info.get("email_verified"):
        raise HTTPException(401, "Google email not verified")
    return info


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def create_access_token(user_id: int) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "iat": now,
        "exp": now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
        "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def issue_refresh_token(user_id: int) -> str:
    token = secrets.token_urlsafe(48)
    expires = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)",
            (user_id, hash_token(token), expires.isoformat()),
        )
    return token


def set_auth_cookies(response: Response, access: str, refresh: str):
    common = dict(
        httponly=True,
        secure=IS_PROD,
        samesite="strict" if IS_PROD else "lax",
        path="/",
    )
    response.set_cookie(
        "access_token", access, max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60, **common
    )
    response.set_cookie(
        "refresh_token", refresh, max_age=REFRESH_TOKEN_EXPIRE_DAYS * 86400, **common
    )


def clear_auth_cookies(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")


def get_current_user_optional(request: Request) -> Optional[dict]:
    token = request.cookies.get("access_token")
    if not token:
        return None
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
    except JWTError:
        return None
    if payload.get("type") != "access":
        return None
    return payload


def require_user(request: Request) -> dict:
    user = get_current_user_optional(request)
    if not user:
        raise HTTPException(401, "Not authenticated")
    return user


# ============================================================
#  AUTH
# ============================================================
@app.post("/auth/google")
def auth_google(payload: GoogleAuthRequest, response: Response):
    info = verify_google_id_token(payload.credential)
    google_sub = info["sub"]
    email = info["email"]

    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE google_sub = ?", (google_sub,)
        ).fetchone()

        if row is None:
            row = conn.execute(
                "SELECT * FROM users WHERE email = ?", (email,)
            ).fetchone()
            if row is None:
                cur = conn.execute(
                    "INSERT INTO users (google_sub, email) VALUES (?, ?)",
                    (google_sub, email),
                )
                user_id = cur.lastrowid
            else:
                conn.execute(
                    "UPDATE users SET google_sub = ? WHERE id = ?",
                    (google_sub, row["id"]),
                )
                user_id = row["id"]
        else:
            user_id = row["id"]

    access = create_access_token(user_id)
    refresh = issue_refresh_token(user_id)
    set_auth_cookies(response, access, refresh)
    return {"ok": True, "user_id": user_id}


@app.post("/auth/refresh")
def auth_refresh(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(401, "No refresh token")

    th = hash_token(token)
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM refresh_tokens WHERE token_hash = ? AND revoked = 0",
            (th,),
        ).fetchone()
        if row is None:
            raise HTTPException(401, "Invalid refresh token")

        expires_at = datetime.fromisoformat(row["expires_at"])
        if expires_at < datetime.now(timezone.utc):
            conn.execute(
                "UPDATE refresh_tokens SET revoked = 1 WHERE id = ?", (row["id"],)
            )
            raise HTTPException(401, "Refresh token expired")

        conn.execute(
            "UPDATE refresh_tokens SET revoked = 1 WHERE id = ?", (row["id"],)
        )
        user_id = row["user_id"]
        new_refresh = secrets.token_urlsafe(48)
        new_expires = datetime.now(timezone.utc) + timedelta(
            days=REFRESH_TOKEN_EXPIRE_DAYS
        )
        conn.execute(
            "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)",
            (user_id, hash_token(new_refresh), new_expires.isoformat()),
        )

    access = create_access_token(user_id)
    set_auth_cookies(response, access, new_refresh)
    return {"ok": True}


@app.post("/auth/logout")
def auth_logout(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if token:
        with get_conn() as conn:
            conn.execute(
                "UPDATE refresh_tokens SET revoked = 1 WHERE token_hash = ?",
                (hash_token(token),),
            )
    clear_auth_cookies(response)
    return {"ok": True}


@app.get("/auth/me")
def auth_me(request: Request):
    user = get_current_user_optional(request)
    if not user:
        return {"authenticated": False}
    user_id = int(user["sub"])
    with get_conn() as conn:
        row = conn.execute(
            "SELECT id, email, name, surname, city, age, interests, bio FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
    if row is None:
        return {"authenticated": False}
    r = dict(row)
    r["interests"] = json.loads(r["interests"] or "[]")
    r["profile_completed"] = bool(
        r["name"] and r["surname"] and r["age"] is not None
    )
    return {"authenticated": True, "user": r}


# ============================================================
#  USERS
# ============================================================
@app.post("/add-User", response_model=UserOut, status_code=201)
def add_user(p: ProfileIn, request: Request):
    user = require_user(request)
    user_id = int(user["sub"])

    with get_conn() as conn:
        cur = conn.execute(
            "UPDATE users SET name=?, surname=?, city=?, age=?, interests=?, bio=? WHERE id=?",
            (
                p.name,
                p.surname,
                p.city,
                p.age,
                json.dumps(p.interests),
                p.bio,
                user_id,
            ),
        )
        if cur.rowcount == 0:
            raise HTTPException(404, "User not found")
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()

    r = dict(row)
    r["interests"] = json.loads(r["interests"] or "[]")
    return r


@app.get("/Users", response_model=List[UserOut])
def list_users():
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM users WHERE name IS NOT NULL AND name != ''"
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
        row = conn.execute(
            "SELECT * FROM users WHERE id = ?", (user_id,)
        ).fetchone()
    if row is None:
        raise HTTPException(404, "Not found")
    r = dict(row)
    r["interests"] = json.loads(r["interests"] or "[]")
    return r


# ============================================================
#  EVENTS
# ============================================================
def _serialize_event(conn, ev_row, current_user_id):
    ev = dict(ev_row)

    count = conn.execute(
        "SELECT COUNT(*) AS c FROM event_participants WHERE event_id = ?",
        (ev["id"],),
    ).fetchone()["c"]

    is_creator = current_user_id is not None and ev["creator_id"] == current_user_id

    is_joined = False
    if current_user_id is not None:
        row = conn.execute(
            "SELECT 1 FROM event_participants WHERE event_id = ? AND user_id = ?",
            (ev["id"], current_user_id),
        ).fetchone()
        is_joined = row is not None

    ev["participant_count"] = count
    ev["is_creator"] = is_creator
    ev["is_joined"] = is_joined

    if not is_joined:
        ev["participants"] = []
        return ev

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

    ev["participants"] = [dict(p) for p in parts]
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
        conn.execute(
            "INSERT INTO event_participants (event_id, user_id) VALUES (?, ?)",
            (event_id, user_id),
        )
    return {"ok": True, "id": event_id}


@app.get("/events")
def list_events(request: Request):
    user = get_current_user_optional(request)
    user_id = int(user["sub"]) if user else None
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM events ORDER BY event_date ASC, id ASC"
        ).fetchall()
        return [_serialize_event(conn, r, user_id) for r in rows]


@app.get("/events/{event_id}")
def get_event(event_id: int, request: Request):
    user = get_current_user_optional(request)
    user_id = int(user["sub"]) if user else None
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM events WHERE id = ?", (event_id,)
        ).fetchone()
        if row is None:
            raise HTTPException(404, "Event not found")
        return _serialize_event(conn, row, user_id)


@app.get("/events/{event_id}/participants")
def get_event_participants(event_id: int, request: Request):
    user = require_user(request)
    user_id = int(user["sub"])
    with get_conn() as conn:
        ev = conn.execute(
            "SELECT * FROM events WHERE id = ?", (event_id,)
        ).fetchone()
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
        ev = conn.execute(
            "SELECT id FROM events WHERE id = ?", (event_id,)
        ).fetchone()
        if ev is None:
            raise HTTPException(404, "Event not found")
        try:
            conn.execute(
                "INSERT INTO event_participants (event_id, user_id) VALUES (?, ?)",
                (event_id, user_id),
            )
        except sqlite3.IntegrityError:
            pass
    return {"ok": True}


@app.delete("/events/{event_id}/leave")
def leave_event(event_id: int, request: Request):
    user = require_user(request)
    user_id = int(user["sub"])
    with get_conn() as conn:
        ev = conn.execute(
            "SELECT * FROM events WHERE id = ?", (event_id,)
        ).fetchone()
        if ev is None:
            raise HTTPException(404, "Event not found")
        if ev["creator_id"] == user_id:
            raise HTTPException(400, "Creator cannot leave; delete the event instead")
        conn.execute(
            "DELETE FROM event_participants WHERE event_id = ? AND user_id = ?",
            (event_id, user_id),
        )
    return {"ok": True}


@app.delete("/events/{event_id}")
def delete_event(event_id: int, request: Request):
    user = require_user(request)
    user_id = int(user["sub"])
    with get_conn() as conn:
        ev = conn.execute(
            "SELECT * FROM events WHERE id = ?", (event_id,)
        ).fetchone()
        if ev is None:
            raise HTTPException(404, "Event not found")
        if ev["creator_id"] != user_id:
            raise HTTPException(403, "Only the creator can delete this event")
        conn.execute("DELETE FROM events WHERE id = ?", (event_id,))
    return {"ok": True}


# ============================================================
#  GROUPS
# ============================================================
def _serialize_group(conn, group_row, current_user_id):
    group = dict(group_row)

    rows = conn.execute(
        """
        SELECT u.id, u.name, u.surname, u.email, u.city, u.bio, u.age,
               u.interests, gm.status
        FROM group_members gm
        JOIN users u ON u.id = gm.user_id
        WHERE gm.group_id = ?
        ORDER BY (u.id = ?) DESC, gm.invited_at ASC
        """,
        (group["id"], group["owner_id"]),
    ).fetchall()

    members: List[GroupMemberOut] = []
    for r in rows:
        md = dict(r)
        md["interests"] = json.loads(md["interests"] or "[]")
        md["name"] = md.get("name") or ""
        md["surname"] = md.get("surname") or ""
        md["city"] = md.get("city") or ""
        md["bio"] = md.get("bio") or ""
        md["age"] = md.get("age") or 0
        md["status"] = "owner" if md["id"] == group["owner_id"] else md["status"]
        members.append(GroupMemberOut(**md))

    return GroupOut(
        id=group["id"],
        name=group["name"],
        description=group["description"] or "",
        owner_id=group["owner_id"],
        created_at=group.get("created_at"),
        member_count=len(members),
        members=members,
    )


@app.get("/groups", response_model=List[GroupOut])
def list_my_groups(request: Request):
    user = require_user(request)
    user_id = int(user["sub"])
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT g.* FROM groups g
            JOIN group_members gm ON gm.group_id = g.id
            WHERE gm.user_id = ?
            ORDER BY g.created_at DESC, g.id DESC
            """,
            (user_id,),
        ).fetchall()
        return [_serialize_group(conn, r, user_id) for r in rows]


@app.post("/groups", response_model=GroupOut, status_code=201)
def create_group(p: GroupCreate, request: Request):
    user = require_user(request)
    user_id = int(user["sub"])

    name = p.name.strip()
    if not name:
        raise HTTPException(400, "Group name is required")

    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO groups (name, description, owner_id) VALUES (?, ?, ?)",
            (name, (p.description or "").strip(), user_id),
        )
        gid = cur.lastrowid
        conn.execute(
            "INSERT INTO group_members (group_id, user_id, status) "
            "VALUES (?, ?, 'accepted')",
            (gid, user_id),
        )
        row = conn.execute(
            "SELECT * FROM groups WHERE id = ?", (gid,)
        ).fetchone()
        return _serialize_group(conn, row, user_id)


@app.get("/groups/{group_id}", response_model=GroupOut)
def get_group(group_id: int, request: Request):
    user = require_user(request)
    user_id = int(user["sub"])
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM groups WHERE id = ?", (group_id,)
        ).fetchone()
        if row is None:
            raise HTTPException(404, "Group not found")

        member = conn.execute(
            "SELECT status FROM group_members WHERE group_id = ? AND user_id = ?",
            (group_id, user_id),
        ).fetchone()
        if not member:
            raise HTTPException(403, "You are not a member of this group")

        return _serialize_group(conn, row, user_id)


@app.post("/groups/{group_id}/invite", response_model=GroupOut)
def invite_member(group_id: int, p: GroupInvite, request: Request):
    user = require_user(request)
    user_id = int(user["sub"])
    with get_conn() as conn:
        group = conn.execute(
            "SELECT * FROM groups WHERE id = ?", (group_id,)
        ).fetchone()
        if group is None:
            raise HTTPException(404, "Group not found")
        if group["owner_id"] != user_id:
            raise HTTPException(403, "Only the group owner can invite members")

        invited = conn.execute(
            "SELECT * FROM users WHERE email = ?", (p.email,)
        ).fetchone()
        if invited is None:
            raise HTTPException(404, "No user with that email")

        existing = conn.execute(
            "SELECT status FROM group_members WHERE group_id = ? AND user_id = ?",
            (group_id, invited["id"]),
        ).fetchone()
        if existing:
            raise HTTPException(400, "User is already a member or already invited")

        conn.execute(
            "INSERT INTO group_members (group_id, user_id, status) "
            "VALUES (?, ?, 'invited')",
            (group_id, invited["id"]),
        )
        return _serialize_group(conn, group, user_id)


@app.post("/groups/{group_id}/accept", response_model=GroupOut)
def accept_invite(group_id: int, request: Request):
    user = require_user(request)
    user_id = int(user["sub"])
    with get_conn() as conn:
        row = conn.execute(
            "SELECT status FROM group_members "
            "WHERE group_id = ? AND user_id = ? AND status = 'invited'",
            (group_id, user_id),
        ).fetchone()
        if row is None:
            raise HTTPException(404, "No pending invite")

        conn.execute(
            "UPDATE group_members SET status = 'accepted' "
            "WHERE group_id = ? AND user_id = ?",
            (group_id, user_id),
        )
        group = conn.execute(
            "SELECT * FROM groups WHERE id = ?", (group_id,)
        ).fetchone()
        return _serialize_group(conn, group, user_id)


@app.post("/groups/{group_id}/decline", status_code=204)
def decline_invite(group_id: int, request: Request):
    user = require_user(request)
    user_id = int(user["sub"])
    with get_conn() as conn:
        conn.execute(
            "DELETE FROM group_members "
            "WHERE group_id = ? AND user_id = ? AND status = 'invited'",
            (group_id, user_id),
        )
    return Response(status_code=204)


@app.delete("/groups/{group_id}/leave", status_code=204)
def leave_group(group_id: int, request: Request):
    user = require_user(request)
    user_id = int(user["sub"])
    with get_conn() as conn:
        group = conn.execute(
            "SELECT * FROM groups WHERE id = ?", (group_id,)
        ).fetchone()
        if group is None:
            raise HTTPException(404, "Group not found")
        if group["owner_id"] == user_id:
            raise HTTPException(400, "Owner cannot leave; delete the group instead")

        conn.execute(
            "DELETE FROM group_members WHERE group_id = ? AND user_id = ?",
            (group_id, user_id),
        )
    return Response(status_code=204)


@app.delete("/groups/{group_id}", status_code=204)
def delete_group(group_id: int, request: Request):
    user = require_user(request)
    user_id = int(user["sub"])
    with get_conn() as conn:
        group = conn.execute(
            "SELECT * FROM groups WHERE id = ?", (group_id,)
        ).fetchone()
        if group is None:
            raise HTTPException(404, "Group not found")
        if group["owner_id"] != user_id:
            raise HTTPException(403, "Only the owner can delete the group")

        conn.execute("DELETE FROM groups WHERE id = ?", (group_id,))
    return Response(status_code=204)


# ============================================================
#  FAVICON
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