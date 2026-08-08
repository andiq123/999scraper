package httpapi

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path"
	"strings"
	"sync"
	"time"
)

const (
	vinCacheLifetime     = 24 * time.Hour
	vinEvidenceCacheLife = 6 * time.Hour
	vinCacheMaxItems     = 512
)

var errVINSearchNotConfigured = errors.New("Google VIN evidence search is not configured")

type vinResearchEvent struct {
	Type     string       `json:"type"`
	VIN      string       `json:"vin,omitempty"`
	Message  string       `json:"message,omitempty"`
	Evidence *vinEvidence `json:"evidence,omitempty"`
	Vehicle  *vinVehicle  `json:"vehicle,omitempty"`
}

// vinEvidence is an exact-VIN page returned by Google, not a generic search
// destination. Only allow-listed vehicle auction detail pages are emitted.
type vinEvidence struct {
	ID       string            `json:"id"`
	Kind     string            `json:"kind"`
	Source   string            `json:"source"`
	Title    string            `json:"title"`
	Summary  string            `json:"summary,omitempty"`
	URL      string            `json:"url"`
	ImageURL string            `json:"imageUrl,omitempty"`
	Facts    []vinEvidenceFact `json:"facts,omitempty"`
}

type vinEvidenceFact struct {
	Label string `json:"label"`
	Value string `json:"value"`
}

type vinVehicle struct {
	Make                 string `json:"make,omitempty"`
	Model                string `json:"model,omitempty"`
	ModelYear            string `json:"modelYear,omitempty"`
	Manufacturer         string `json:"manufacturer,omitempty"`
	VehicleType          string `json:"vehicleType,omitempty"`
	BodyClass            string `json:"bodyClass,omitempty"`
	Series               string `json:"series,omitempty"`
	Trim                 string `json:"trim,omitempty"`
	DriveType            string `json:"driveType,omitempty"`
	FuelTypePrimary      string `json:"fuelTypePrimary,omitempty"`
	ElectrificationLevel string `json:"electrificationLevel,omitempty"`
	EngineCylinders      string `json:"engineCylinders,omitempty"`
	DisplacementL        string `json:"displacementL,omitempty"`
	TransmissionStyle    string `json:"transmissionStyle,omitempty"`
	PlantCountry         string `json:"plantCountry,omitempty"`
	ErrorCode            string `json:"errorCode,omitempty"`
	ErrorText            string `json:"errorText,omitempty"`
}

type cachedVIN struct {
	vehicle   vinVehicle
	expiresAt time.Time
}

type cachedVINEvidence struct {
	items     []vinEvidence
	expiresAt time.Time
}

type vinDecoder struct {
	client  *http.Client
	mu      sync.Mutex
	entries map[string]cachedVIN
}

type vinSearcher struct {
	apiKey   string
	engineID string
	endpoint string
	client   *http.Client
	mu       sync.Mutex
	entries  map[string]cachedVINEvidence
}

func newVINDecoder() *vinDecoder {
	return &vinDecoder{client: &http.Client{Timeout: 9 * time.Second}, entries: make(map[string]cachedVIN)}
}

func newVINSearcher(apiKey, engineID string) *vinSearcher {
	return &vinSearcher{
		apiKey: strings.TrimSpace(apiKey), engineID: strings.TrimSpace(engineID),
		endpoint: "https://customsearch.googleapis.com/customsearch/v1",
		client:   &http.Client{Timeout: 10 * time.Second}, entries: make(map[string]cachedVINEvidence),
	}
}

func (a *API) vinResearchStream(w http.ResponseWriter, r *http.Request) {
	vin := normalizeVIN(r.PathValue("vin"))
	if vin == "" {
		writeError(w, http.StatusBadRequest, "enter a valid 17-character VIN")
		return
	}
	if !a.vinChecks.allow(clientAddress(r), time.Now()) {
		w.Header().Set("Retry-After", "60")
		writeError(w, http.StatusTooManyRequests, "too many VIN research requests; try again shortly")
		return
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, http.StatusInternalServerError, "streaming is unavailable")
		return
	}

	writer := beginStream(w, flusher)
	if err := writer.writeEvent("start", vinResearchEvent{Type: "start", VIN: vin, Message: "Finding exact VIN records"}); err != nil {
		return
	}

	type decodeResult struct {
		vehicle vinVehicle
		err     error
	}
	type searchResult struct {
		items []vinEvidence
		err   error
	}
	decodeResults := make(chan decodeResult, 1)
	searchResults := make(chan searchResult, 1)
	go func() {
		vehicle, err := a.vinDecoder.decode(r.Context(), vin)
		decodeResults <- decodeResult{vehicle: vehicle, err: err}
	}()
	go func() {
		items, err := a.vinSearch.search(r.Context(), vin)
		searchResults <- searchResult{items: items, err: err}
	}()

	found := 0
	searchCompleted := true
	for range 2 {
		select {
		case result := <-decodeResults:
			if result.err != nil {
				if !errors.Is(result.err, r.Context().Err()) {
					a.logger.Warn("NHTSA VIN decode failed", "error", result.err)
					_ = writer.writeEvent("warning", vinResearchEvent{Type: "warning", VIN: vin, Message: "Official vehicle identity is temporarily unavailable."})
				}
			} else if err := writer.writeEvent("vehicle", vinResearchEvent{Type: "vehicle", VIN: vin, Vehicle: &result.vehicle}); err != nil {
				return
			}
		case result := <-searchResults:
			if result.err != nil {
				searchCompleted = false
				message := "Exact VIN evidence search is temporarily unavailable."
				if errors.Is(result.err, errVINSearchNotConfigured) {
					message = "Exact web evidence search is not configured on this server."
				} else {
					a.logger.Warn("Google VIN evidence search failed", "error", result.err)
				}
				if err := writer.writeEvent("warning", vinResearchEvent{Type: "warning", VIN: vin, Message: message}); err != nil {
					return
				}
				continue
			}
			for index := range result.items {
				item := result.items[index]
				if err := writer.writeEvent("evidence", vinResearchEvent{Type: "evidence", VIN: vin, Evidence: &item}); err != nil {
					return
				}
				found++
			}
		}
	}
	message := "Exact VIN evidence search unavailable"
	if searchCompleted && found == 0 {
		message = "No exact auction record found"
	} else if found == 1 {
		message = "1 exact VIN record found"
	} else if found > 1 {
		message = fmt.Sprintf("%d exact VIN records found", found)
	}
	_ = writer.writeEvent("done", vinResearchEvent{Type: "done", VIN: vin, Message: message})
}

func (s *vinSearcher) search(ctx context.Context, vin string) ([]vinEvidence, error) {
	if s.apiKey == "" || s.engineID == "" {
		return nil, errVINSearchNotConfigured
	}
	now := time.Now()
	s.mu.Lock()
	if cached, ok := s.entries[vin]; ok && now.Before(cached.expiresAt) {
		s.mu.Unlock()
		return append([]vinEvidence(nil), cached.items...), nil
	}
	s.mu.Unlock()

	endpoint, err := url.Parse(s.endpoint)
	if err != nil {
		return nil, err
	}
	query := endpoint.Query()
	query.Set("key", s.apiKey)
	query.Set("cx", s.engineID)
	query.Set("exactTerms", vin)
	query.Set("q", `"`+vin+`" (auction OR lot OR damage OR salvage OR bid)`)
	query.Set("num", "10")
	query.Set("filter", "1")
	query.Set("safe", "active")
	endpoint.RawQuery = query.Encode()
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint.String(), nil)
	if err != nil {
		return nil, err
	}
	request.Header.Set("Accept", "application/json")
	request.Header.Set("User-Agent", "999-Market-VIN-Research/1.0")
	response, err := s.client.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("Google Custom Search returned status %d", response.StatusCode)
	}
	var payload googleSearchResponse
	if err := json.NewDecoder(io.LimitReader(response.Body, 2<<20)).Decode(&payload); err != nil {
		return nil, err
	}
	items := make([]vinEvidence, 0, len(payload.Items))
	seen := make(map[string]struct{}, len(payload.Items))
	for _, result := range payload.Items {
		item, ok := exactVINEvidence(vin, result)
		if !ok {
			continue
		}
		if _, duplicate := seen[item.URL]; duplicate {
			continue
		}
		seen[item.URL] = struct{}{}
		items = append(items, item)
	}
	s.mu.Lock()
	trimVINCache(s.entries, now)
	s.entries[vin] = cachedVINEvidence{items: append([]vinEvidence(nil), items...), expiresAt: now.Add(vinEvidenceCacheLife)}
	s.mu.Unlock()
	return items, nil
}

type googleSearchResponse struct {
	Items []googleSearchResult `json:"items"`
}

type googleSearchResult struct {
	Title   string `json:"title"`
	Link    string `json:"link"`
	Snippet string `json:"snippet"`
	Pagemap struct {
		Images []struct {
			Source string `json:"src"`
		} `json:"cse_image"`
		MetaTags []map[string]string `json:"metatags"`
	} `json:"pagemap"`
}

func exactVINEvidence(vin string, result googleSearchResult) (vinEvidence, bool) {
	parsed, err := url.Parse(result.Link)
	if err != nil || parsed.Scheme != "https" || parsed.User != nil {
		return vinEvidence{}, false
	}
	host := strings.ToLower(strings.TrimPrefix(parsed.Hostname(), "www."))
	pagePath := strings.ToLower(parsed.EscapedPath())
	vinInPath := strings.Contains(pagePath, strings.ToLower(vin))
	source := ""
	switch {
	case host == "bid.cars" && strings.Contains(pagePath, "/lot/"):
		source = "Bid.Cars"
	case (host == "copart.com" || strings.HasSuffix(host, ".copart.com")) && strings.Contains(pagePath, "/lot/"):
		source = "Copart"
	case (host == "iaai.com" || strings.HasSuffix(host, ".iaai.com")) && strings.Contains(pagePath, "/vehicledetail/"):
		source = "IAA"
	case host == "stat.vin" && vinInPath:
		source = "Stat.vin"
	case host == "opendatacar.com" && vinInPath:
		source = "OpenDataCar"
	case (host == "bidhistory.org" || strings.HasSuffix(host, ".bidhistory.org")) && vinInPath:
		source = "BidHistory"
	default:
		return vinEvidence{}, false
	}
	matchText := strings.ToUpper(result.Title + " " + result.Snippet + " " + parsed.Path)
	if !strings.Contains(matchText, vin) {
		return vinEvidence{}, false
	}
	parsed.Fragment = ""
	cleanURL := parsed.String()
	hash := sha256.Sum256([]byte(cleanURL))
	item := vinEvidence{
		ID:      hex.EncodeToString(hash[:8]),
		Kind:    "auction",
		Source:  source,
		Title:   cleanSearchText(result.Title, 180),
		Summary: cleanSearchText(result.Snippet, 360),
		URL:     cleanURL,
		Facts:   evidenceFacts(parsed, result),
	}
	if len(result.Pagemap.Images) > 0 {
		if image, err := url.Parse(result.Pagemap.Images[0].Source); err == nil && image.Scheme == "https" && image.User == nil {
			item.ImageURL = image.String()
		}
	}
	return item, true
}

func evidenceFacts(pageURL *url.URL, result googleSearchResult) []vinEvidenceFact {
	facts := make([]vinEvidenceFact, 0, 3)
	if strings.EqualFold(strings.TrimPrefix(pageURL.Hostname(), "www."), "bid.cars") {
		parts := strings.Split(strings.Trim(path.Clean(pageURL.Path), "/"), "/")
		if len(parts) >= 3 && parts[1] == "lot" {
			facts = append(facts, vinEvidenceFact{Label: "Lot", Value: parts[2]})
		}
	}
	for _, metadata := range result.Pagemap.MetaTags {
		for _, candidate := range []struct{ key, label string }{{"product:price:amount", "Price"}, {"og:site_name", "Published by"}} {
			if value := cleanSearchText(metadata[candidate.key], 80); value != "" && !hasFact(facts, candidate.label) {
				facts = append(facts, vinEvidenceFact{Label: candidate.label, Value: value})
			}
		}
	}
	return facts
}

func hasFact(facts []vinEvidenceFact, label string) bool {
	for _, fact := range facts {
		if fact.Label == label {
			return true
		}
	}
	return false
}

func cleanSearchText(value string, limit int) string {
	value = strings.Join(strings.Fields(strings.TrimSpace(value)), " ")
	if len(value) <= limit {
		return value
	}
	return strings.TrimSpace(value[:limit-1]) + "…"
}

func trimVINCache[T cachedVIN | cachedVINEvidence](entries map[string]T, now time.Time) {
	if len(entries) < vinCacheMaxItems {
		return
	}
	// Both cache value types intentionally expose expiry only within their own
	// callers; bounded eviction keeps this generic helper simple and predictable.
	for key := range entries {
		delete(entries, key)
		if len(entries) < vinCacheMaxItems {
			break
		}
	}
}

func (d *vinDecoder) decode(ctx context.Context, vin string) (vinVehicle, error) {
	now := time.Now()
	d.mu.Lock()
	if cached, ok := d.entries[vin]; ok && now.Before(cached.expiresAt) {
		d.mu.Unlock()
		return cached.vehicle, nil
	}
	d.mu.Unlock()

	endpoint := "https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/" + url.PathEscape(vin) + "?format=json"
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return vinVehicle{}, err
	}
	request.Header.Set("Accept", "application/json")
	request.Header.Set("User-Agent", "999-Market-VIN-Research/1.0")
	response, err := d.client.Do(request)
	if err != nil {
		return vinVehicle{}, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return vinVehicle{}, fmt.Errorf("NHTSA returned status %d", response.StatusCode)
	}
	var payload struct {
		Results []vinVehicle `json:"Results"`
	}
	if err := json.NewDecoder(io.LimitReader(response.Body, 1<<20)).Decode(&payload); err != nil {
		return vinVehicle{}, err
	}
	if len(payload.Results) != 1 {
		return vinVehicle{}, errors.New("NHTSA returned no vehicle")
	}
	vehicle := payload.Results[0]
	d.mu.Lock()
	trimVINCache(d.entries, now)
	d.entries[vin] = cachedVIN{vehicle: vehicle, expiresAt: now.Add(vinCacheLifetime)}
	d.mu.Unlock()
	return vehicle, nil
}

func normalizeVIN(value string) string {
	vin := strings.ToUpper(strings.TrimSpace(value))
	if len(vin) != 17 {
		return ""
	}
	for _, character := range vin {
		if character < '0' || character > 'Z' || (character > '9' && character < 'A') || character == 'I' || character == 'O' || character == 'Q' {
			return ""
		}
	}
	return vin
}
