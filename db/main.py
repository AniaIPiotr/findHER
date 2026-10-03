from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, EmailStr, field_validator
import sqlite3
import json

app = FastAPI()
DB = "findher.db"

class UserIn(BaseModel):
    name: str
    surname: str
    email: str
    age: int
    interests: list[str]

class UserOut(UserIn):
    id: int

    @field_validator("interests", mode="before")
    @classmethod
    def parse_interests(cls, v):
        if isinstance(v, str):
            return json.loads(v or "[]")
        return v

conn = sqlite3.connect("findher.db")
cursor = conn.cursor()

def init_db():
    with sqlite3.connect(DB) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                surname TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                age INTEGER,
                interests JSON
            )
        """)

init_db()

def get_conn():
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    return conn

# ---------- ENDPOINTS ----------

@app.post("/add-User", response_model=UserOut, status_code=201)
def add_User(p: UserIn):
    with get_conn() as conn:
        try:
            cur = conn.execute(
                "INSERT INTO users (name, surname, email, age, interests) VALUES (?, ?, ?, ?, ?)",
                (p.name, p.surname, p.email, p.age, json.dumps(p.interests))
            )
        except sqlite3.IntegrityError:
            raise HTTPException(status_code=400, detail="Email exists")
    return {"id": cur.lastrowid, **p.model_dump()}


@app.get("/Users", response_model=list[UserOut])
def list_Users():
    with get_conn() as conn:
        rows = conn.execute("SELECT * FROM users").fetchall()
    return [dict(row) for row in rows]


@app.get("/Users/{User_id}", response_model=UserOut)
def get_User(User_id: int):
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE id = ?", (User_id,)
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Not found")
    return dict(row)


@app.put("/Users/{User_id}", response_model=UserOut)
def update_User(User_id: int, p: UserIn):
    with get_conn() as conn:
        cur = conn.execute(
            "UPDATE users SET name=?, surname=?, email=?, age=?, interests=? WHERE id=?",
            (p.name, p.surname, p.email, p.age, p.interests, User_id)
        )
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"id": User_id, **p.model_dump()}


@app.delete("/Users/{User_id}", status_code=204)
def delete_User(User_id: int):
    with get_conn() as conn:
        cur = conn.execute("DELETE FROM users WHERE id=?", (User_id,))
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="Not found")