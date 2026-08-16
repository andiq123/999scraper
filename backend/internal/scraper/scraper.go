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
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/andi/999scraper/internal/model"
)

const (
	pageSize        = 40
	maxResponseSize = 10 << 20
)

const searchQuery = `query SearchAds($input: Ads_SearchInput!, $includeDescriptionVIN: Boolean!) {
  searchAds(input: $input) {
    ads {
      id
      title
      price: feature(id: 2) { value }
      offerType: feature(id: 1) { value }
      images: feature(id: 14) { value }
      year: feature(id: 19) { value }
      make: feature(id: 20) { value }
      model: feature(id: 21) { value }
      transmission: feature(id: 101) { value }
      bodyType: feature(id: 102) { value }
      mileage: feature(id: 104) { value }
      power: feature(id: 107) { value }
      drivetrain: feature(id: 108) { value }
      fuel: feature(id: 151) { value }
      registration: feature(id: 775) { value }
      originCountry: feature(id: 1763) { value }
      vinCode: feature(id: 2512) { value }
      body: feature(id: 13) @include(if: $includeDescriptionVIN) { value }
      phoneModel: feature(id: 590) { value }
      consoleBrand: feature(id: 693) { value }
      consoleModel: feature(id: 694) { value }
      phoneStorage: feature(id: 1265) { value }
      consoleStorage: feature(id: 2295) { value }
      phoneBrand: feature(id: 589) { value }
      phoneRAM: feature(id: 1266) { value }
      phoneOS: feature(id: 591) { value }
      laptopBrand: feature(id: 685) { value }
      laptopCPU: feature(id: 675) { value }
      laptopCPUModel: feature(id: 2285) { value }
      laptopRAM: feature(id: 1244) { value }
      laptopStorage: feature(id: 677) { value }
      laptopGPU: feature(id: 2283) { value }
      laptopGPUModel: feature(id: 2284) { value }
      laptopOS: feature(id: 681) { value }
      screen: feature(id: 687) { value }
      laptopResolution: feature(id: 975) { value }
      tvBrand: feature(id: 723) { value }
      tvResolution: feature(id: 726) { value }
      tvPlatform: feature(id: 1807) { value }
      rooms: feature(id: 241) { value }
      area: feature(id: 244) { value }
      sector: feature(id: 9) { value }
      housingStock: feature(id: 852) { value }
      listingAuthor: feature(id: 795) { value }
      floor: feature(id: 248) { value }
      propertyState: feature(id: 253) { value }
      buildingType: feature(id: 247) { value }
      condition: feature(id: 593) { value }
      subCategory { url title { translated } }
      booster: product(alias: BOOSTER_V2) { enable }
    }
    count
  }
}`

const advertQuery = `query Advert($input: AdvertInput!) {
  advert(input: $input) {
    id title state
    owner { login }
    subCategory { url title { translated } }
    groups(placement: VIEW_ONE_DESKTOP) {
      title
      controls { title feature { type value } }
    }
  }
}`

type Options struct {
	MaxPages       int
	Concurrency    int
	MaxSearches    int
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
	baseURL     string
	options     Options
	client      *http.Client
	throttleMu  sync.Mutex
	nextStart   time.Time
	searchSlots chan struct{}
	detailSlots chan struct{}
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

type advertResponse struct {
	Data struct {
		Advert detailAdvert `json:"advert"`
	} `json:"data"`
	Errors []struct {
		Message string `json:"message"`
	} `json:"errors"`
}

type detailAdvert struct {
	ID    string `json:"id"`
	Title string `json:"title"`
	State string `json:"state"`
	Owner struct {
		Login string `json:"login"`
	} `json:"owner"`
	SubCategory struct {
		URL   string      `json:"url"`
		Title choiceValue `json:"title"`
	} `json:"subCategory"`
	Groups []detailGroup `json:"groups"`
}

type detailGroup struct {
	Title    string          `json:"title"`
	Controls []detailControl `json:"controls"`
}

type detailControl struct {
	Title   string `json:"title"`
	Feature struct {
		Type  string `json:"type"`
		Value any    `json:"value"`
	} `json:"feature"`
}

type advert struct {
	ID    string `json:"id"`
	Title string `json:"title"`
	Price struct {
		Value json.RawMessage `json:"value"`
	} `json:"price"`
	OfferType rawFeature `json:"offerType"`
	Images    struct {
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
	Transmission     choiceFeature `json:"transmission"`
	BodyType         rawFeature    `json:"bodyType"`
	Mileage          rawFeature    `json:"mileage"`
	Power            rawFeature    `json:"power"`
	Drivetrain       rawFeature    `json:"drivetrain"`
	Fuel             choiceFeature `json:"fuel"`
	Registration     choiceFeature `json:"registration"`
	OriginCountry    choiceFeature `json:"originCountry"`
	VIN              rawFeature    `json:"vinCode"`
	Body             rawFeature    `json:"body"`
	PhoneModel       choiceFeature `json:"phoneModel"`
	ConsoleBrand     rawFeature    `json:"consoleBrand"`
	ConsoleModel     choiceFeature `json:"consoleModel"`
	PhoneStorage     choiceFeature `json:"phoneStorage"`
	ConsoleStorage   choiceFeature `json:"consoleStorage"`
	PhoneBrand       rawFeature    `json:"phoneBrand"`
	PhoneRAM         rawFeature    `json:"phoneRAM"`
	PhoneOS          rawFeature    `json:"phoneOS"`
	LaptopBrand      rawFeature    `json:"laptopBrand"`
	LaptopCPU        rawFeature    `json:"laptopCPU"`
	LaptopCPUModel   rawFeature    `json:"laptopCPUModel"`
	LaptopRAM        rawFeature    `json:"laptopRAM"`
	LaptopStorage    rawFeature    `json:"laptopStorage"`
	LaptopGPU        rawFeature    `json:"laptopGPU"`
	LaptopGPUModel   rawFeature    `json:"laptopGPUModel"`
	LaptopOS         rawFeature    `json:"laptopOS"`
	Screen           rawFeature    `json:"screen"`
	LaptopResolution rawFeature    `json:"laptopResolution"`
	TVBrand          rawFeature    `json:"tvBrand"`
	TVResolution     rawFeature    `json:"tvResolution"`
	TVPlatform       rawFeature    `json:"tvPlatform"`
	Rooms            rawFeature    `json:"rooms"`
	Area             rawFeature    `json:"area"`
	Sector           rawFeature    `json:"sector"`
	HousingStock     rawFeature    `json:"housingStock"`
	ListingAuthor    rawFeature    `json:"listingAuthor"`
	Floor            rawFeature    `json:"floor"`
	PropertyState    rawFeature    `json:"propertyState"`
	BuildingType     rawFeature    `json:"buildingType"`
	Condition        choiceFeature `json:"condition"`
	SubCategory      struct {
		URL   string      `json:"url"`
		Title choiceValue `json:"title"`
	} `json:"subCategory"`
	Booster struct {
		Enable bool `json:"enable"`
	} `json:"booster"`
}

type choiceValue struct {
	Translated string `json:"translated"`
}

type choiceFeature struct {
	Value choiceValue `json:"value"`
}

type rawFeature struct {
	Value json.RawMessage `json:"value"`
}

type priceValue struct {
	Bargain bool   `json:"bargain"`
	Unit    string `json:"unit"`
	Value   int    `json:"value"`
}

type SearchOptions struct {
	ExtractVINFromDescription bool
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
	if options.MaxSearches < 1 {
		options.MaxSearches = 2
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
	connections := options.Concurrency * options.MaxSearches
	transport.MaxIdleConns = connections * 2
	transport.MaxIdleConnsPerHost = connections
	transport.MaxConnsPerHost = connections
	transport.IdleConnTimeout = 90 * time.Second

	return &Scraper{
		baseURL:     strings.TrimRight(baseURL, "/"),
		options:     options,
		searchSlots: make(chan struct{}, options.MaxSearches),
		detailSlots: make(chan struct{}, min(options.Concurrency, 2)),
		client: &http.Client{
			Timeout:   options.RequestTimeout,
			Transport: transport,
		},
	}
}

func (s *Scraper) Search(ctx context.Context, query string) ([]model.Product, error) {
	return s.SearchStream(ctx, query, nil)
}

// SearchLatest fetches only the first result page. Search alerts use it to
// detect newly surfaced listings without repeating a complete search scrape.
func (s *Scraper) SearchLatest(ctx context.Context, query string, options SearchOptions) ([]model.Product, error) {
	select {
	case s.searchSlots <- struct{}{}:
		defer func() { <-s.searchSlots }()
	case <-ctx.Done():
		return nil, ctx.Err()
	}
	products, _, err := s.pageWithRetry(ctx, strings.TrimSpace(query), 0, pageSize, options)
	return products, err
}

func (s *Scraper) SearchStreamWithOptions(ctx context.Context, query string, options SearchOptions, yield func(Batch) error) ([]model.Product, error) {
	return s.searchStream(ctx, query, options, yield)
}

// ListingSummary reads the public detail page data and returns only useful,
// labelled values. It shares the scraper's concurrency and request pacing.
func (s *Scraper) ListingSummary(ctx context.Context, id string) (model.ListingSummary, error) {
	select {
	case s.detailSlots <- struct{}{}:
		defer func() { <-s.detailSlots }()
	case <-ctx.Done():
		return model.ListingSummary{}, ctx.Err()
	}

	var lastErr error
	for attempt := 0; attempt <= s.options.MaxRetries; attempt++ {
		if err := s.waitForSlot(ctx); err != nil {
			return model.ListingSummary{}, err
		}
		summary, retryAfter, err := s.detail(ctx, id)
		if err == nil {
			return summary, nil
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
			return model.ListingSummary{}, err
		}
	}
	return model.ListingSummary{}, lastErr
}

// SearchStream fetches the first page to discover the result size, then fetches
// remaining pages with bounded concurrency. Request starts are globally spaced
// across all searches handled by this Scraper instance.
func (s *Scraper) SearchStream(ctx context.Context, query string, yield func(Batch) error) ([]model.Product, error) {
	return s.searchStream(ctx, query, SearchOptions{}, yield)
}

func (s *Scraper) searchStream(ctx context.Context, query string, options SearchOptions, yield func(Batch) error) ([]model.Product, error) {
	select {
	case s.searchSlots <- struct{}{}:
		defer func() { <-s.searchSlots }()
	case <-ctx.Done():
		return nil, ctx.Err()
	}
	query = strings.TrimSpace(query)
	first, count, err := s.pageWithRetry(ctx, query, 0, pageSize, options)
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
	workers := min(s.options.Concurrency, totalPages-1)
	jobs := make(chan int, totalPages-1)
	// Let a slow stream consumer push back on page workers instead of buffering
	// every completed page in memory.
	results := make(chan pageResult, workers)
	var wg sync.WaitGroup
	for worker := 0; worker < workers; worker++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for page := range jobs {
				items, _, err := s.pageWithRetry(workCtx, query, page*pageSize, pageSize, options)
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

func (s *Scraper) pageWithRetry(ctx context.Context, query string, skip, limit int, options SearchOptions) ([]model.Product, int, error) {
	var lastErr error
	for attempt := 0; attempt <= s.options.MaxRetries; attempt++ {
		if err := s.waitForSlot(ctx); err != nil {
			return nil, 0, err
		}
		products, count, retryAfter, err := s.page(ctx, query, skip, limit, options)
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

func (s *Scraper) page(ctx context.Context, query string, skip, limit int, options SearchOptions) ([]model.Product, int, time.Duration, error) {
	payload, err := json.Marshal(graphQLRequest{
		OperationName: "SearchAds",
		Variables: map[string]any{
			"input": map[string]any{
				"query": query, "pagination": map[string]int{"limit": limit, "skip": skip},
			},
			"includeDescriptionVIN": options.ExtractVINFromDescription,
		},
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

func (s *Scraper) detail(ctx context.Context, id string) (model.ListingSummary, time.Duration, error) {
	payload, err := json.Marshal(graphQLRequest{
		OperationName: "Advert",
		Variables:     map[string]any{"input": map[string]string{"id": id}},
		Query:         advertQuery,
	})
	if err != nil {
		return model.ListingSummary{}, 0, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.baseURL+"/graphql", bytes.NewReader(payload))
	if err != nil {
		return model.ListingSummary{}, 0, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Lang", "ro")
	req.Header.Set("Source", "desktop")
	req.Header.Set("User-Agent", "999scraper/3.0 (+local search client)")
	res, err := s.client.Do(req)
	if err != nil {
		if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
			return model.ListingSummary{}, 0, err
		}
		return model.ListingSummary{}, 0, retryableError{fmt.Errorf("fetch listing details: %w", err)}
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		_, _ = io.Copy(io.Discard, io.LimitReader(res.Body, 64<<10))
		err := fmt.Errorf("listing service returned %s", res.Status)
		if retryableStatus(res.StatusCode) {
			return model.ListingSummary{}, parseRetryAfter(res.Header.Get("Retry-After")), retryableError{err}
		}
		return model.ListingSummary{}, 0, err
	}
	var response advertResponse
	if err := json.NewDecoder(io.LimitReader(res.Body, maxResponseSize)).Decode(&response); err != nil {
		return model.ListingSummary{}, 0, retryableError{fmt.Errorf("decode listing details: %w", err)}
	}
	if len(response.Errors) > 0 {
		return model.ListingSummary{}, 0, fmt.Errorf("listing service: %s", response.Errors[0].Message)
	}
	if response.Data.Advert.ID == "" {
		return model.ListingSummary{}, 0, fmt.Errorf("listing was not found")
	}
	return s.summary(response.Data.Advert), 0, nil
}

func (s *Scraper) summary(ad detailAdvert) model.ListingSummary {
	summary := model.ListingSummary{
		Source:      "999.md",
		RetrievedAt: time.Now().UTC(),
		Listing: model.ListingSummaryListing{
			ID:       ad.ID,
			URL:      s.baseURL + "/ro/" + ad.ID,
			Title:    strings.TrimSpace(ad.Title),
			Status:   strings.TrimPrefix(ad.State, "AD_STATE_"),
			Category: strings.TrimSpace(ad.SubCategory.Title.Translated),
			Seller:   strings.TrimSpace(ad.Owner.Login),
		},
		Details: make(map[string]map[string]any),
	}
	for _, group := range ad.Groups {
		fields := make(map[string]any)
		for _, control := range group.Controls {
			title := strings.TrimSpace(control.Title)
			value := summaryValue(control.Feature.Value)
			if title == "" || value == nil || value == false {
				continue
			}
			switch control.Feature.Type {
			case "FEATURE_BODY":
				if text, ok := value.(string); ok {
					summary.Description = text
				}
			case "FEATURE_IMAGES":
				summary.Images = imageURLs(value)
			case "FEATURE_CONTACTS":
				if contacts, ok := value.(map[string]any); ok {
					summary.Contacts = contacts
				}
			default:
				fields[title] = value
			}
		}
		if len(fields) > 0 {
			summary.Details[strings.TrimSpace(group.Title)] = fields
		}
	}
	if len(summary.Details) == 0 {
		summary.Details = nil
	}
	return summary
}

func summaryValue(value any) any {
	switch typed := value.(type) {
	case nil:
		return nil
	case string:
		if text := strings.TrimSpace(typed); text != "" {
			return text
		}
		return nil
	case map[string]any:
		if translated, ok := typed["translated"].(string); ok && strings.TrimSpace(translated) != "" {
			return strings.TrimSpace(translated)
		}
		result := make(map[string]any, len(typed))
		for key, item := range typed {
			if key == "abbreviations" || key == "translated" {
				continue
			}
			if cleaned := summaryValue(item); cleaned != nil {
				result[key] = cleaned
			}
		}
		if len(result) == 0 {
			return nil
		}
		return result
	case []any:
		result := make([]any, 0, len(typed))
		for _, item := range typed {
			if cleaned := summaryValue(item); cleaned != nil {
				result = append(result, cleaned)
			}
		}
		if len(result) == 0 {
			return nil
		}
		return result
	default:
		return typed
	}
}

func imageURLs(value any) []string {
	items, ok := value.([]any)
	if !ok {
		return nil
	}
	images := make([]string, 0, len(items))
	for _, item := range items {
		name, ok := item.(string)
		if name = strings.TrimSpace(name); !ok || name == "" {
			continue
		}
		images = append(images, "https://i.simpalsmedia.com/999.md/BoardImages/900x900/"+name)
	}
	return images
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
	description := featureText(ad.Body.Value)
	descriptionStats := analyzeDescription(description)
	price, currency, label := parsePrice(ad.Price.Value)
	image := ""
	if len(ad.Images.Value) > 0 {
		image = "https://i.simpalsmedia.com/999.md/BoardImages/320x240/" + ad.Images.Value[0]
	}
	deviceModel := ad.PhoneModel.Value.Translated
	if deviceModel == "" {
		deviceModel = ad.ConsoleModel.Value.Translated
	}
	storage := ad.PhoneStorage.Value.Translated
	if storage == "" {
		storage = ad.ConsoleStorage.Value.Translated
	}
	if storage == "" {
		storage = featureText(ad.LaptopStorage.Value)
	}
	brand := firstText(
		featureText(ad.PhoneBrand.Value),
		featureText(ad.ConsoleBrand.Value),
		featureText(ad.LaptopBrand.Value),
		featureText(ad.TVBrand.Value),
	)
	processor := strings.TrimSpace(strings.Join(nonEmpty(featureText(ad.LaptopCPU.Value), featureText(ad.LaptopCPUModel.Value)), " "))
	gpu := strings.TrimSpace(strings.Join(nonEmpty(featureText(ad.LaptopGPU.Value), featureText(ad.LaptopGPUModel.Value)), " "))
	resolution := firstText(featureText(ad.LaptopResolution.Value), featureText(ad.TVResolution.Value))
	os := firstText(featureText(ad.PhoneOS.Value), featureText(ad.LaptopOS.Value), featureText(ad.TVPlatform.Value))
	return model.Product{
		ID:                          ad.ID,
		Title:                       strings.TrimSpace(ad.Title),
		ThumbnailURL:                image,
		Price:                       price,
		PriceString:                 label,
		OfferType:                   featureText(ad.OfferType.Value),
		Currency:                    currency,
		IsBoosted:                   ad.Booster.Enable,
		Year:                        ad.Year.Value,
		Make:                        strings.TrimSpace(ad.Make.Value.Translated),
		Model:                       strings.TrimSpace(ad.Model.Value.Translated),
		Fuel:                        strings.TrimSpace(ad.Fuel.Value.Translated),
		Transmission:                strings.TrimSpace(ad.Transmission.Value.Translated),
		BodyType:                    featureText(ad.BodyType.Value),
		Mileage:                     featureInt(ad.Mileage.Value),
		Power:                       featureInt(ad.Power.Value),
		Drivetrain:                  featureText(ad.Drivetrain.Value),
		Registration:                strings.TrimSpace(ad.Registration.Value.Translated),
		OriginCountry:               strings.TrimSpace(ad.OriginCountry.Value.Translated),
		VIN:                         firstText(normalizeVIN(featureText(ad.VIN.Value)), vinFromDescription(description)),
		ImageCount:                  len(ad.Images.Value),
		DescriptionWordCount:        descriptionStats.WordCount,
		DescriptionUsefulWordCount:  descriptionStats.UsefulWordCount,
		DescriptionMarketingPercent: descriptionStats.MarketingPercent,
		VehicleFlags:                vehicleFlags(description),
		DeviceModel:                 strings.TrimSpace(deviceModel),
		Storage:                     strings.TrimSpace(storage),
		Brand:                       brand,
		RAM:                         firstText(featureText(ad.PhoneRAM.Value), featureText(ad.LaptopRAM.Value)),
		Processor:                   processor,
		GPU:                         gpu,
		Screen:                      featureText(ad.Screen.Value),
		Resolution:                  resolution,
		OS:                          os,
		Rooms:                       featureText(ad.Rooms.Value),
		Area:                        featureText(ad.Area.Value),
		Sector:                      featureText(ad.Sector.Value),
		HousingStock:                featureText(ad.HousingStock.Value),
		ListingAuthor:               featureText(ad.ListingAuthor.Value),
		Floor:                       featureText(ad.Floor.Value),
		PropertyState:               featureText(ad.PropertyState.Value),
		BuildingType:                featureText(ad.BuildingType.Value),
		Category:                    strings.TrimSpace(ad.SubCategory.Title.Translated),
		Condition:                   strings.TrimSpace(ad.Condition.Value.Translated),
		URLToProduct:                s.baseURL + "/ro/" + ad.ID,
	}
}

func normalizeVIN(value string) string {
	vin := strings.ToUpper(strings.TrimSpace(value))
	if len(vin) != 17 {
		return ""
	}
	for _, character := range vin {
		if (character < '0' || character > '9') && (character < 'A' || character > 'Z') {
			return ""
		}
		if character == 'I' || character == 'O' || character == 'Q' {
			return ""
		}
	}
	return vin
}

var (
	descriptionVINPattern = regexp.MustCompile(`(?i)\bVIN(?:[[:space:]-]*(?:CODE|COD|КОД))?[[:space:]:#-]{0,12}([A-HJ-NPR-Z0-9]{17})\b`)
	riskTextReplacer      = strings.NewReplacer(
		"ă", "a", "â", "a", "î", "i", "ș", "s", "ş", "s", "ț", "t", "ţ", "t",
	)
)

func vinFromDescription(description string) string {
	match := descriptionVINPattern.FindStringSubmatch(description)
	if len(match) != 2 {
		return ""
	}
	return normalizeVIN(match[1])
}

type descriptionAnalysis struct {
	WordCount        int
	UsefulWordCount  int
	MarketingPercent int
}

var marketingDescriptionMarkers = []string{
	"fara prima rata", "prima rata", "in credit", "creditare", "leasing", "aprobare", "doar cu buletin",
	"fidejusor", "persoana garant", "lucreaza peste hotare", "istorie credit", "program de lucru",
	"program -", "mai multe automobile", "vanzari auto", "transport gratuit", "www", "http", "/profile/",
	"кредит", "лизинг", "одобрен", "паспорт", "поручител", "кредитн", "рабочий график", "бесплатн транспорт",
}

func analyzeDescription(description string) descriptionAnalysis {
	totalWords := len(strings.Fields(description))
	if totalWords == 0 {
		return descriptionAnalysis{}
	}
	noiseWords := 0
	seen := make(map[string]struct{})
	segments := strings.FieldsFunc(description, func(r rune) bool {
		switch r {
		case '\n', '\r', '.', '!', '?', ';':
			return true
		default:
			return false
		}
	})
	for _, segment := range segments {
		folded := foldRiskText(segment)
		words := len(strings.Fields(segment))
		if words == 0 {
			continue
		}
		_, repeated := seen[folded]
		if repeated || containsAny(folded, marketingDescriptionMarkers...) {
			noiseWords += words
		}
		seen[folded] = struct{}{}
	}
	usefulWords := max(0, totalWords-noiseWords)
	return descriptionAnalysis{
		WordCount:        totalWords,
		UsefulWordCount:  usefulWords,
		MarketingPercent: noiseWords * 100 / totalWords,
	}
}

func vehicleFlags(description string) []string {
	text := foldRiskText(description)
	flags := make([]string, 0, 3)
	if containsAny(text,
		"dupa accident", "dupa tamponare", "дтп", "после авар",
		"cu daune", "accidentata", "accidentate", "avariata", "поврежден",
	) {
		flags = append(flags, "accidentDamage")
	}
	if containsAny(text,
		"motor defect", "defect motor", "nu porneste", "necesita reparatie", "necesita investitii",
		"под замен", "не завод", "не на ходу", "needs repair", "engine damage",
	) && !containsAny(text, "nu necesita reparatie", "nu necesita investitii") {
		flags = append(flags, "mechanicalIssue")
	}
	if containsAny(text,
		"fara acte", "acte expir", "numere straine", "doar cu iesire", "procura nu fac",
		"probleme juridice", "без документ", "иностранные номера", "только на выезд",
	) {
		flags = append(flags, "documentRisk")
	}
	return flags
}

func foldRiskText(value string) string {
	value = strings.ToLower(value)
	return strings.Join(strings.Fields(riskTextReplacer.Replace(value)), " ")
}

func containsAny(value string, needles ...string) bool {
	for _, needle := range needles {
		if strings.Contains(value, needle) {
			return true
		}
	}
	return false
}

func featureText(raw json.RawMessage) string {
	if len(raw) == 0 || string(raw) == "null" {
		return ""
	}
	var value any
	if json.Unmarshal(raw, &value) != nil {
		return ""
	}
	return strings.TrimSpace(textValue(value))
}

func featureInt(raw json.RawMessage) int {
	value, _ := strconv.Atoi(featureText(raw))
	return value
}

func textValue(value any) string {
	switch typed := value.(type) {
	case string:
		return typed
	case float64:
		return strconv.FormatFloat(typed, 'f', -1, 64)
	case map[string]any:
		for _, key := range []string{"translated", "value", "label", "name"} {
			if text := textValue(typed[key]); text != "" {
				return text
			}
		}
	}
	return ""
}

func firstText(values ...string) string {
	for _, value := range values {
		if value = strings.TrimSpace(value); value != "" {
			return value
		}
	}
	return ""
}

func nonEmpty(values ...string) []string {
	result := make([]string, 0, len(values))
	for _, value := range values {
		if value = strings.TrimSpace(value); value != "" {
			result = append(result, value)
		}
	}
	return result
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
