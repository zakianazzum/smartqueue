# SmartQueue

Real-Time Service Flow Monitoring & Waiting Time Prediction System.

Web application that lets a customer pick a service and a location, take a token,
and watch the queue and the estimated waiting time update live while staff serve
the queue from an admin panel.

- Frontend: HTML, Tailwind CSS (CDN), plain JavaScript
- Backend: Python / FastAPI
- Database: PostgreSQL

## How to run

**1. Start the database**

The project uses a PostgreSQL container called `smartqueue-db`.

```
docker start smartqueue-db
```

If it does not exist yet:

```
docker run --name smartqueue-db -e POSTGRES_USER=smartqueue -e POSTGRES_PASSWORD=12345678 -e POSTGRES_DB=smartqueue -p 5432:5432 -d postgres:16-alpine
```

**2. Create the tables and the demo data**

```
docker exec -i smartqueue-db psql -U smartqueue -d smartqueue < backend/schema.sql
```

Run this again any time you want to reset the demo back to its starting state.

**3. Install the Python packages**

```
pip install -r backend/requirements.txt
```

**4. Start the server**

```
cd backend
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

**5. Open the app**

| Page | Address |
| --- | --- |
| Customer | http://localhost:8000 |
| Staff login | http://localhost:8000/login.html |
| Admin panel | http://localhost:8000/admin.html |
| Counter view | http://localhost:8000/counter.html |
| API docs | http://localhost:8000/docs |

Staff login: `staff@demo.com` / `1234`

The FastAPI server also serves the frontend files, so there is only one thing to
start and no CORS setup is needed.

Note: `--reload` does not always pick up file changes on Windows. After editing
`main.py`, stop the server with Ctrl+C and start it again.

## Deploy on Render

The repository includes `render.yaml` for a Render web service and PostgreSQL
database. In Render, create a Blueprint from this repository. The web service
uses Render's required `PORT` value and binds to `0.0.0.0`; the database is
passed through `DATABASE_URL`.

After the database is created, apply the schema and demo data once using the
database's external connection string:

```
psql "$DATABASE_URL" -f backend/schema.sql
```

Do not add a fixed public port. Render assigns the web port through `PORT`, and
the frontend uses relative `/api/...` URLs, so it follows the deployed service
automatically.

## Demo walkthrough

Open the customer page and the admin panel in two browser tabs side by side.

1. Customer tab: choose **Hospital**, then **City General Hospital - Main Branch**,
   type a name and press **Get My Token**. The tracking screen shows the current
   token, your position, the tokens ahead of you and the estimated waiting time.
2. Admin tab: press **Call Next**. Within 3 seconds the customer tab updates by
   itself.
3. Watch the **AVG. SERVICE TIME** card. It starts at 7.5 minutes and changes
   after the first Call Next, because the system now measures the real service
   time instead of using the default.
4. Press **Mark Counter as Busy** on both counters. An orange "service is
   paused" message appears on the customer page and on the counter view.
   Press **Resume Service** to clear it.
5. Open the counter view on a third tab to see the public display.

## How the waiting time is calculated

SRS section 8.2:

```
Estimated Waiting Time = Number of Customers Ahead x Average Service Time
```

- **Number of customers ahead** is the tokens still waiting in front of you plus
  the one being served at the counter right now. So token A-012 with A-010 and
  A-011 waiting and A-009 at the counter has 3 customers ahead.
- **Average service time** is the average of `service_duration` in the
  `service_records` table for that location. Every time staff press Call Next,
  the finished token's start time, end time and duration are saved there, so the
  average keeps getting more accurate.
- When there are no service records yet the system uses **7.5 minutes**, the
  value used in the SRS example.
- Records shorter than 1 minute are ignored, because they happen when staff
  press Call Next twice by mistake and they would pull the average down to zero.

Example: 3 customers ahead x 7.5 minutes = 22.5, shown as **23 mins**.

## Requirements coverage

| ID | Feature | Where it is implemented |
| --- | --- | --- |
| FR-01 | Service Selection | `GET /api/services` - customer step 1/4 |
| FR-02 | Location Selection | `GET /api/locations` - customer step 2/4 |
| FR-03 | Token Generation | `POST /api/tokens` - customer step 3/4 |
| FR-04 | Current Token Display | `GET /api/tokens/{id}` - "Currently Serving" |
| FR-05 | Queue Position | `GET /api/tokens/{id}` - "Position" |
| FR-06 | Waiting-Time Estimation | `GET /api/tokens/{id}` - "Estimated Waiting Time" |
| FR-07 | Service-Time Recording | `POST /api/call-next` - writes `service_records` |
| FR-08 | Service Status Update | `POST /api/call-next` - moves the token to In Service |
| FR-09 | Temporary Unavailability | `POST /api/counters/{id}/busy` - Mark Counter as Busy |
| FR-10 | Resume Service | `POST /api/counters/{id}/resume` - Resume Service |
| FR-11 | Live Queue Display | `GET /api/queue` - admin Live Queue table |
| FR-12 | Counter Display | `GET /api/queue` - counter view page |

Service interruption handling (SRS section 9) is covered by FR-09 and FR-10: the
status changes, the customer is told with a message on the tracking page and the
counter display, and the waiting time is recalculated from the counter status.

## Files

```
backend/
  main.py           all the API endpoints
  schema.sql        the tables and the demo data
  requirements.txt
frontend/
  index.html        customer pages, the 4 steps
  app.js
  login.html        staff login
  admin.html        admin / staff panel
  admin.js
  counter.html      public counter display
  counter.js
```

## Not included

These are marked Could Have or Future Enhancements in the SRS (sections 4 and 14):

- SMS and push notifications
- Machine-learning based prediction (section 8.3). The system uses the average
  based formula from section 8.2, which the SRS gives as the initial method.
- Historical analytics dashboards
- Mobile application

The staff login checks the email and password against the `users` table but does
not hash passwords or use sessions. It is enough for the demo, not for real use.
