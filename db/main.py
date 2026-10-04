import hashlib
import json
import os
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone

from fastapi import Depends, FastAPI, HTTPException, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from jose import JWTError, jwt
from pydantic import BaseModel, field_validator

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


init_db()

# ---------- MODELE ----------
class GoogleAuthRequest(BaseModel):
    credential: str


class ProfileIn(BaseModel):
    name: str
    surname: str
    city: str
    age: int
    interests: list[str]
    bio: str


class UserOut(BaseModel):
    id: int
    name: str | None = None
    surname: str | None = None
    city: str | None = None
    email: str
    age: int | None = None
    interests: list[str] = []
    bio: str

    @field_validator("interests", mode="before")
    @classmethod
    def parse_interests(cls, v):
        if isinstance(v, str):
            return json.loads(v or "[]")
        return v or []


# ---------- GOOGLE ----------
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


# ---------- TOKENY ----------
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
    # SameSite: 'lax' na dev (localhost:5173 -> localhost:8000 to same-site),
    # 'strict' lub 'none' (Secure) na prod w zależności od domen.
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


# ---------- DEPENDENCIES ----------
def get_current_user_optional(request: Request) -> dict | None:
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


# ---------- AUTH ----------
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
            # czy istnieje konto z tym e-mailem (np. po migracji ze starej wersji)?
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

        # rotacja: unieważnij stary, wydaj nowy
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