package scraper

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/andi/999scraper/internal/model"
)

func TestFilter(t *testing.T) {
	cheap, expensive := 100, 200
	products := []model.Product{{Title: "phone case", Price: &cheap}, {Title: "boosted phone", Price: &expensive, IsBoosted: true}, {Title: "other", Price: nil}}
	got := Filter(products, model.Filters{ProductSearchCriteria: "phone", ExcludeOtherAds: true, ExcludeBoosted: true})
	if len(got) != 1 || got[0].Title != "phone case" {
		t.Fatalf("unexpected result: %#v", got)
	}
}

func TestFilterUsesWordBoundariesAndVehicleMetadata(t *testing.T) {
	price := 100
	products := []model.Product{
		{Title: "Honda Civic", Price: &price, Year: 2018},
		{Title: "Honda Civic covorașe", Price: &price},
		{Title: "Honda Civic Pro", Price: &price, Year: 2022},
	}
	got := Filter(products, model.Filters{
		ProductSearchCriteria: "Civic Honda",
		ExcludeOtherAds:       true,
		Intent:                "car",
		YearFrom:              2015,
		YearTo:                2020,
		KeysToExclude:         []string{"pro"},
	})
	if len(got) != 1 || got[0].Year != 2018 {
		t.Fatalf("expected the matching vehicle only, got %#v", got)
	}

	got = Filter([]model.Product{{Title: "Professional phone", Price: &price}}, model.Filters{
		ProductSearchCriteria: "phone", ExcludeOtherAds: true, KeysToExclude: []string{"pro"},
	})
	if len(got) != 1 {
		t.Fatalf("short exclusions must not match inside another word")
	}
}

func TestFilterIgnoresGenericIntentWords(t *testing.T) {
	price := 12_000
	products := []model.Product{
		{Title: "Lenovo ThinkPad T14", Price: &price, Processor: "Intel Core i7"},
		{Title: "Dell Latitude laptop", Price: &price, Processor: "Intel Core i5"},
	}
	got := Filter(products, model.Filters{ProductSearchCriteria: "lenovo laptop", Intent: "laptop", ExcludeOtherAds: true})
	if len(got) != 1 || got[0].Title != "Lenovo ThinkPad T14" {
		t.Fatalf("generic category words should not reject structured results: %#v", got)
	}
}

func TestSmartCarCleanupRemovesPartsAndImplausiblePrices(t *testing.T) {
	one, carPrice := 1, 12_000
	products := []model.Product{
		{Title: "Tesla Model 3", Price: &carPrice, Currency: 1, Year: 2021, Make: "Tesla", Model: "Model 3"},
		{Title: "Piese Tesla Model 3", Price: &one, Currency: 1, Year: 2025, Make: "Tesla", Model: "Model 3"},
		{Title: "Tesla Model 3", Price: &one, Currency: 1, Year: 2021, Make: "Tesla", Model: "Model 3"},
	}
	got := Filter(products, model.Filters{ProductSearchCriteria: "Tesla Model 3", Intent: "car", SmartCleanup: true, ExcludeOtherAds: true})
	if len(got) != 1 || got[0].Price == nil || *got[0].Price != carPrice {
		t.Fatalf("expected only the plausible car, got %#v", got)
	}
}

func TestPriceAndCurrencyFilters(t *testing.T) {
	cheap, matching, expensive := 100, 500, 900
	eur := 1
	products := []model.Product{
		{Title: "phone", Price: &cheap, Currency: 1},
		{Title: "phone", Price: &matching, Currency: 1},
		{Title: "phone", Price: &expensive, Currency: 2},
	}
	got := Filter(products, model.Filters{ProductSearchCriteria: "phone", PriceMin: 200, PriceMax: 700, Currency: &eur})
	if len(got) != 1 || got[0].Currency != 1 || *got[0].Price != matching {
		t.Fatalf("unexpected filtered prices: %#v", got)
	}
}

func TestSearchStreamsPagesWithBoundedConcurrency(t *testing.T) {
	var active atomic.Int32
	var peak atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		current := active.Add(1)
		defer active.Add(-1)
		for current > peak.Load() && !peak.CompareAndSwap(peak.Load(), current) {
		}
		time.Sleep(30 * time.Millisecond)
		var request graphQLRequest
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			t.Fatal(err)
		}
		input := request.Variables["input"].(map[string]any)
		pagination := input["pagination"].(map[string]any)
		skip := int(pagination["skip"].(float64))
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"data":{"searchAds":{"ads":[{"id":"%d","title":"phone %d","price":{"value":{"unit":"UNIT_MDL","value":100}}}],"count":120}}}`, skip, skip)
	}))
	defer server.Close()

	s := New(server.URL, Options{MaxPages: 3, Concurrency: 2, MinInterval: time.Millisecond, RequestTimeout: time.Second})
	var mu sync.Mutex
	pages := make(map[int]bool)
	products, err := s.SearchStream(context.Background(), "phone", func(batch Batch) error {
		mu.Lock()
		pages[batch.Page] = true
		mu.Unlock()
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(products) != 3 || len(pages) != 3 {
		t.Fatalf("expected three streamed pages, got %d products and pages %v", len(products), pages)
	}
	if peak.Load() != 2 {
		t.Fatalf("expected concurrency to be bounded at 2, peak was %d", peak.Load())
	}
}

func TestSearchRetriesTransientResponse(t *testing.T) {
	var requests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		if requests.Add(1) == 1 {
			w.Header().Set("Retry-After", "0")
			http.Error(w, "slow down", http.StatusTooManyRequests)
			return
		}
		_, _ = w.Write([]byte(`{"data":{"searchAds":{"ads":[{"id":"1","title":"phone"}],"count":1}}}`))
	}))
	defer server.Close()

	s := New(server.URL, Options{MaxPages: 1, Concurrency: 1, MinInterval: time.Millisecond, MaxRetries: 1, RequestTimeout: 2 * time.Second})
	products, err := s.Search(context.Background(), "phone")
	if err != nil {
		t.Fatal(err)
	}
	if requests.Load() != 2 || len(products) != 1 {
		t.Fatalf("expected one retry and one product; requests=%d products=%d", requests.Load(), len(products))
	}
}

func TestSearchStopsBeforeMorePagesWhenConsumerCancels(t *testing.T) {
	var requests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		requests.Add(1)
		_, _ = w.Write([]byte(`{"data":{"searchAds":{"ads":[{"id":"1","title":"phone"}],"count":400}}}`))
	}))
	defer server.Close()

	s := New(server.URL, Options{MaxPages: 10, Concurrency: 3, MinInterval: time.Millisecond, RequestTimeout: time.Second})
	stop := fmt.Errorf("consumer stopped")
	_, err := s.SearchStream(context.Background(), "phone", func(Batch) error { return stop })
	if err != stop {
		t.Fatalf("expected consumer error, got %v", err)
	}
	if requests.Load() != 1 {
		t.Fatalf("expected cancellation before more pages, got %d requests", requests.Load())
	}
}

func TestParseRetryAfter(t *testing.T) {
	if got := parseRetryAfter("3"); got != 3*time.Second {
		t.Fatalf("unexpected retry delay: %s", got)
	}
}

func TestLiveSearch(t *testing.T) {
	if os.Getenv("LIVE_TEST") == "" {
		t.Skip("set LIVE_TEST=1 to call 999.md")
	}
	products, err := New("https://999.md", Options{MaxPages: 1, Concurrency: 1, MinInterval: 100 * time.Millisecond, MaxRetries: 2}).Search(context.Background(), "iphone")
	if err != nil {
		t.Fatal(err)
	}
	if len(products) == 0 || products[0].ID == "" || products[0].URLToProduct == "" {
		t.Fatalf("unexpected live response: %#v", products)
	}
}

func TestLiveSmartCarSearch(t *testing.T) {
	if os.Getenv("LIVE_TEST") == "" {
		t.Skip("set LIVE_TEST=1 to call 999.md")
	}
	s := New("https://999.md", Options{MaxPages: 1, Concurrency: 1, MinInterval: 100 * time.Millisecond, MaxRetries: 2})
	products, err := s.Search(context.Background(), "tesla model 3")
	if err != nil {
		t.Fatal(err)
	}
	clean := Filter(products, model.Filters{ProductSearchCriteria: "tesla model 3", Intent: "car", SmartCleanup: true, ExcludeBoosted: true, ExcludeOtherAds: true})
	if len(clean) == 0 {
		t.Fatal("smart cleanup removed every live car result")
	}
	for _, product := range clean {
		if !isPlausibleCar(product, words(product.Title)) {
			t.Fatalf("smart cleanup retained an implausible result: %#v", product)
		}
	}
}

func TestParsePrice(t *testing.T) {
	price, currency, label := parsePrice(json.RawMessage(`{"unit":"UNIT_MDL","value":12500}`))
	if price == nil || *price != 12500 || currency != 0 || label != "" {
		t.Fatalf("unexpected price: %v %d %q", price, currency, label)
	}
}

func TestProductPreservesSmartFacets(t *testing.T) {
	price := json.RawMessage(`{"unit":"UNIT_EUR","value":12000}`)
	ad := advert{ID: "1", Title: "Toyota Corolla"}
	ad.Price.Value = price
	ad.Year.Value = 2010
	ad.Make.Value.Translated = "Toyota"
	ad.Model.Value.Translated = "Corolla"
	ad.Fuel.Value.Translated = "Benzină"
	ad.Transmission.Value.Translated = "Automată"
	ad.Condition.Value.Translated = "Cu rulaj"
	ad.OfferType.Value = json.RawMessage(`{"translated":"Vând","value":1}`)
	product := New("https://999.md", Options{}).product(ad)
	if product.Year != 2010 || product.Fuel != "Benzină" || product.Transmission != "Automată" || product.Condition != "Cu rulaj" || product.OfferType != "Vând" {
		t.Fatalf("smart facets were not preserved: %#v", product)
	}
}
