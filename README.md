# Weather-Aware Truck Routing

Plan a truck route between two US or Canadian places and see how the weather along it will affect the drive. The app gets up to three route options, forecasts wind, rain and snow at a checkpoint every 10, 25 or 50 miles at the time the truck gets there, rates each checkpoint from low risk to no travel for the given load, and recommends the route with the least dangerous weather. A heatmap shows the weather around the routes for the next 48 hours.

- **Frontend:** React, Vite and TypeScript, with MapLibre through react-map-gl and TanStack Query.
- **Backend:** Django 5 and Django REST Framework.
- **Data:** TomTom for geocoding and truck routing, Open-Meteo for the hourly forecast.

## Run it locally

You need Python 3.12, Node 22 and a TomTom API key (a free key from developer.tomtom.com works; enable the Routing and Search APIs). Open-Meteo needs no key.

```bash
# Backend, on http://localhost:8000
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env            # then set SECRET_KEY and TOMTOM_API_KEY
python manage.py runserver
```

```bash
# Frontend, on http://localhost:5173 (it forwards /api to the backend)
cd frontend
npm install
npm run dev
```

If port 8000 is taken, run Django on another port and point the frontend at it, for example `python manage.py runserver 8001` and `API_PROXY_TARGET=http://localhost:8001 npm run dev`.

After you edit `backend/.env`, stop the server and start it again; the auto-reload does not pick up changes to it.

To check that your TomTom key works: `python manage.py try_route "Dallas, TX" "Denver, CO"`.

## Tests and checks

```bash
cd backend && pytest && ruff check . && ruff format --check .
cd frontend && npm test && npm run lint && npx prettier --check src && npm run build
```

No test calls TomTom or Open-Meteo; both are replaced by fakes.

## How it works

1. `POST /api/plan` geocodes both places, gets up to three truck routes from TomTom (adding detours through a point beside the route if TomTom returns fewer), samples a checkpoint every N miles, works out the arrival time at each from TomTom's instruction timings, and fetches the Open-Meteo forecast for all checkpoints in one batched request.
2. Each checkpoint's wind, rain and snow are rated, and the load can raise the rating (heavy loads are not allowed in strong wind). Routes are ranked by miles of no-travel, severe and high-risk weather, then by average risk, then by travel time.
3. `POST /api/heatmap` returns the same ratings, plus wind, rain and snow, for a grid along the routes for 49 hours, so the map slider never makes another request.

The thresholds and every other judgement call are listed, one line each, in [docs/DECISIONS.md](docs/DECISIONS.md).

### API

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | Returns `{"status": "ok"}`. |
| `POST /api/plan` | Body: `origin`, `destination`, `departure` (ISO 8601 with a timezone), `load_lb` (1 to 80000), `interval_miles` (10, 25 or 50). Returns the routes, checkpoints, risk summaries, the recommended route and an explanation. |
| `POST /api/heatmap` | Body: `routes` (id and GeoJSON LineString), `departure`, `load_lb`. Returns hourly risk, wind, rain and snow for a grid along the routes. |

Errors: 400 with field errors, 422 with a message (unknown place, no route, forecast out of range), 502 when TomTom or Open-Meteo fails.

## Configuration

All backend settings come from environment variables (`backend/.env` locally, the Render dashboard in production).

| Variable | Meaning |
|---|---|
| `SECRET_KEY` | Django secret key. Required when `DEBUG` is off. |
| `DEBUG` | `true` for local development; anything else is off. |
| `ALLOWED_HOSTS` | Comma-separated host names the API answers to. |
| `CORS_ALLOWED_ORIGINS` | Comma-separated origins allowed to call the API from a browser. Empty outside `DEBUG`. |
| `TOMTOM_API_KEY` | TomTom key. It stays on the server; the frontend never sees it. |

The frontend has one setting, `VITE_API_BASE_URL`, the address of the API. Leave it empty locally.

## Deployment

The repository contains a Render blueprint, [render.yaml](render.yaml), that creates two services: the Django API (a web service) and the React site (a static site). You need a Render account, this repository on GitHub, and your TomTom API key. Render's labels change now and then, so a button may read a little differently.

1. Open https://dashboard.render.com and sign in.
2. Click **New +** at the top right, then **Blueprint**.
3. If Render asks for access to GitHub, click **Connect GitHub**, allow access to this repository, and return to the page.
4. Find `spotter-truck-routing` in the list and click **Connect**.
5. Leave the blueprint name as it is and check that the branch is `main`. Render reads `render.yaml` and lists two services: `spotter-truck-routing-api` and `spotter-truck-routing-web`.
6. Under `spotter-truck-routing-api`, paste your TomTom key into the `TOMTOM_API_KEY` field. This is the only value you have to enter; `SECRET_KEY` is generated for you.
7. Click **Deploy Blueprint** (older dashboards call it **Apply**).
8. Wait for both services to show **Live**. The API takes a few minutes to build and the site a little less.
9. Check the API: open `https://spotter-truck-routing-api.onrender.com/api/health` in a browser. It should show `{"status":"ok"}`.
10. Open `https://spotter-truck-routing-web.onrender.com`, click **Use sample trip**, then **Plan routes**. Planning takes around 10 seconds.

If Render gave the services different addresses (it adds a random suffix when a name is taken), fix the two settings that hold addresses. Both show the real address at the top of each service's page.

1. Click the API service `spotter-truck-routing-api`, then **Environment**.
2. Set `CORS_ALLOWED_ORIGINS` to the address of the site, starting with `https://` and without a trailing slash, and click **Save, rebuild, and deploy** (or **Save Changes**).
3. Click the site `spotter-truck-routing-web`, then **Environment**.
4. Set `VITE_API_BASE_URL` to the address of the API and save.
5. Still on the site, click **Manual Deploy**, then **Clear build cache & deploy**. The address is read when the site is built, so it needs a new build.

After that, every push to `main` redeploys both services. To change the TomTom key later, edit `TOMTOM_API_KEY` under the API service's **Environment** and save.

Things to know about the free plan:

- The API sleeps after 15 minutes without requests, so the first request after a pause can take about a minute.
- Open-Meteo's free tier counts every location as a request (about 600 a minute). The app keeps its forecast cache for 30 minutes and uses a coarser heatmap grid for wide corridors to stay inside that, but the cache is per process: each of the two gunicorn workers has its own.
- If the page shows "Could not reach the server", `VITE_API_BASE_URL` is wrong. If the browser console shows a CORS error, `CORS_ALLOWED_ORIGINS` does not match the address of the site. A "400 Bad Request" from the API means its host is missing from `ALLOWED_HOSTS`.
