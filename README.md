# 999scraper

A clean, separated search application for 999.md:

- Go 1.26 API with Air live reload
- Angular 22 standalone, zoneless frontend with signal-based state
- PostgreSQL 18 for code-only accounts, saved listings, preferences, and search history
- Redis 8 for normalized search caching
- SSE for progressive search-result delivery
- background EUR/USD/MDL normalization from National Bank of Moldova rates
- query-aware facets for vehicles, phones, laptops, consoles, TVs, and property

## Repository layout

```text
frontend/          Angular application and Vercel build
backend/           Go API, migrations, and backend container
docker-compose.yml Local service orchestration
start.sh           One-command local launcher and cleanup
frontend/vercel.json Vercel project configuration
.env               Frontend launcher configuration (ignored by Git)
backend/.env       Backend secret configuration (ignored by Git)
```

## Start

Docker Desktop is the only local requirement on macOS. The launcher starts Docker when needed and brings up every service:

```sh
cp .env.example .env # only when .env does not already exist
cp backend/.env.example backend/.env # only when backend/.env does not exist
./start.sh
```

Configuration is split by ownership and both files are ignored by Git. Root `.env` contains only `FRONTEND_PORT` and the browser-safe `API_URL`; `backend/.env` contains only `JWT_SECRET`. `./start.sh` validates both, passes the root file explicitly to Docker Compose, and Angular compiles `API_URL` into the browser bundle. PostgreSQL and Redis local addresses are supplied automatically by Docker Compose.

- Frontend: <http://localhost:4200>
- Backend health: <http://localhost:8081/api/health>

Search is public and needs no account. Log in only to save listings, sync excluded-word preferences, and retain search history. There are no usernames, passwords, roles, or admins: press **Register** once, save the generated six-digit code, then use it to log in. The code is shown once and only its keyed cryptographic fingerprint is stored. Login attempts are rate-limited, and a successful login creates an HttpOnly, SameSite session cookie; browser JavaScript never handles the JWT.

Changes under `backend/cmd/` or `backend/internal/` rebuild and restart the backend through Air. Changes under `frontend/src/` refresh through the independent Angular development server.

Press Ctrl+C to remove the project containers, network, database and dependency/build volumes, and locally built images. The Redis search cache is intentionally ephemeral. Docker Desktop itself stays open.

For non-local use, inject production backend configuration through the deployment platform and set `COOKIE_SECURE=true` behind HTTPS.

## Why SSE

Search progress is one-way—from the Go API to the browser—so SSE is simpler than a WebSocket connection. The public POST response uses `text/event-stream`; each page is flushed as a named event and rendered immediately. Canceling in the UI aborts the HTTP request and its outstanding scraper work.

The scraper protects 999.md with:

- normalized-query Redis caching;
- bounded concurrent searches plus bounded per-search page workers;
- an ephemeral LRU Redis cache that cannot grow beyond its memory budget;
- duplicate-request coalescing;
- three bounded workers;
- a shared 350 ms request-start interval;
- `Retry-After` support and exponential backoff with jitter;
- request cancellation and capped page counts.

The conservative scraper limits are automatic. Production deployments can override the `SCRAPER_*` environment variables when necessary.

Smart search separates the product phrase from refinements before scraping. For example, `Corolla 2008-2010 under 120k km 150-250 hp automatic 4x4 under 10k EUR -piese`, `Lenovo laptop 16GB RAM 512GB 15.6 inch`, `smart TV Samsung 55 inch`, and `apartament de închiriat 2-3 camere 70-100 m2` fetch a broad product set once, then apply detected ranges and verified 999.md metadata instantly in the browser. Local autocomplete ranks private recent searches, items, categories and context-aware refinements without sending individual keystrokes over the network. A compact browser covers every useful public 999 marketplace category, while vehicles, devices, computers, TVs and property expose deeper structured facets. The API streams and caches the unfiltered search set, so cleanup, sorting, prices, currencies, photos, conditions, ranges, and exclusions are reversible in-memory operations that never require another search. Anonymous recent searches stay private on the device, and the complete search workspace survives route navigation and refreshes without repeating a scrape.

## Direct development

The Docker workflow is recommended because it supplies PostgreSQL and Redis. To run processes directly:

```sh
export DATABASE_URL='postgres://...'
set -a; . backend/.env; set +a
(cd backend && go run ./cmd/migrate)
(cd backend && air -c .air.toml)

(cd frontend && npm ci)
(cd frontend && npm start)
```

The API reads its secret from [backend/.env.example](backend/.env.example) during local development and uses platform-injected configuration in production. `./start.sh` runs the schema migration as a separate one-shot service before starting the API:

- `accounts`: anonymous account ID, login-code fingerprint, creation time
- `search_history`: the latest searches belonging to that account
- `account_preferences`: reusable excluded-word stash
- `saved_listings`: a personal listing snapshot collection

The public API is limited to health, exchange rates, registration, login, and progressive search. History, preferences, saved listings, and the current session require the private code session.

## PostgreSQL deployment

Link the PostgreSQL resource to the Go app so the platform injects its scoped variables. `DATABASE_URL` is preferred. When it is unavailable, the app safely builds the connection from either `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, and `DB_SSLMODE`, or the equivalent `POSTGRES_*` names. No production database credentials are embedded in the binary.

The app creates one bounded `pgxpool` at startup, verifies it within `DB_CONNECT_TIMEOUT`, reuses it for all requests, and closes it after graceful HTTP shutdown. `DB_MAX_CONNS` defaults to 5 for a small host, while `DB_MIN_CONNS` defaults to 0.

Run migrations as a controlled deployment step before replacing the running app:

```sh
./migrate
```

The production image contains both `/app/server` and `/app/migrate`; its normal entrypoint remains the server. Database operations have bounded request timeouts, and migrations are additive and idempotent.

## Redis deployment

Link the `cache` Redis service to the Go app so it injects scoped runtime variables. `REDIS_URL` is preferred; when it is unavailable, the backend safely constructs the connection from `REDIS_HOST`, `REDIS_PORT`, `REDIS_USERNAME`, `REDIS_PASSWORD`, `REDIS_DB`, and `REDIS_TLS`. Credentials and complete connection URLs are never logged.

One bounded `go-redis` client is created and verified at startup, reused for every search, and closed during graceful shutdown. Cache operations have short context deadlines, the pool is capped at five connections for a small host, keys use the `999scraper:search:` namespace, and every search entry expires automatically. The cache never scans with `KEYS`, and an invalid or unreachable linked Redis service fails startup instead of silently disabling caching.

## Vercel frontend + home backend

Import the repository into Vercel and set **Root Directory** to `frontend`. Its [vercel.json](frontend/vercel.json) runs `npm ci` beside the committed lockfile, builds Angular, publishes `dist/frontend`, and preserves client-side routes. Clear any Install Command, Build Command, or Output Directory overrides left in the Vercel dashboard so this checked-in configuration remains the single source of truth. Add one Vercel environment variable for Production (and Preview only when you want previews to reach the home API):

```text
API_URL=https://api.example.com/api/
```

`API_URL` is public build configuration, not a secret. Vercel must redeploy after it changes. The build rejects a missing value or a non-HTTPS production URL instead of publishing a broken frontend.

Expose the Raspberry Pi API through a public HTTPS hostname using a secure reverse proxy or tunnel; do not point the HTTPS frontend at a private address or plain HTTP port. For the most reliable login flow, use sibling custom domains such as `app.example.com` on Vercel and `api.example.com` on the Pi. Configure the Go app with the exact frontend origin:

```text
CORS_ALLOWED_ORIGINS=https://app.example.com
COOKIE_SECURE=true
COOKIE_SAME_SITE=lax
```

Use comma-separated exact origins when a specific preview deployment also needs access. Wildcard Vercel origins are deliberately unsupported because authenticated cross-origin requests use cookies. If the frontend stays on `your-project.vercel.app` while the API uses another site, set `COOKIE_SAME_SITE=none` with `COOKIE_SECURE=true`; browser third-party-cookie policies may still limit login, so sibling custom domains are preferred. Anonymous search is unaffected.
