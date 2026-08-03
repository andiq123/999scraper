# 999scraper

A minimal full-stack search and favorites app for 999.md. One Go service provides the API and serves the Angular 22 frontend. PostgreSQL stores users, favorites, and activity; Redis caches searches for five minutes.

## Start

Docker Desktop is the only requirement on macOS. The launcher starts it when needed and builds the complete stack on port 8080.

```sh
./start.sh
```

Open <http://localhost:8080> and sign in with:

- Username: `admin`
- Password: `change-me-now`
- Email: `admin@example.com`

Press Ctrl+C to stop and remove the project containers, network, database/cache volumes, and locally built app image. Local data is intentionally reset after every clean stop.

For non-local use, copy `.env.example` to `.env` and replace every secret before starting.

## Development

```sh
go test ./...
go run ./cmd/server

cd client
npm ci
npm start
```

The backend reads configuration from environment variables listed in [.env.example](.env.example) and creates its PostgreSQL tables automatically. It continues without search caching if Redis is unavailable.

## Search pipeline

Searches stream to the browser one page at a time, so large result sets render progressively and Cancel stops outstanding upstream requests. The backend protects 999.md with normalized-query caching, duplicate-request coalescing, three bounded workers, a shared 350 ms request-start interval, and exponential retry with jitter that honors `Retry-After` responses. These limits can be tuned through the `SCRAPER_*` values in `.env`.
