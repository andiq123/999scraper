package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/mail"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/andi/999scraper/internal/alerts"
	"github.com/andi/999scraper/internal/auth"
	"github.com/andi/999scraper/internal/cache"
	"github.com/andi/999scraper/internal/currency"
	"github.com/andi/999scraper/internal/model"
	"github.com/andi/999scraper/internal/scraper"
	"github.com/andi/999scraper/internal/store"
)

type API struct {
	store      *store.Store
	auth       *auth.Service
	scraper    *scraper.Scraper
	cache      *cache.Cache
	logger     *slog.Logger
	queries    *queryGate
	logins     *loginLimiter
	summaries  *loginLimiter
	vinChecks  *loginLimiter
	alertEdits *loginLimiter
	vinDecoder *vinDecoder
	rates      *currency.Service
	alerts     *alerts.Service
	origins    map[string]struct{}
}

func New(s *store.Store, a *auth.Service, sc *scraper.Scraper, c *cache.Cache, rates *currency.Service, alertService *alerts.Service, allowedOrigins []string, logger *slog.Logger) http.Handler {
	origins := make(map[string]struct{}, len(allowedOrigins))
	for _, origin := range allowedOrigins {
		origins[origin] = struct{}{}
	}
	api := &API{store: s, auth: a, scraper: sc, cache: c, rates: rates, alerts: alertService, origins: origins, logger: logger, queries: newQueryGate(), logins: newLoginLimiter(), summaries: newRequestLimiter(60, time.Minute), vinChecks: newRequestLimiter(30, time.Minute), alertEdits: newRequestLimiter(5, time.Hour), vinDecoder: newVINDecoder()}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", api.health)
	mux.HandleFunc("GET /api/health", api.health)
	mux.HandleFunc("POST /api/account/login", api.login)
	mux.HandleFunc("POST /api/account/register", api.register)
	mux.HandleFunc("GET /api/rates", api.exchangeRates)
	mux.Handle("GET /api/account/current", a.OptionalMiddleware(http.HandlerFunc(api.currentAccount)))
	mux.Handle("POST /api/products/stream", a.OptionalMiddleware(http.HandlerFunc(api.productsStream)))
	mux.HandleFunc("GET /api/products/{id}/summary", api.listingSummary)
	mux.HandleFunc("GET /api/vin/{vin}/stream", api.vinResearchStream)
	mux.Handle("GET /api/history", a.Middleware(http.HandlerFunc(api.history)))
	mux.Handle("GET /api/preferences", a.Middleware(http.HandlerFunc(api.preferences)))
	mux.Handle("PUT /api/preferences", a.Middleware(http.HandlerFunc(api.savePreferences)))
	mux.Handle("GET /api/saved", a.Middleware(http.HandlerFunc(api.savedListings)))
	mux.Handle("PUT /api/saved/{id}", a.Middleware(http.HandlerFunc(api.saveListing)))
	mux.Handle("DELETE /api/saved/{id}", a.Middleware(http.HandlerFunc(api.deleteListing)))
	mux.Handle("GET /api/subscriptions", a.Middleware(http.HandlerFunc(api.searchSubscriptions)))
	mux.Handle("POST /api/subscriptions", a.Middleware(http.HandlerFunc(api.createSearchSubscription)))
	mux.Handle("POST /api/subscriptions/{id}/test", a.Middleware(http.HandlerFunc(api.testSearchSubscription)))
	mux.Handle("DELETE /api/subscriptions/{id}", a.Middleware(http.HandlerFunc(api.deleteSearchSubscription)))
	return api.recover(api.cors(api.log(mux)))
}

var filterParamPattern = regexp.MustCompile(`^[A-Za-z0-9_-]*$`)

type subscriptionResponse struct {
	Available            bool                       `json:"available"`
	CheckIntervalMinutes int                        `json:"checkIntervalMinutes"`
	Items                []model.SearchSubscription `json:"items"`
}

func (a *API) searchSubscriptions(w http.ResponseWriter, r *http.Request) {
	items, err := a.alerts.List(r.Context(), accountID(r))
	if err != nil {
		a.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, subscriptionResponse{Available: a.alerts.Available(), CheckIntervalMinutes: alerts.DefaultIntervalMinutes, Items: items})
}

func (a *API) createSearchSubscription(w http.ResponseWriter, r *http.Request) {
	if !a.alertEdits.allow(accountID(r), time.Now()) {
		w.Header().Set("Retry-After", "3600")
		writeError(w, http.StatusTooManyRequests, "too many email alert changes; try again later")
		return
	}
	var input struct {
		Query              string   `json:"query"`
		FilterParam        string   `json:"filterParam"`
		SearchPath         string   `json:"searchPath"`
		RecipientEmail     string   `json:"recipientEmail"`
		IntervalMinutes    int      `json:"intervalMinutes"`
		SnapshotProductIDs []string `json:"snapshotProductIds"`
	}
	if !decode(w, r, &input) {
		return
	}
	input.Query = strings.TrimSpace(input.Query)
	input.RecipientEmail = strings.ToLower(strings.TrimSpace(input.RecipientEmail))
	if input.Query == "" || len(input.Query) > 160 || strings.ContainsAny(input.Query, "\r\n") {
		writeError(w, http.StatusBadRequest, "invalid search query")
		return
	}
	if len(input.FilterParam) > 8000 || !filterParamPattern.MatchString(input.FilterParam) || !alerts.ValidSearchPath(input.SearchPath) || !matchingSearchPath(input.SearchPath, input.Query, input.FilterParam) {
		writeError(w, http.StatusBadRequest, "invalid search link")
		return
	}
	if !validRecipient(input.RecipientEmail) {
		writeError(w, http.StatusBadRequest, "enter a valid recipient email")
		return
	}
	if !alerts.ValidInterval(input.IntervalMinutes) {
		writeError(w, http.StatusBadRequest, "choose a valid alert interval")
		return
	}
	input.SnapshotProductIDs = cleanProductIDs(input.SnapshotProductIDs)
	if len(input.SnapshotProductIDs) > 1000 {
		writeError(w, http.StatusBadRequest, "too many baseline listings")
		return
	}
	item, err := a.alerts.Subscribe(r.Context(), accountID(r), model.SearchSubscription{Query: input.Query, FilterParam: input.FilterParam, SearchPath: input.SearchPath, RecipientEmail: input.RecipientEmail, IntervalMinutes: input.IntervalMinutes, SnapshotProductIDs: input.SnapshotProductIDs})
	switch {
	case errors.Is(err, alerts.ErrUnavailable):
		writeError(w, http.StatusServiceUnavailable, "email alerts are not configured")
	case errors.Is(err, alerts.ErrDelivery):
		writeError(w, http.StatusBadGateway, "the confirmation email could not be delivered; check the recipient or sender settings")
	case errors.Is(err, store.ErrSubscriptionLimit):
		writeError(w, http.StatusConflict, "you can keep up to 10 search alerts")
	case err != nil:
		a.internal(w, err)
	default:
		writeJSON(w, http.StatusCreated, item)
	}
}

func (a *API) deleteSearchSubscription(w http.ResponseWriter, r *http.Request) {
	err := a.alerts.Delete(r.Context(), accountID(r), r.PathValue("id"))
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "search alert not found")
		return
	}
	if err != nil {
		a.internal(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *API) testSearchSubscription(w http.ResponseWriter, r *http.Request) {
	if !a.alertEdits.allow(accountID(r), time.Now()) {
		w.Header().Set("Retry-After", "3600")
		writeError(w, http.StatusTooManyRequests, "too many email alert tests; try again later")
		return
	}
	err := a.alerts.Test(r.Context(), accountID(r), r.PathValue("id"))
	switch {
	case errors.Is(err, store.ErrNotFound):
		writeError(w, http.StatusNotFound, "search alert not found")
	case errors.Is(err, alerts.ErrUnavailable):
		writeError(w, http.StatusServiceUnavailable, "email alerts are not configured")
	case errors.Is(err, alerts.ErrDelivery):
		writeError(w, http.StatusBadGateway, "the test email could not be delivered")
	case err != nil:
		a.internal(w, err)
	default:
		w.WriteHeader(http.StatusNoContent)
	}
}

func validRecipient(value string) bool {
	if value == "" || len(value) > 254 || strings.ContainsAny(value, "\r\n") {
		return false
	}
	address, err := mail.ParseAddress(value)
	if err != nil || address.Name != "" || !strings.EqualFold(address.Address, value) {
		return false
	}
	_, domain, ok := strings.Cut(address.Address, "@")
	return ok && strings.Contains(domain, ".")
}

func matchingSearchPath(path, query, filterParam string) bool {
	parsed, err := url.Parse(path)
	if err != nil {
		return false
	}
	values := parsed.Query()
	return len(values["q"]) == 1 && len(values["filters"]) == 1 && values.Get("q") == query && values.Get("filters") == filterParam && len(values) == 2
}

func cleanProductIDs(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	result := make([]string, 0, len(values))
	for _, value := range values {
		if !validListingID(value) {
			continue
		}
		if _, exists := seen[value]; exists {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
	}
	return result
}

func (a *API) health(w http.ResponseWriter, r *http.Request) {
	type services struct {
		Backend  bool `json:"backend"`
		Database bool `json:"database"`
		Redis    bool `json:"redis"`
	}

	checks := services{Backend: true}
	var wait sync.WaitGroup
	wait.Add(2)
	go func() {
		defer wait.Done()
		checks.Database = a.store.Healthy(r.Context())
	}()
	go func() {
		defer wait.Done()
		checks.Redis = a.cache.Healthy(r.Context())
	}()
	wait.Wait()

	status := http.StatusOK
	state := "ok"
	if !checks.Database || !checks.Redis {
		status = http.StatusServiceUnavailable
		state = "degraded"
	}
	writeJSON(w, status, struct {
		Status    string    `json:"status"`
		Services  services  `json:"services"`
		CheckedAt time.Time `json:"checkedAt"`
	}{Status: state, Services: checks, CheckedAt: time.Now().UTC()})
}

func (a *API) exchangeRates(w http.ResponseWriter, r *http.Request) {
	rates, err := a.rates.Latest(r.Context())
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "exchange rates are temporarily unavailable")
		return
	}
	writeJSON(w, http.StatusOK, rates)
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
	a.logins.reset(client)
	writeJSON(w, http.StatusOK, model.Session{ID: account.ID, Token: token})
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
	claims := auth.ClaimsFrom(r.Context())
	if claims == nil {
		writeJSON(w, http.StatusOK, nil)
		return
	}
	account, err := a.store.AccountByID(r.Context(), claims.Subject)
	if errors.Is(err, store.ErrNotFound) {
		writeJSON(w, http.StatusOK, nil)
		return
	}
	if err != nil {
		a.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, model.Session{ID: account.ID})
}

func (a *API) history(w http.ResponseWriter, r *http.Request) {
	items, err := a.store.SearchHistory(r.Context(), accountID(r))
	if err != nil {
		a.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (a *API) preferences(w http.ResponseWriter, r *http.Request) {
	preferences, err := a.store.Preferences(r.Context(), accountID(r))
	if err != nil {
		a.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, preferences)
}

func (a *API) savePreferences(w http.ResponseWriter, r *http.Request) {
	var preferences model.Preferences
	if !decode(w, r, &preferences) {
		return
	}
	preferences.ExcludedWords = cleanWords(preferences.ExcludedWords)
	if len(preferences.ExcludedWords) > 50 {
		writeError(w, http.StatusBadRequest, "too many excluded words")
		return
	}
	if err := a.store.SavePreferences(r.Context(), accountID(r), preferences); err != nil {
		a.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, preferences)
}

func (a *API) savedListings(w http.ResponseWriter, r *http.Request) {
	items, err := a.store.SavedListings(r.Context(), accountID(r))
	if err != nil {
		a.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (a *API) saveListing(w http.ResponseWriter, r *http.Request) {
	var product model.Product
	if !decode(w, r, &product) {
		return
	}
	if product.ID == "" || product.ID != r.PathValue("id") || len(product.Title) > 500 || !strings.HasPrefix(product.URLToProduct, "https://999.md/") {
		writeError(w, http.StatusBadRequest, "invalid listing")
		return
	}
	if err := a.store.SaveListing(r.Context(), accountID(r), product); err != nil {
		a.internal(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *API) deleteListing(w http.ResponseWriter, r *http.Request) {
	if err := a.store.DeleteListing(r.Context(), accountID(r), r.PathValue("id")); err != nil {
		a.internal(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *API) listingSummary(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !validListingID(id) {
		writeError(w, http.StatusBadRequest, "invalid listing id")
		return
	}
	if !a.summaries.allow(clientAddress(r), time.Now()) {
		w.Header().Set("Retry-After", "60")
		writeError(w, http.StatusTooManyRequests, "too many detail requests; try again shortly")
		return
	}
	if summary, ok := a.cache.GetListingSummary(r.Context(), id); ok {
		writeJSON(w, http.StatusOK, summary)
		return
	}
	release, err := a.queries.acquire(r.Context(), "listing-summary:"+id)
	if err != nil {
		return
	}
	defer release()
	if summary, ok := a.cache.GetListingSummary(r.Context(), id); ok {
		writeJSON(w, http.StatusOK, summary)
		return
	}
	summary, err := a.scraper.ListingSummary(r.Context(), id)
	if err != nil {
		a.logger.Warn("listing detail scrape failed", "listing_id", id, "error", err)
		writeError(w, http.StatusBadGateway, "listing details are temporarily unavailable")
		return
	}
	cacheCtx, cancel := context.WithTimeout(context.WithoutCancel(r.Context()), 2*time.Second)
	defer cancel()
	a.cache.SetListingSummary(cacheCtx, id, summary)
	writeJSON(w, http.StatusOK, summary)
}

func validListingID(id string) bool {
	if len(id) == 0 || len(id) > 32 {
		return false
	}
	for _, character := range id {
		if character < '0' || character > '9' {
			return false
		}
	}
	return true
}

func cleanWords(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	cleaned := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.ToLower(strings.Join(strings.Fields(value), " "))
		if value == "" || len(value) > 60 {
			continue
		}
		if _, exists := seen[value]; exists {
			continue
		}
		seen[value] = struct{}{}
		cleaned = append(cleaned, value)
	}
	return cleaned
}

type searchEvent struct {
	Type        string          `json:"type"`
	Products    []model.Product `json:"products,omitempty"`
	LoadedPages int             `json:"loadedPages,omitempty"`
	TotalPages  int             `json:"totalPages,omitempty"`
	Message     string          `json:"message,omitempty"`
}

type productSearchRequest struct {
	ProductSearchCriteria     string `json:"productSearchCriteria"`
	ExtractVINFromDescription bool   `json:"extractVINFromDescription"`
}

func (a *API) productsStream(w http.ResponseWriter, r *http.Request) {
	var request productSearchRequest
	if !decode(w, r, &request) {
		return
	}
	query := strings.TrimSpace(request.ProductSearchCriteria)
	if query == "" {
		writeError(w, http.StatusBadRequest, "search criteria is required")
		return
	}
	if len(query) > 160 {
		writeError(w, http.StatusBadRequest, "search criteria is too large")
		return
	}
	if claims := auth.ClaimsFrom(r.Context()); claims != nil {
		if err := a.store.AddSearch(r.Context(), claims.Subject, query); err != nil {
			a.logger.Warn("search history was not saved", "error", err)
		}
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, http.StatusInternalServerError, "streaming is unavailable")
		return
	}

	cacheQuery := searchCacheQuery(query, request.ExtractVINFromDescription)
	if cached, ok := a.cachedSearch(r.Context(), cacheQuery); ok {
		a.streamCached(w, flusher, cached)
		return
	}
	release, err := a.queries.acquire(r.Context(), cacheQuery)
	if err != nil {
		return
	}
	defer release()
	if cached, ok := a.cachedSearch(r.Context(), cacheQuery); ok {
		a.streamCached(w, flusher, cached)
		return
	}
	var writer *streamWriter
	loadedPages := 0
	products, err := a.scraper.SearchStreamWithOptions(r.Context(), query, scraper.SearchOptions{
		ExtractVINFromDescription: request.ExtractVINFromDescription,
	}, func(batch scraper.Batch) error {
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

	_ = writer.write(searchEvent{Type: "done", LoadedPages: loadedPages})

	// Results are already delivered. Finish populating Redis under the query
	// gate even if this client disconnects, so the next identical search hits
	// cache instead of scraping again.
	cacheCtx, cancel := context.WithTimeout(context.WithoutCancel(r.Context()), 2*time.Second)
	defer cancel()
	a.cache.SetSearch(cacheCtx, cacheQuery, model.ProductsContainer{Products: products})
}

func searchCacheQuery(query string, extractVINFromDescription bool) string {
	if extractVINFromDescription {
		return query + "\n[listing-quality-v6;description-vin]"
	}
	return query + "\n[listing-quality-v6]"
}

func (a *API) cachedSearch(ctx context.Context, query string) (model.ProductsContainer, bool) {
	return a.cache.GetQuery(ctx, query)
}

func (a *API) streamCached(w http.ResponseWriter, flusher http.Flusher, cached model.ProductsContainer) {
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
	w.Header().Set("Cache-Control", "no-cache, no-store, no-transform")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()
	return &streamWriter{writer: w, flusher: flusher}
}

func (w *streamWriter) write(event searchEvent) error {
	return w.writeEvent(event.Type, event)
}

func (w *streamWriter) writeEvent(eventType string, event any) error {
	payload, err := json.Marshal(event)
	if err != nil {
		return err
	}
	if _, err := fmt.Fprintf(w.writer, "event: %s\ndata: %s\n\n", eventType, payload); err != nil {
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
	limit   int
	window  time.Duration
}

const maxRateLimitClients = 4096

func newLoginLimiter() *loginLimiter {
	return newRequestLimiter(6, time.Minute)
}

func newRequestLimiter(limit int, window time.Duration) *loginLimiter {
	return &loginLimiter{windows: make(map[string]loginWindow), limit: limit, window: window}
}

func (l *loginLimiter) allow(client string, now time.Time) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	if _, exists := l.windows[client]; !exists && len(l.windows) >= maxRateLimitClients {
		for key, candidate := range l.windows {
			if now.After(candidate.until) {
				delete(l.windows, key)
			}
		}
		if len(l.windows) >= maxRateLimitClients {
			for key := range l.windows {
				delete(l.windows, key)
				break
			}
		}
	}
	window := l.windows[client]
	if now.After(window.until) {
		window = loginWindow{until: now.Add(l.window)}
	}
	if window.count >= l.limit {
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
		if origin != "" {
			if _, allowed := a.origins[origin]; !allowed {
				writeError(w, http.StatusForbidden, "origin is not allowed")
				return
			}
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Add("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Max-Age", "600")
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
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		writeError(w, http.StatusBadRequest, "request body must contain one JSON value")
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
