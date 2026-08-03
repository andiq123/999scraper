package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"io/fs"
	"log/slog"
	"net/http"
	"net/mail"
	"strings"
	"sync"
	"time"

	"github.com/andi/999scraper/internal/auth"
	"github.com/andi/999scraper/internal/cache"
	"github.com/andi/999scraper/internal/model"
	"github.com/andi/999scraper/internal/scraper"
	"github.com/andi/999scraper/internal/store"
	"github.com/google/uuid"
)

type API struct {
	store   *store.Store
	auth    *auth.Service
	scraper *scraper.Scraper
	cache   *cache.Cache
	logger  *slog.Logger
	web     fs.FS
	queries *queryGate
}

func New(s *store.Store, a *auth.Service, sc *scraper.Scraper, c *cache.Cache, logger *slog.Logger, web fs.FS) http.Handler {
	api := &API{store: s, auth: a, scraper: sc, cache: c, logger: logger, web: web, queries: newQueryGate()}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("POST /api/account/login", api.login)
	mux.HandleFunc("POST /api/account/register", api.register)
	mux.Handle("GET /api/account/current", a.Middleware(http.HandlerFunc(api.currentUser)))
	mux.Handle("POST /api/products", a.Middleware(http.HandlerFunc(api.products)))
	mux.Handle("POST /api/products/stream", a.Middleware(http.HandlerFunc(api.productsStream)))
	mux.Handle("GET /api/favorites/", a.Middleware(http.HandlerFunc(api.favorites)))
	mux.Handle("POST /api/favorites/", a.Middleware(http.HandlerFunc(api.addFavorite)))
	mux.Handle("DELETE /api/favorites/{productId}", a.Middleware(http.HandlerFunc(api.removeFavorite)))
	mux.Handle("GET /api/admin/users", a.Middleware(api.adminOnly(http.HandlerFunc(api.users))))
	mux.Handle("GET /api/admin/{userId}/activity", a.Middleware(api.adminOnly(http.HandlerFunc(api.activities))))
	mux.Handle("POST /api/admin/{userId}/blockUnBlock", a.Middleware(api.adminOnly(http.HandlerFunc(api.toggleBan))))
	mux.Handle("/", api.spa())
	return api.recover(api.cors(api.log(mux)))
}

func (a *API) login(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if !decode(w, r, &input) {
		return
	}
	u, err := a.store.UserByLogin(r.Context(), strings.TrimSpace(input.Username))
	if err != nil || !auth.Check(u.PasswordHash, input.Password) {
		writeError(w, http.StatusUnauthorized, "username, email, or password is incorrect")
		return
	}
	if u.IsBanned {
		writeError(w, http.StatusUnauthorized, "account banned")
		return
	}
	token, err := a.auth.Token(u.ID, u.IsAdmin)
	if err != nil {
		a.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, u.Response(token))
}

func (a *API) register(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Username string `json:"username"`
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if !decode(w, r, &input) {
		return
	}
	input.Username = strings.TrimSpace(input.Username)
	input.Email = strings.TrimSpace(input.Email)
	if len(input.Username) < 3 || len(input.Password) < 8 {
		writeError(w, http.StatusBadRequest, "username must be 3+ characters and password 8+ characters")
		return
	}
	if _, err := mail.ParseAddress(input.Email); err != nil {
		writeError(w, http.StatusBadRequest, "invalid email address")
		return
	}
	hash, err := auth.Hash(input.Password)
	if err != nil {
		a.internal(w, err)
		return
	}
	u, err := a.store.CreateUser(r.Context(), input.Username, input.Email, hash, false)
	if err != nil {
		if strings.Contains(err.Error(), "users_") {
			writeError(w, http.StatusConflict, "username or email is already registered")
			return
		}
		a.internal(w, err)
		return
	}
	token, err := a.auth.Token(u.ID, false)
	if err != nil {
		a.internal(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, u.Response(token))
}

func (a *API) currentUser(w http.ResponseWriter, r *http.Request) {
	u, err := a.store.UserByID(r.Context(), userID(r))
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}
	if err != nil {
		a.internal(w, err)
		return
	}
	if u.IsBanned {
		writeError(w, http.StatusUnauthorized, "account banned")
		return
	}
	token, _ := a.auth.Token(u.ID, u.IsAdmin)
	writeJSON(w, http.StatusOK, u.Response(token))
}

func (a *API) products(w http.ResponseWriter, r *http.Request) {
	var filters model.Filters
	if !decode(w, r, &filters) {
		return
	}
	filters.ProductSearchCriteria = strings.TrimSpace(filters.ProductSearchCriteria)
	if filters.ProductSearchCriteria == "" {
		writeError(w, http.StatusBadRequest, "search criteria is required")
		return
	}
	if cached, ok := a.cachedSearch(r.Context(), filters); ok {
		cached.Products = scraper.Filter(cached.Products, filters)
		writeJSON(w, http.StatusOK, cached)
		return
	}
	release, err := a.queries.acquire(r.Context(), filters.ProductSearchCriteria)
	if err != nil {
		return
	}
	defer release()
	if cached, ok := a.cachedSearch(r.Context(), filters); ok {
		cached.Products = scraper.Filter(cached.Products, filters)
		writeJSON(w, http.StatusOK, cached)
		return
	}
	if _, err := a.store.AddActivity(r.Context(), userID(r), filters.ProductSearchCriteria); err != nil {
		a.internal(w, err)
		return
	}
	products, err := a.scraper.Search(r.Context(), filters.ProductSearchCriteria)
	if err != nil {
		a.logger.Warn("scrape failed", "error", err)
		writeError(w, http.StatusBadGateway, "listing service is unavailable")
		return
	}
	container := model.ProductsContainer{ID: uuid.NewString(), Products: products}
	a.cache.SetSearch(r.Context(), filters.ProductSearchCriteria, container)
	container.Products = scraper.Filter(products, filters)
	if len(container.Products) == 0 {
		writeError(w, http.StatusNotFound, "no products found")
		return
	}
	writeJSON(w, http.StatusOK, container)
}

type searchEvent struct {
	Type        string          `json:"type"`
	ID          string          `json:"id,omitempty"`
	Products    []model.Product `json:"products,omitempty"`
	Page        int             `json:"page,omitempty"`
	LoadedPages int             `json:"loadedPages,omitempty"`
	TotalPages  int             `json:"totalPages,omitempty"`
	Received    int             `json:"received,omitempty"`
	Total       int             `json:"total,omitempty"`
	Cached      bool            `json:"cached,omitempty"`
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
	if _, err := a.store.AddActivity(r.Context(), userID(r), filters.ProductSearchCriteria); err != nil {
		a.internal(w, err)
		return
	}

	id := uuid.NewString()
	var writer *streamWriter
	loadedPages := 0
	received := 0
	products, err := a.scraper.SearchStream(r.Context(), filters.ProductSearchCriteria, func(batch scraper.Batch) error {
		if writer == nil {
			writer = beginStream(w, flusher)
			if err := writer.write(searchEvent{Type: "start", ID: id, TotalPages: batch.TotalPages, Total: batch.Total}); err != nil {
				return err
			}
		}
		loadedPages++
		received += len(batch.Products)
		return writer.write(searchEvent{
			Type:        "chunk",
			ID:          id,
			Products:    scraper.Filter(batch.Products, filters),
			Page:        batch.Page,
			LoadedPages: loadedPages,
			TotalPages:  batch.TotalPages,
			Received:    received,
			Total:       batch.Total,
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
			_ = writer.write(searchEvent{Type: "error", ID: id, Message: "The listing service interrupted this search. Partial results are shown."})
		}
		return
	}

	container := model.ProductsContainer{ID: id, Products: products}
	a.cache.SetSearch(r.Context(), filters.ProductSearchCriteria, container)
	_ = writer.write(searchEvent{Type: "done", ID: id, LoadedPages: loadedPages, Received: received})
}

func (a *API) cachedSearch(ctx context.Context, filters model.Filters) (model.ProductsContainer, bool) {
	if cached, ok := a.cache.Get(ctx, filters.RedisID); ok {
		return cached, true
	}
	return a.cache.GetQuery(ctx, filters.ProductSearchCriteria)
}

func (a *API) streamCached(w http.ResponseWriter, flusher http.Flusher, cached model.ProductsContainer, filters model.Filters) {
	writer := beginStream(w, flusher)
	totalPages := max((len(cached.Products)+39)/40, 1)
	_ = writer.write(searchEvent{Type: "start", ID: cached.ID, TotalPages: totalPages, Total: len(cached.Products), Cached: true})
	received := 0
	for start := 0; start < len(cached.Products); start += 40 {
		end := min(start+40, len(cached.Products))
		received += end - start
		if err := writer.write(searchEvent{
			Type:        "chunk",
			ID:          cached.ID,
			Products:    scraper.Filter(cached.Products[start:end], filters),
			Page:        start/40 + 1,
			LoadedPages: start/40 + 1,
			TotalPages:  totalPages,
			Received:    received,
			Total:       len(cached.Products),
			Cached:      true,
		}); err != nil {
			return
		}
	}
	_ = writer.write(searchEvent{Type: "done", ID: cached.ID, LoadedPages: totalPages, Received: received, Cached: true})
}

type streamWriter struct {
	encoder *json.Encoder
	flusher http.Flusher
}

func beginStream(w http.ResponseWriter, flusher http.Flusher) *streamWriter {
	w.Header().Set("Content-Type", "application/x-ndjson; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store, no-transform")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()
	return &streamWriter{encoder: json.NewEncoder(w), flusher: flusher}
}

func (w *streamWriter) write(event searchEvent) error {
	if err := w.encoder.Encode(event); err != nil {
		return err
	}
	w.flusher.Flush()
	return nil
}

type queryGate struct {
	mu      sync.Mutex
	running map[string]chan struct{}
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

func (a *API) favorites(w http.ResponseWriter, r *http.Request) {
	items, err := a.store.Favorites(r.Context(), userID(r))
	if err != nil {
		a.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}
func (a *API) addFavorite(w http.ResponseWriter, r *http.Request) {
	var p model.Product
	if !decode(w, r, &p) {
		return
	}
	if strings.TrimSpace(p.Title) == "" {
		writeError(w, http.StatusBadRequest, "product title is required")
		return
	}
	if err := a.store.AddFavorite(r.Context(), userID(r), p); err != nil {
		if strings.Contains(err.Error(), "already exists") {
			writeError(w, http.StatusConflict, "product is already in favorites")
			return
		}
		a.internal(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
func (a *API) removeFavorite(w http.ResponseWriter, r *http.Request) {
	if err := a.store.RemoveFavorite(r.Context(), userID(r), r.PathValue("productId")); errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "favorite not found")
		return
	} else if err != nil {
		a.internal(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
func (a *API) users(w http.ResponseWriter, r *http.Request) {
	items, err := a.store.Users(r.Context(), userID(r))
	if err != nil {
		a.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}
func (a *API) activities(w http.ResponseWriter, r *http.Request) {
	items, err := a.store.Activities(r.Context(), r.PathValue("userId"))
	if err != nil {
		a.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}
func (a *API) toggleBan(w http.ResponseWriter, r *http.Request) {
	banned, err := a.store.ToggleBan(r.Context(), r.PathValue("userId"))
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}
	if err != nil {
		a.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"status": banned})
}

func (a *API) adminOnly(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if claims := auth.ClaimsFrom(r.Context()); claims == nil || !claims.Admin {
			writeError(w, http.StatusForbidden, "admin access required")
			return
		}
		next.ServeHTTP(w, r)
	})
}
func userID(r *http.Request) string { return auth.ClaimsFrom(r.Context()).Subject }

func (a *API) spa() http.Handler {
	files := http.FileServer(http.FS(a.web))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/")
		if path != "" {
			if f, err := a.web.Open(path); err == nil {
				_ = f.Close()
				files.ServeHTTP(w, r)
				return
			}
		}
		r.URL.Path = "/"
		files.ServeHTTP(w, r)
	})
}
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
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
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
