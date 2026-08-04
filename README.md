# 999scraper

A clean, separated search application for 999.md:

- Go 1.26 API with Air live reload
- Angular 22 standalone, zoneless frontend with signal-based state
- PostgreSQL 18 for code-only accounts, saved listings, preferences, and search history
- Redis 8 for normalized search caching
- SSE for progressive search-result delivery
- background EUR/USD/MDL normalization from National Bank of Moldova rates
- query-aware facets for vehicles, phones, laptops, consoles, TVs, and property

## Start

Docker Desktop is the only local requirement on macOS. The launcher starts Docker when needed and brings up every service:

```sh
./start.sh
```

- Frontend: <http://localhost:4200>
- Backend health: <http://localhost:8081/api/health>

Search is public and needs no account. Log in only to save listings, sync excluded-word preferences, and retain search history. There are no usernames, passwords, roles, or admins: press **Register** once, save the generated six-digit code, then use it to log in. The code is shown once and only its keyed cryptographic fingerprint is stored. Login attempts are rate-limited, and a successful login creates an HttpOnly, SameSite session cookie; browser JavaScript never handles the JWT.

Changes under `cmd/` or `internal/` rebuild and restart the backend through Air. Angular source changes refresh through its independent development server.

Press Ctrl+C to remove the project containers, network, database and dependency/build volumes, and locally built images. The Redis search cache is intentionally ephemeral. Docker Desktop itself stays open.

For non-local use, copy `.env.example` to `.env`, replace every secret, and set `COOKIE_SECURE=true` behind HTTPS.

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

Tune these limits through the `SCRAPER_*` values in `.env`.

Smart search separates the product phrase from refinements before scraping. For example, `Corolla 2008-2010 under 120k km 150-250 hp automatic 4x4 under 10k EUR -piese`, `Lenovo laptop 16GB RAM 512GB 15.6 inch`, `smart TV Samsung 55 inch`, and `apartament de închiriat 2-3 camere 70-100 m2` fetch a broad product set once, then apply detected ranges and verified 999.md metadata instantly in the browser. Local autocomplete ranks private recent searches, items, categories and context-aware refinements without sending individual keystrokes over the network. A compact browser covers every useful public 999 marketplace category, while vehicles, devices, computers, TVs and property expose deeper structured facets. The API streams and caches the unfiltered search set, so cleanup, sorting, prices, currencies, photos, conditions, ranges, and exclusions are reversible in-memory operations that never require another search. Anonymous recent searches stay private on the device, and the complete search workspace survives route navigation and refreshes without repeating a scrape.

## Direct development

The Docker workflow is recommended because it supplies PostgreSQL and Redis. To run processes directly:

```sh
air -c .air.toml

cd client
npm ci
npm start
```

The API reads the configuration listed in [.env.example](.env.example) and creates its small schema automatically:

- `accounts`: anonymous account ID, login-code fingerprint, creation time
- `search_history`: the latest searches belonging to that account
- `account_preferences`: reusable excluded-word stash
- `saved_listings`: a personal listing snapshot collection

The public API is limited to health, exchange rates, registration, login, and progressive search. History, preferences, saved listings, and the current session require the private code session.
