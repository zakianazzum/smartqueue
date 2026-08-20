# SmartQueue - Real-Time Service Flow Monitoring & Waiting Time Prediction System
# Backend API (FastAPI + PostgreSQL)

import os
from fastapi import FastAPI, Body, HTTPException
from fastapi.staticfiles import StaticFiles
import psycopg2
import psycopg2.extras

app = FastAPI(title="SmartQueue API")

# Database settings
DB_HOST = "localhost"
DB_PORT = 5432
DB_NAME = "smartqueue"
DB_USER = "smartqueue"
DB_PASS = "12345678"

# If there are no service records yet we use this default (SRS 8.2 example)
DEFAULT_SERVICE_TIME = 7.5


def get_conn():
    return psycopg2.connect(
        host=DB_HOST, port=DB_PORT, dbname=DB_NAME,
        user=DB_USER, password=DB_PASS,
        cursor_factory=psycopg2.extras.RealDictCursor,
    )


def make_token_number(n):
    # 9 becomes "A-009" like the prototype
    return "A-%03d" % n


def round_minutes(x):
    # normal rounding, so 22.5 becomes 23 like the SRS 8.2 example.
    # (python round() would give 22 here)
    return int(x + 0.5)


def get_average_time(cur, location_id):
    # SRS 8.2 - average service time from the service records.
    # Records under 1 minute are skipped, they happen when staff press
    # "Call Next" twice by mistake and they would drag the average to zero.
    cur.execute(
        """SELECT AVG(service_duration) AS avg_time FROM service_records
           WHERE location_id = %s AND service_duration >= 1""",
        (location_id,),
    )
    row = cur.fetchone()
    if row["avg_time"] is None:
        return DEFAULT_SERVICE_TIME
    return round(float(row["avg_time"]), 1)


def is_paused(cur, location_id):
    # True when every counter of this location is busy (SRS 9)
    cur.execute(
        "SELECT COUNT(*) AS free FROM counters WHERE location_id = %s AND status = 'available'",
        (location_id,),
    )
    return cur.fetchone()["free"] == 0


# ---------------------------------------------------------------
# FR-01  Service Selection
# ---------------------------------------------------------------
@app.get("/api/services")
def get_services():
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT id, name, icon FROM services ORDER BY id")
    rows = cur.fetchall()
    conn.close()
    return rows


# ---------------------------------------------------------------
# FR-02  Location Selection
# ---------------------------------------------------------------
@app.get("/api/locations")
def get_locations(service_id: int = 0):
    # the customer page sends a service_id, the admin page asks for all of them
    conn = get_conn()
    cur = conn.cursor()
    if service_id:
        cur.execute(
            """SELECT l.id, l.name, o.name AS organization
               FROM locations l JOIN organizations o ON o.id = l.organization_id
               WHERE l.service_id = %s ORDER BY l.id""",
            (service_id,),
        )
    else:
        cur.execute(
            """SELECT l.id, l.name, o.name AS organization
               FROM locations l JOIN organizations o ON o.id = l.organization_id
               ORDER BY l.id"""
        )
    rows = cur.fetchall()
    conn.close()
    return rows


# ---------------------------------------------------------------
# FR-03  Token Generation
# ---------------------------------------------------------------
@app.post("/api/tokens")
def create_token(data: dict = Body(...)):
    name = data.get("customer_name") or "Guest"
    service_id = data["service_id"]
    location_id = data["location_id"]

    conn = get_conn()
    cur = conn.cursor()

    # next token number for this location
    cur.execute(
        "SELECT COALESCE(MAX(token_number), 0) + 1 AS next FROM tokens WHERE location_id = %s",
        (location_id,),
    )
    next_number = cur.fetchone()["next"]

    cur.execute(
        """INSERT INTO tokens (token_number, customer_name, service_id, location_id, status)
           VALUES (%s, %s, %s, %s, 'waiting') RETURNING id""",
        (next_number, name, service_id, location_id),
    )
    token_id = cur.fetchone()["id"]
    conn.commit()
    conn.close()

    return {"id": token_id, "token_number": make_token_number(next_number)}


# ---------------------------------------------------------------
# FR-04  Current Token  /  FR-05  Queue Position  /  FR-06  Waiting Time
# This is what the customer tracking screen polls.
# ---------------------------------------------------------------
@app.get("/api/tokens/{token_id}")
def get_token(token_id: int):
    conn = get_conn()
    cur = conn.cursor()

    cur.execute("SELECT * FROM tokens WHERE id = %s", (token_id,))
    token = cur.fetchone()
    if token is None:
        conn.close()
        raise HTTPException(status_code=404, detail="Token not found")

    location_id = token["location_id"]

    # the token being served right now (FR-04)
    cur.execute(
        "SELECT token_number FROM tokens WHERE location_id = %s AND status = 'in_service' ORDER BY token_number LIMIT 1",
        (location_id,),
    )
    row = cur.fetchone()
    now_serving = make_token_number(row["token_number"]) if row else "--"

    # tokens waiting in front of this one (FR-05)
    cur.execute(
        """SELECT token_number FROM tokens
           WHERE location_id = %s AND status = 'waiting' AND token_number < %s
           ORDER BY token_number""",
        (location_id, token["token_number"]),
    )
    ahead_rows = cur.fetchall()
    ahead = [make_token_number(r["token_number"]) for r in ahead_rows]

    # the customer at the counter right now also counts as a person ahead,
    # that is why A-012 shows 3 x 7.5 = 23 mins in the prototype and not 2 x 7.5
    people_ahead = len(ahead)
    if now_serving != "--":
        people_ahead = people_ahead + 1

    # SRS 8.2 : estimated waiting time = customers ahead x average service time (FR-06)
    average_time = get_average_time(cur, location_id)
    estimated_wait = round_minutes(people_ahead * average_time)

    paused = is_paused(cur, location_id)
    conn.close()

    return {
        "id": token["id"],
        "token_number": make_token_number(token["token_number"]),
        "status": token["status"],
        "now_serving": now_serving,
        "position": len(ahead) + 1,
        "ahead_count": people_ahead,
        "ahead_tokens": ahead,
        "average_time": average_time,
        "estimated_wait": estimated_wait,
        "paused": paused,
    }


# ---------------------------------------------------------------
# FR-11  Live Queue Display  /  FR-12  Counter Display
# Used by both the admin panel and the counter view.
# ---------------------------------------------------------------
@app.get("/api/queue")
def get_queue(location_id: int):
    conn = get_conn()
    cur = conn.cursor()

    cur.execute("SELECT name FROM locations WHERE id = %s", (location_id,))
    row = cur.fetchone()
    location_name = row["name"] if row else "Unknown"

    average_time = get_average_time(cur, location_id)

    # currently serving
    cur.execute(
        """SELECT t.token_number, t.called_at, c.name AS counter
           FROM tokens t LEFT JOIN counters c ON c.id = t.counter_id
           WHERE t.location_id = %s AND t.status = 'in_service'
           ORDER BY t.token_number LIMIT 1""",
        (location_id,),
    )
    serving = cur.fetchone()

    # waiting tokens
    cur.execute(
        """SELECT token_number FROM tokens
           WHERE location_id = %s AND status = 'waiting' ORDER BY token_number""",
        (location_id,),
    )
    waiting_rows = cur.fetchall()

    # build the live queue table (serving row first, then the waiting rows)
    queue = []
    if serving:
        queue.append({
            "token_number": make_token_number(serving["token_number"]),
            "status": "In Service",
            "counter": serving["counter"] or "-",
            "time": serving["called_at"].strftime("%H:%M") if serving["called_at"] else "-",
            "estimated_wait": None,
        })
    for i, r in enumerate(waiting_rows):
        queue.append({
            "token_number": make_token_number(r["token_number"]),
            "status": "Waiting",
            "counter": "-",
            "time": "-",
            "estimated_wait": round_minutes((i + 1) * average_time),
        })

    cur.execute(
        "SELECT id, name, status FROM counters WHERE location_id = %s ORDER BY id",
        (location_id,),
    )
    counters = cur.fetchall()
    conn.close()

    waiting_numbers = [make_token_number(r["token_number"]) for r in waiting_rows]

    return {
        "location_name": location_name,
        "now_serving": make_token_number(serving["token_number"]) if serving else "--",
        "serving_counter": (serving["counter"] if serving else None) or "-",
        "next_token": waiting_numbers[0] if waiting_numbers else "--",
        "waiting_tokens": waiting_numbers,
        "queue_length": len(waiting_numbers),
        "average_time": average_time,
        "queue": queue,
        "counters": counters,
        "paused": all(c["status"] == "busy" for c in counters) if counters else False,
    }


# ---------------------------------------------------------------
# FR-07  Service Time Recording  /  FR-08  Service Status Update
# Finishes the current token, saves the service record, calls the next one.
# ---------------------------------------------------------------
@app.post("/api/call-next")
def call_next(data: dict = Body(...)):
    location_id = data["location_id"]
    counter_id = data.get("counter_id")

    conn = get_conn()
    cur = conn.cursor()

    if not counter_id:
        cur.execute(
            "SELECT id FROM counters WHERE location_id = %s AND status = 'available' ORDER BY id LIMIT 1",
            (location_id,),
        )
        row = cur.fetchone()
        if row is None:
            conn.close()
            raise HTTPException(status_code=400, detail="No available counter")
        counter_id = row["id"]

    # 1. finish the token that is being served right now
    cur.execute(
        "SELECT id, called_at FROM tokens WHERE location_id = %s AND status = 'in_service' ORDER BY token_number LIMIT 1",
        (location_id,),
    )
    current = cur.fetchone()
    if current:
        cur.execute(
            "UPDATE tokens SET status = 'done', finished_at = NOW() WHERE id = %s RETURNING called_at, finished_at",
            (current["id"],),
        )
        done = cur.fetchone()
        # FR-07 - save start time, end time and duration in minutes
        cur.execute(
            """INSERT INTO service_records (token_id, location_id, start_time, end_time, service_duration)
               VALUES (%s, %s, %s, %s, EXTRACT(EPOCH FROM (%s::timestamp - %s::timestamp)) / 60)""",
            (current["id"], location_id, done["called_at"], done["finished_at"],
             done["finished_at"], done["called_at"]),
        )

    # 2. call the next waiting token
    cur.execute(
        "SELECT id, token_number FROM tokens WHERE location_id = %s AND status = 'waiting' ORDER BY token_number LIMIT 1",
        (location_id,),
    )
    nxt = cur.fetchone()
    if nxt is None:
        conn.commit()
        conn.close()
        return {"ok": True, "message": "No more tokens in the queue"}

    cur.execute(
        "UPDATE tokens SET status = 'in_service', called_at = NOW(), counter_id = %s WHERE id = %s",
        (counter_id, nxt["id"]),
    )
    conn.commit()
    conn.close()

    return {"ok": True, "now_serving": make_token_number(nxt["token_number"])}


# ---------------------------------------------------------------
# FR-09  Temporary Unavailability
# ---------------------------------------------------------------
@app.post("/api/counters/{counter_id}/busy")
def mark_busy(counter_id: int):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("UPDATE counters SET status = 'busy' WHERE id = %s", (counter_id,))
    conn.commit()
    conn.close()
    return {"ok": True, "status": "busy"}


# ---------------------------------------------------------------
# FR-10  Resume Service
# ---------------------------------------------------------------
@app.post("/api/counters/{counter_id}/resume")
def resume_counter(counter_id: int):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("UPDATE counters SET status = 'available' WHERE id = %s", (counter_id,))
    conn.commit()
    conn.close()
    return {"ok": True, "status": "available"}


# ---------------------------------------------------------------
# Simple staff login
# ---------------------------------------------------------------
@app.post("/api/login")
def login(data: dict = Body(...)):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        "SELECT id, name, role FROM users WHERE email = %s AND password = %s",
        (data.get("email"), data.get("password")),
    )
    user = cur.fetchone()
    conn.close()
    if user is None:
        raise HTTPException(status_code=401, detail="Wrong email or password")
    return user


# Serve the frontend files. This has to stay at the bottom.
frontend_folder = os.path.join(os.path.dirname(__file__), "..", "frontend")
app.mount("/", StaticFiles(directory=frontend_folder, html=True), name="frontend")
