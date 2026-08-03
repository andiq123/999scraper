package scraper

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/rand/v2"
	"net/http"
	"slices"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode"

	"github.com/andi/999scraper/internal/model"
)

const (
	pageSize        = 40
	maxResponseSize = 10 << 20
)

const searchQuery = `query SearchAds($input: Ads_SearchInput!) {
  searchAds(input: $input) {
    ads {
      id
      title
      price: feature(id: 2) { value }
      images: feature(id: 14) { value }
      year: feature(id: 19) { value }
      make: feature(id: 20) { value }
      model: feature(id: 21) { value }
      booster: product(alias: BOOSTER_V2) { enable }
    }
    count
  }
}`

type Options struct {
	MaxPages       int
	Concurrency    int
	MinInterval    time.Duration
	MaxRetries     int
	RequestTimeout time.Duration
}

type Batch struct {
	Page       int
	TotalPages int
	Products   []model.Product
}

type Scraper struct {
	baseURL    string
	options    Options
	client     *http.Client
	throttleMu sync.Mutex
	nextStart  time.Time
}

type graphQLRequest struct {
	OperationName string         `json:"operationName"`
	Variables     map[string]any `json:"variables"`
	Query         string         `json:"query"`
}

type graphQLResponse struct {
	Data struct {
		SearchAds struct {
			Ads   []advert `json:"ads"`
			Count int      `json:"count"`
		} `json:"searchAds"`
	} `json:"data"`
	Errors []struct {
		Message string `json:"message"`
	} `json:"errors"`
}

type advert struct {
	ID    string `json:"id"`
	Title string `json:"title"`
	Price struct {
		Value json.RawMessage `json:"value"`
	} `json:"price"`
	Images struct {
		Value []string `json:"value"`
	} `json:"images"`
	Year struct {
		Value int `json:"value"`
	} `json:"year"`
	Make struct {
		Value choiceValue `json:"value"`
	} `json:"make"`
	Model struct {
		Value choiceValue `json:"value"`
	} `json:"model"`
	Booster struct {
		Enable bool `json:"enable"`
	} `json:"booster"`
}

type choiceValue struct {
	Translated string `json:"translated"`
}

type priceValue struct {
	Bargain bool   `json:"bargain"`
	Unit    string `json:"unit"`
	Value   int    `json:"value"`
}

type pageResult struct {
	page     int
	products []model.Product
	err      error
}

func New(baseURL string, options Options) *Scraper {
	if options.MaxPages < 1 {
		options.MaxPages = 25
	}
	if options.Concurrency < 1 {
		options.Concurrency = 3
	}
	if options.Concurrency > options.MaxPages {
		options.Concurrency = options.MaxPages
	}
	if options.MinInterval <= 0 {
		options.MinInterval = 350 * time.Millisecond
	}
	if options.MaxRetries < 0 {
		options.MaxRetries = 0
	}
	if options.RequestTimeout <= 0 {
		options.RequestTimeout = 20 * time.Second
	}

	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.MaxIdleConns = options.Concurrency * 2
	transport.MaxIdleConnsPerHost = options.Concurrency
	transport.MaxConnsPerHost = options.Concurrency
	transport.IdleConnTimeout = 90 * time.Second

	return &Scraper{
		baseURL: strings.TrimRight(baseURL, "/"),
		options: options,
		client: &http.Client{
			Timeout:   options.RequestTimeout,
			Transport: transport,
		},
	}
}

func (s *Scraper) Search(ctx context.Context, query string) ([]model.Product, error) {
	return s.SearchStream(ctx, query, nil)
}

// SearchStream fetches the first page to discover the result size, then fetches
// remaining pages with bounded concurrency. Request starts are globally spaced
// across all searches handled by this Scraper instance.
func (s *Scraper) SearchStream(ctx context.Context, query string, yield func(Batch) error) ([]model.Product, error) {
	query = strings.TrimSpace(query)
	first, count, err := s.pageWithRetry(ctx, query, 0, pageSize)
	if err != nil {
		return nil, err
	}
	totalPages := (count + pageSize - 1) / pageSize
	if totalPages < 1 {
		totalPages = 1
	}
	if totalPages > s.options.MaxPages {
		totalPages = s.options.MaxPages
	}
	products := append([]model.Product(nil), first...)
	if yield != nil {
		if err := yield(Batch{Page: 1, TotalPages: totalPages, Products: first}); err != nil {
			return nil, err
		}
	}
	if totalPages == 1 {
		return products, nil
	}

	workCtx, cancel := context.WithCancel(ctx)
	defer cancel()
	jobs := make(chan int, totalPages-1)
	results := make(chan pageResult, totalPages-1)
	workers := min(s.options.Concurrency, totalPages-1)
	var wg sync.WaitGroup
	for worker := 0; worker < workers; worker++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for page := range jobs {
				items, _, err := s.pageWithRetry(workCtx, query, page*pageSize, pageSize)
				select {
				case results <- pageResult{page: page + 1, products: items, err: err}:
				case <-workCtx.Done():
					return
				}
				if err != nil {
					return
				}
			}
		}()
	}
	for page := 1; page < totalPages; page++ {
		jobs <- page
	}
	close(jobs)
	go func() {
		wg.Wait()
		close(results)
	}()

	var searchErr error
	for result := range results {
		if result.err != nil {
			if searchErr == nil {
				searchErr = result.err
				cancel()
			}
			continue
		}
		if searchErr != nil {
			continue
		}
		products = append(products, result.products...)
		if yield != nil {
			if err := yield(Batch{Page: result.page, TotalPages: totalPages, Products: result.products}); err != nil {
				searchErr = err
				cancel()
			}
		}
	}
	if searchErr != nil {
		return products, searchErr
	}
	return products, nil
}

func (s *Scraper) pageWithRetry(ctx context.Context, query string, skip, limit int) ([]model.Product, int, error) {
	var lastErr error
	for attempt := 0; attempt <= s.options.MaxRetries; attempt++ {
		if err := s.waitForSlot(ctx); err != nil {
			return nil, 0, err
		}
		products, count, retryAfter, err := s.page(ctx, query, skip, limit)
		if err == nil {
			return products, count, nil
		}
		lastErr = err
		if !isRetryable(err) || attempt == s.options.MaxRetries {
			break
		}
		delay := retryAfter
		if delay <= 0 {
			delay = backoff(attempt)
		}
		if err := wait(ctx, delay); err != nil {
			return nil, 0, err
		}
	}
	return nil, 0, lastErr
}

func (s *Scraper) waitForSlot(ctx context.Context) error {
	s.throttleMu.Lock()
	now := time.Now()
	start := now
	if s.nextStart.After(now) {
		start = s.nextStart
	}
	s.nextStart = start.Add(s.options.MinInterval)
	s.throttleMu.Unlock()
	return wait(ctx, time.Until(start))
}

func (s *Scraper) page(ctx context.Context, query string, skip, limit int) ([]model.Product, int, time.Duration, error) {
	payload, err := json.Marshal(graphQLRequest{
		OperationName: "SearchAds",
		Variables: map[string]any{"input": map[string]any{
			"query": query, "pagination": map[string]int{"limit": limit, "skip": skip},
		}},
		Query: searchQuery,
	})
	if err != nil {
		return nil, 0, 0, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.baseURL+"/graphql", bytes.NewReader(payload))
	if err != nil {
		return nil, 0, 0, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Lang", "ro")
	req.Header.Set("Source", "desktop")
	req.Header.Set("User-Agent", "999scraper/3.0 (+local search client)")
	res, err := s.client.Do(req)
	if err != nil {
		if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
			return nil, 0, 0, err
		}
		return nil, 0, 0, retryableError{fmt.Errorf("search listings: %w", err)}
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		_, _ = io.Copy(io.Discard, io.LimitReader(res.Body, 64<<10))
		err := fmt.Errorf("listing service returned %s", res.Status)
		if retryableStatus(res.StatusCode) {
			return nil, 0, parseRetryAfter(res.Header.Get("Retry-After")), retryableError{err}
		}
		return nil, 0, 0, err
	}
	var response graphQLResponse
	decoder := json.NewDecoder(io.LimitReader(res.Body, maxResponseSize))
	if err := decoder.Decode(&response); err != nil {
		return nil, 0, 0, retryableError{fmt.Errorf("decode listings: %w", err)}
	}
	if len(response.Errors) > 0 {
		return nil, 0, 0, fmt.Errorf("listing service: %s", response.Errors[0].Message)
	}
	products := make([]model.Product, 0, len(response.Data.SearchAds.Ads))
	for _, ad := range response.Data.SearchAds.Ads {
		products = append(products, s.product(ad))
	}
	return products, response.Data.SearchAds.Count, 0, nil
}

type retryableError struct{ error }

func isRetryable(err error) bool {
	var target retryableError
	return errors.As(err, &target)
}

func retryableStatus(status int) bool {
	return status == http.StatusRequestTimeout || status == http.StatusTooEarly ||
		status == http.StatusTooManyRequests || status == http.StatusInternalServerError ||
		status == http.StatusBadGateway || status == http.StatusServiceUnavailable ||
		status == http.StatusGatewayTimeout
}

func parseRetryAfter(value string) time.Duration {
	if seconds, err := strconv.Atoi(strings.TrimSpace(value)); err == nil && seconds >= 0 {
		return time.Duration(seconds) * time.Second
	}
	if date, err := http.ParseTime(value); err == nil {
		return max(time.Until(date), 0)
	}
	return 0
}

func backoff(attempt int) time.Duration {
	base := min(500*time.Millisecond*time.Duration(1<<attempt), 10*time.Second)
	jitter := time.Duration(rand.Int64N(int64(base/2) + 1))
	return base + jitter
}

func wait(ctx context.Context, duration time.Duration) error {
	if duration <= 0 {
		return nil
	}
	timer := time.NewTimer(duration)
	defer timer.Stop()
	select {
	case <-timer.C:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (s *Scraper) product(ad advert) model.Product {
	price, currency, label := parsePrice(ad.Price.Value)
	image := ""
	if len(ad.Images.Value) > 0 {
		image = "https://i.simpalsmedia.com/999.md/BoardImages/320x240/" + ad.Images.Value[0]
	}
	return model.Product{
		ID:           ad.ID,
		Title:        strings.TrimSpace(ad.Title),
		ThumbnailURL: image,
		Price:        price,
		PriceString:  label,
		Currency:     currency,
		IsBoosted:    ad.Booster.Enable,
		Year:         ad.Year.Value,
		Make:         strings.TrimSpace(ad.Make.Value.Translated),
		Model:        strings.TrimSpace(ad.Model.Value.Translated),
		URLToProduct: s.baseURL + "/ro/" + ad.ID,
	}
}

func parsePrice(raw json.RawMessage) (*int, int, string) {
	if len(raw) == 0 || string(raw) == "null" {
		return nil, 0, "Price Negotiable"
	}
	var value priceValue
	if json.Unmarshal(raw, &value) != nil || value.Value <= 0 {
		return nil, 0, "Price Negotiable"
	}
	currency := 0
	switch value.Unit {
	case "UNIT_EUR":
		currency = 1
	case "UNIT_USD":
		currency = 2
	}
	return &value.Value, currency, ""
}

func Filter(products []model.Product, f model.Filters) []model.Product {
	queryTokens := words(f.ProductSearchCriteria)
	if f.Intent == "car" {
		queryTokens = slices.DeleteFunc(queryTokens, func(word string) bool {
			year, err := strconv.Atoi(word)
			return err == nil && year >= 1950 && year <= 2030
		})
	}
	result := make([]model.Product, 0, len(products))
	for _, p := range products {
		titleTokens := words(p.Title)
		if (f.ExcludeOtherAds && !containsAll(titleTokens, queryTokens)) ||
			(f.ExcludeBoosted && p.IsBoosted) ||
			(f.ExcludePriceNegotiable && p.Price == nil) ||
			(f.Intent == "car" && p.Year == 0) ||
			(f.YearFrom > 0 && p.Year < f.YearFrom) ||
			(f.YearTo > 0 && p.Year > f.YearTo) ||
			(f.Currency != nil && p.Currency != *f.Currency) ||
			(f.PriceMin > 0 && (p.Price == nil || *p.Price < f.PriceMin)) ||
			(f.PriceMax > 0 && (p.Price == nil || *p.Price > f.PriceMax)) ||
			(f.SmartCleanup && f.Intent == "car" && !isPlausibleCar(p, titleTokens)) {
			continue
		}
		excluded := false
		for _, exclusion := range f.KeysToExclude {
			if containsPhrase(titleTokens, words(exclusion)) {
				excluded = true
				break
			}
		}
		if !excluded {
			result = append(result, p)
		}
	}
	sort.SliceStable(result, func(i, j int) bool {
		if result[i].Price == nil {
			return false
		}
		if result[j].Price == nil {
			return true
		}
		if f.Order == "priceDesc" {
			return *result[i].Price > *result[j].Price
		}
		return *result[i].Price < *result[j].Price
	})
	return result
}

var carNoise = map[string]struct{}{
	"accesorii": {}, "acumulator": {}, "anvelope": {}, "capace": {}, "covorașe": {}, "covorase": {},
	"dezmembrare": {}, "dezmembrări": {}, "faruri": {}, "huse": {}, "piese": {}, "roți": {}, "jante": {},
	"разборка": {}, "запчасти": {}, "детали": {}, "коврики": {}, "чехлы": {}, "диски": {}, "шины": {},
}

func isPlausibleCar(product model.Product, titleTokens []string) bool {
	if product.Make == "" || product.Model == "" || product.Year == 0 || product.Price == nil {
		return false
	}
	for _, word := range titleTokens {
		if _, noisy := carNoise[word]; noisy {
			return false
		}
	}
	minimum := 5_000
	if product.Currency == 1 || product.Currency == 2 {
		minimum = 300
	}
	return *product.Price >= minimum
}

func words(value string) []string {
	return strings.FieldsFunc(strings.ToLower(value), func(r rune) bool {
		return !unicode.IsLetter(r) && !unicode.IsNumber(r)
	})
}

func containsAll(haystack, needles []string) bool {
	for _, needle := range needles {
		found := false
		for _, word := range haystack {
			if word == needle {
				found = true
				break
			}
		}
		if !found {
			return false
		}
	}
	return len(needles) > 0
}

func containsPhrase(haystack, phrase []string) bool {
	if len(phrase) == 0 || len(phrase) > len(haystack) {
		return false
	}
	for start := 0; start <= len(haystack)-len(phrase); start++ {
		match := true
		for offset := range phrase {
			if haystack[start+offset] != phrase[offset] {
				match = false
				break
			}
		}
		if match {
			return true
		}
	}
	return false
}
