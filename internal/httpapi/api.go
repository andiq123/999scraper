package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/andi/999scraper/internal/auth"
	"github.com/andi/999scraper/internal/cache"
	"github.com/andi/999scraper/internal/model"
	"github.com/andi/999scraper/internal/scraper"
	"github.com/andi/999scraper/internal/store"
)

type API struct {
	store   *store.Store
	auth    *auth.Service
	scraper *scraper.Scraper
	cache   *cache.Cache
	logger  *slog.Logger
	queries *queryGate
	logins  *loginLimiter
}

func New(s *store.Store, a *auth.Service, sc *scraper.Scraper, c *cache.Cache, logger *slog.Logger) http.Handler {
	api := &API{store: s, auth: a, scraper: sc, cache: c, logger: logger, queries: newQueryGate(), logins: newLoginLimiter()}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("POST /api/account/login", api.login)
	mux.HandleFunc("POST /api/account/register", api.register)
	mux.HandleFunc("POST /api/account/logout", api.logout)
	mux.Handle("GET /api/account/current", a.Middleware(http.HandlerFunc(api.currentAccount)))
	mux.Handle("POST /api/products/stream", a.Middleware(http.HandlerFunc(api.productsStream)))
	mux.Handle("GET /api/history", a.Middleware(http.HandlerFunc(api.history)))
	return api.recover(api.cors(api.log(mux)))
}

func (a *API) login(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Code string `json:"code"`
	}
	if !decode(w, r, &input) {
		return
	}
	input.Code = strings.TrimSpace(input.Code)
	if !auth.ValidLoginCode(input.Code) {
		writeError(w, http.StatusBadRequest, "enter a six-digit login code")
		return
	}
	client := clientAddress(r)
	if !a.logins.allow(client, time.Now()) {
		w.Header().Set("Retry-After", "60")
		writeError(w, http.StatusTooManyRequests, "too many attempts; try again shortly")
		return
	}
	account, err := a.store.AccountByCodeHash(r.Context(), a.auth.CodeHash(input.Code))
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusUnauthorized, "invalid login code")
		return
	}
	if err != nil {
		a.internal(w, err)
		return
	}
	token, err := a.auth.Token(account.ID)
	if err != nil {
		a.internal(w, err)
		return
	}
	a.auth.SetSession(w, token)
	a.logins.reset(client)
	writeJSON(w, http.StatusOK, model.Session{ID: account.ID})
}

func (a *API) register(w http.ResponseWriter, r *http.Request) {
	for range 8 {
		code, err := auth.NewLoginCode()
		if err != nil {
			a.internal(w, err)
			return
		}
		_, err = a.store.CreateAccount(r.Context(), a.auth.CodeHash(code))
		if errors.Is(err, store.ErrCodeExists) {
			continue
		}
		if err != nil {
			a.internal(w, err)
			return
		}
		writeJSON(w, http.StatusOK, model.Registration{Code: code})
		return
	}
	writeError(w, http.StatusServiceUnavailable, "could not create a login code; try again")
}

func (a *API) currentAccount(w http.ResponseWriter, r *http.Request) {
	account, err := a.store.AccountByID(r.Context(), accountID(r))
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusUnauthorized, "account not found")
		return
	}
	if err != nil {
		a.internal(w, err)
		return
	}
	token, err := a.auth.Token(account.ID)
	if err != nil {
		a.internal(w, err)
		return
	}
	a.auth.SetSession(w, token)
	writeJSON(w, http.StatusOK, model.Session{ID: account.ID})
}

func (a *API) logout(w http.ResponseWriter, _ *http.Request) {
	a.auth.ClearSession(w)
	w.WriteHeader(http.StatusNoContent)
}

func (a *API) history(w http.ResponseWriter, r *http.Request) {
	items, err := a.store.SearchHistory(r.Context(), accountID(r))
	if err != nil {
		a.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

type searchEvent struct {
	Type        string          `json:"type"`
	Products    []model.Product `json:"products,omitempty"`
	LoadedPages int             `json:"loadedPages,omitempty"`
	TotalPages  int             `json:"totalPages,omitempty"`
	Message     string          `json:"message,omitempty"`
}

func (a *API) productsStream(w http.ResponseWriter, r *http.Request) {
	var filters model.Filters
	if !decode(w, r, &filters) {
		return
	}
	filters.ProductSearchCriteria = strings.TrimSpace(filters.ProductSearchCriteria)
	if filters.ProductSearchCriteria == "" {
		writeError(w, http.StatusBadRequest, "search criteria is required")
		return
	}
	if len(filters.ProductSearchCriteria) > 160 || len(filters.KeysToExclude) > 24 {
		writeError(w, http.StatusBadRequest, "search filters are too large")
		return
	}
	if filters.Intent != "" && filters.Intent != "car" {
		writeError(w, http.StatusBadRequest, "unsupported search intent")
		return
	}
	if (filters.YearFrom != 0 && (filters.YearFrom < 1950 || filters.YearFrom > 2030)) ||
		(filters.YearTo != 0 && (filters.YearTo < 1950 || filters.YearTo > 2030)) ||
		(filters.YearFrom != 0 && filters.YearTo != 0 && filters.YearFrom > filters.YearTo) {
		writeError(w, http.StatusBadRequest, "invalid year range")
		return
	}
	if filters.PriceMin < 0 || filters.PriceMax < 0 || filters.PriceMin > 1_000_000_000 || filters.PriceMax > 1_000_000_000 ||
		(filters.PriceMin != 0 && filters.PriceMax != 0 && filters.PriceMin > filters.PriceMax) ||
		(filters.Currency != nil && (*filters.Currency < 0 || *filters.Currency > 2)) {
		writeError(w, http.StatusBadRequest, "invalid price filters")
		return
	}
	if err := a.store.AddSearch(r.Context(), accountID(r), filters.ProductSearchCriteria); err != nil {
		a.internal(w, err)
		return
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, http.StatusInternalServerError, "streaming is unavailable")
		return
	}

	if cached, ok := a.cachedSearch(r.Context(), filters); ok {
		a.streamCached(w, flusher, cached, filters)
		return
	}
	release, err := a.queries.acquire(r.Context(), filters.ProductSearchCriteria)
	if err != nil {
		return
	}
	defer release()
	if cached, ok := a.cachedSearch(r.Context(), filters); ok {
		a.streamCached(w, flusher, cached, filters)
		return
	}
	var writer *streamWriter
	loadedPages := 0
	products, err := a.scraper.SearchStream(r.Context(), filters.ProductSearchCriteria, func(batch scraper.Batch) error {
		if writer == nil {
			writer = beginStream(w, flusher)
			if err := writer.write(searchEvent{Type: "start", TotalPages: batch.TotalPages}); err != nil {
				return err
			}
		}
		loadedPages++
		return writer.write(searchEvent{
			Type:        "chunk",
			Products:    batch.Products,
			LoadedPages: loadedPages,
			TotalPages:  batch.TotalPages,
		})
	})
	if err != nil {
		if writer == nil {
			a.logger.Warn("scrape failed", "error", err)
			writeError(w, http.StatusBadGateway, "listing service is unavailable")
			return
		}
		if !errors.Is(err, r.Context().Err()) {
			a.logger.Warn("streamed scrape failed", "error", err)
			_ = writer.write(searchEvent{Type: "error", Message: "The listing service interrupted this search. Partial results are shown."})
		}
		return
	}

	container := model.ProductsContainer{Products: products}
	a.cache.SetSearch(r.Context(), filters.ProductSearchCriteria, container)
	_ = writer.write(searchEvent{Type: "done", LoadedPages: loadedPages})
}

func (a *API) cachedSearch(ctx context.Context, filters model.Filters) (model.ProductsContainer, bool) {
	return a.cache.GetQuery(ctx, filters.ProductSearchCriteria)
}

func (a *API) streamCached(w http.ResponseWriter, flusher http.Flusher, cached model.ProductsContainer, filters model.Filters) {
	writer := beginStream(w, flusher)
	totalPages := max((len(cached.Products)+39)/40, 1)
	_ = writer.write(searchEvent{Type: "start", TotalPages: totalPages})
	for start := 0; start < len(cached.Products); start += 40 {
		end := min(start+40, len(cached.Products))
		if err := writer.write(searchEvent{
			Type:        "chunk",
			Products:    cached.Products[start:end],
			LoadedPages: start/40 + 1,
			TotalPages:  totalPages,
		}); err != nil {
			return
		}
	}
	_ = writer.write(searchEvent{Type: "done", LoadedPages: totalPages})
}

type streamWriter struct {
	writer  http.ResponseWriter
	flusher http.Flusher
}

func beginStream(w http.ResponseWriter, flusher http.Flusher) *streamWriter {
	w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store, no-transform")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()
	return &streamWriter{writer: w, flusher: flusher}
}

func (w *streamWriter) write(event searchEvent) error {
	payload, err := json.Marshal(event)
	if err != nil {
		return err
	}
	if _, err := fmt.Fprintf(w.writer, "event: %s\ndata: %s\n\n", event.Type, payload); err != nil {
		return err
	}
	w.flusher.Flush()
	return nil
}

type queryGate struct {
	mu      sync.Mutex
	running map[string]chan struct{}
}

type loginWindow struct {
	count int
	until time.Time
}

type loginLimiter struct {
	mu      sync.Mutex
	windows map[string]loginWindow
}

func newLoginLimiter() *loginLimiter {
	return &loginLimiter{windows: make(map[string]loginWindow)}
}

func (l *loginLimiter) allow(client string, now time.Time) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	window := l.windows[client]
	if now.After(window.until) {
		window = loginWindow{until: now.Add(time.Minute)}
	}
	if window.count >= 6 {
		return false
	}
	window.count++
	l.windows[client] = window
	return true
}

func (l *loginLimiter) reset(client string) {
	l.mu.Lock()
	delete(l.windows, client)
	l.mu.Unlock()
}

func clientAddress(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err == nil {
		return host
	}
	return r.RemoteAddr
}

func newQueryGate() *queryGate {
	return &queryGate{running: make(map[string]chan struct{})}
}

func (g *queryGate) acquire(ctx context.Context, query string) (func(), error) {
	key := strings.ToLower(strings.Join(strings.Fields(query), " "))
	for {
		g.mu.Lock()
		if done, exists := g.running[key]; exists {
			g.mu.Unlock()
			select {
			case <-done:
				continue
			case <-ctx.Done():
				return nil, ctx.Err()
			}
		}
		done := make(chan struct{})
		g.running[key] = done
		g.mu.Unlock()
		var once sync.Once
		return func() {
			once.Do(func() {
				g.mu.Lock()
				delete(g.running, key)
				close(done)
				g.mu.Unlock()
			})
		}, nil
	}
}

func accountID(r *http.Request) string { return auth.ClaimsFrom(r.Context()).Subject }

func (a *API) internal(w http.ResponseWriter, err error) {
	a.logger.Error("request failed", "error", err)
	writeError(w, http.StatusInternalServerError, "internal server error")
}
func (a *API) recover(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if value := recover(); value != nil {
				a.logger.Error("panic", "value", value)
				writeError(w, http.StatusInternalServerError, "internal server error")
			}
		}()
		next.ServeHTTP(w, r)
	})
}
func (a *API) log(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		started := time.Now()
		next.ServeHTTP(w, r)
		a.logger.Info("request", "method", r.Method, "path", r.URL.Path, "duration", time.Since(started).String())
	})
}
func (a *API) cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin == "http://localhost:4200" || origin == "https://localhost:4200" {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func decode(w http.ResponseWriter, r *http.Request, dst any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(dst); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return false
	}
	return true
}
func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}
