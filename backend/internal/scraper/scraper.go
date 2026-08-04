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

const searchQuery = `query SearchAds($input: Ads_SearchInput!) {
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
      phoneModel: feature(id: 590) { value }
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
	PhoneModel       choiceFeature `json:"phoneModel"`
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
	select {
	case s.searchSlots <- struct{}{}:
		defer func() { <-s.searchSlots }()
	case <-ctx.Done():
		return nil, ctx.Err()
	}
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
	brand := firstText(featureText(ad.PhoneBrand.Value), featureText(ad.LaptopBrand.Value), featureText(ad.TVBrand.Value))
	processor := strings.TrimSpace(strings.Join(nonEmpty(featureText(ad.LaptopCPU.Value), featureText(ad.LaptopCPUModel.Value)), " "))
	gpu := strings.TrimSpace(strings.Join(nonEmpty(featureText(ad.LaptopGPU.Value), featureText(ad.LaptopGPUModel.Value)), " "))
	resolution := firstText(featureText(ad.LaptopResolution.Value), featureText(ad.TVResolution.Value))
	os := firstText(featureText(ad.PhoneOS.Value), featureText(ad.LaptopOS.Value), featureText(ad.TVPlatform.Value))
	return model.Product{
		ID:            ad.ID,
		Title:         strings.TrimSpace(ad.Title),
		ThumbnailURL:  image,
		Price:         price,
		PriceString:   label,
		OfferType:     featureText(ad.OfferType.Value),
		Currency:      currency,
		IsBoosted:     ad.Booster.Enable,
		Year:          ad.Year.Value,
		Make:          strings.TrimSpace(ad.Make.Value.Translated),
		Model:         strings.TrimSpace(ad.Model.Value.Translated),
		Fuel:          strings.TrimSpace(ad.Fuel.Value.Translated),
		Transmission:  strings.TrimSpace(ad.Transmission.Value.Translated),
		BodyType:      featureText(ad.BodyType.Value),
		Mileage:       featureInt(ad.Mileage.Value),
		Power:         featureInt(ad.Power.Value),
		Drivetrain:    featureText(ad.Drivetrain.Value),
		Registration:  strings.TrimSpace(ad.Registration.Value.Translated),
		OriginCountry: strings.TrimSpace(ad.OriginCountry.Value.Translated),
		DeviceModel:   strings.TrimSpace(deviceModel),
		Storage:       strings.TrimSpace(storage),
		Brand:         brand,
		RAM:           firstText(featureText(ad.PhoneRAM.Value), featureText(ad.LaptopRAM.Value)),
		Processor:     processor,
		GPU:           gpu,
		Screen:        featureText(ad.Screen.Value),
		Resolution:    resolution,
		OS:            os,
		Rooms:         featureText(ad.Rooms.Value),
		Area:          featureText(ad.Area.Value),
		Sector:        featureText(ad.Sector.Value),
		HousingStock:  featureText(ad.HousingStock.Value),
		ListingAuthor: featureText(ad.ListingAuthor.Value),
		Floor:         featureText(ad.Floor.Value),
		PropertyState: featureText(ad.PropertyState.Value),
		BuildingType:  featureText(ad.BuildingType.Value),
		Category:      strings.TrimSpace(ad.SubCategory.Title.Translated),
		Condition:     strings.TrimSpace(ad.Condition.Value.Translated),
		URLToProduct:  s.baseURL + "/ro/" + ad.ID,
	}
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
