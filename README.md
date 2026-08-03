# 999scraper

A clean, separated search application for 999.md:

- Go 1.26 API with Air live reload
- Angular 22 standalone, zoneless frontend with signal-based state
- PostgreSQL 18 for anonymous accounts and per-account search history
- Redis 8 for normalized search caching
- SSE for progressive search-result delivery

## Start

Docker Desktop is the only local requirement on macOS. The launcher starts Docker when needed and brings up every service:

```sh
./start.sh
```

- Frontend: <http://localhost:4200>
- Backend health: <http://localhost:8081/api/health>

There are no usernames, passwords, roles, or admins. Press **Register** once, save the generated six-digit code, then use it to log in. The code is shown once and only its keyed cryptographic fingerprint is stored. Login attempts are rate-limited, and a successful login creates an HttpOnly, SameSite session cookie; browser JavaScript never handles the JWT.

Changes under `cmd/` or `internal/` rebuild and restart the backend through Air. Angular source changes refresh through its independent development server.

Press Ctrl+C to remove the project containers, network, database/cache volumes, dependency/build volumes, and locally built images. Docker Desktop itself stays open.

For non-local use, copy `.env.example` to `.env`, replace every secret, and set `COOKIE_SECURE=true` behind HTTPS.

## Why SSE

Search progress is one-way—from the Go API to the browser—so SSE is simpler and more resilient than a WebSocket connection. The authenticated POST response uses `text/event-stream`; each page is flushed as a named event and rendered immediately. Canceling in the UI aborts the HTTP request and its outstanding scraper work.

The scraper protects 999.md with:

- normalized-query Redis caching;
- duplicate-request coalescing;
- three bounded workers;
- a shared 350 ms request-start interval;
- `Retry-After` support and exponential backoff with jitter;
- request cancellation and capped page counts.

Tune these limits through the `SCRAPER_*` values in `.env`.

## Direct development

The Docker workflow is recommended because it supplies PostgreSQL and Redis. To run processes directly:

```sh
air -c .air.toml

cd client
npm ci
npm start
```

The API reads the configuration listed in [.env.example](.env.example) and creates its two tables automatically:

- `accounts`: anonymous account ID, login-code fingerprint, creation time
- `search_history`: the latest searches belonging to that account

The authenticated API surface is intentionally small: current session, progressive search, and personal history. Registration and code login are the only public account endpoints.
