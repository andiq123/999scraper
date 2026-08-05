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
)

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

func TestConcurrentSearchesAreBounded(t *testing.T) {
	var active atomic.Int32
	var peak atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		current := active.Add(1)
		defer active.Add(-1)
		for current > peak.Load() && !peak.CompareAndSwap(peak.Load(), current) {
		}
		time.Sleep(20 * time.Millisecond)
		_, _ = w.Write([]byte(`{"data":{"searchAds":{"ads":[],"count":0}}}`))
	}))
	defer server.Close()

	s := New(server.URL, Options{MaxPages: 1, Concurrency: 1, MaxSearches: 1, MinInterval: time.Millisecond, RequestTimeout: time.Second})
	var wg sync.WaitGroup
	for index := range 3 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := s.Search(context.Background(), fmt.Sprintf("query-%d", index)); err != nil {
				t.Errorf("search failed: %v", err)
			}
		}()
	}
	wg.Wait()
	if peak.Load() != 1 {
		t.Fatalf("expected one concurrent search, peak was %d", peak.Load())
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
	ad.BodyType.Value = json.RawMessage(`{"translated":"Crossover"}`)
	ad.Mileage.Value = json.RawMessage(`{"unit":"UNIT_KILOMETER","value":75000}`)
	ad.Power.Value = json.RawMessage(`{"unit":"UNIT_HORSEPOWER","value":174}`)
	ad.Drivetrain.Value = json.RawMessage(`{"translated":"4x4"}`)
	ad.Registration.Value.Translated = "Republica Moldova"
	ad.OriginCountry.Value.Translated = "Japonia"
	ad.Condition.Value.Translated = "Cu rulaj"
	ad.OfferType.Value = json.RawMessage(`{"translated":"Vând","value":1}`)
	product := New("https://999.md", Options{}).product(ad)
	if product.Year != 2010 || product.Fuel != "Benzină" || product.Transmission != "Automată" || product.BodyType != "Crossover" || product.Mileage != 75000 || product.Power != 174 || product.Drivetrain != "4x4" || product.Registration != "Republica Moldova" || product.OriginCountry != "Japonia" || product.Condition != "Cu rulaj" || product.OfferType != "Vând" {
		t.Fatalf("smart facets were not preserved: %#v", product)
	}
}

func TestListingSummaryNormalizesPublicDetails(t *testing.T) {
	ad := detailAdvert{ID: "104789746", Title: " Tesla Model 3 ", State: "AD_STATE_PUBLIC"}
	ad.Owner.Login = "seller"
	ad.SubCategory.Title.Translated = "Autoturisme"
	general := detailGroup{Title: "General", Controls: make([]detailControl, 3)}
	general.Controls[0].Title = "Țara de origine"
	general.Controls[0].Feature.Type = "FEATURE_OPTIONS"
	general.Controls[0].Feature.Value = map[string]any{"translated": "SUA", "value": float64(29678)}
	general.Controls[1].Title = "Textul anunțului"
	general.Controls[1].Feature.Type = "FEATURE_BODY"
	general.Controls[1].Feature.Value = map[string]any{"translated": "Clean description"}
	general.Controls[2].Title = "Absent feature"
	general.Controls[2].Feature.Type = "FEATURE_BOOLEAN"
	general.Controls[2].Feature.Value = false
	media := detailGroup{Title: "Media", Controls: make([]detailControl, 1)}
	media.Controls[0].Title = "Fotografii"
	media.Controls[0].Feature.Type = "FEATURE_IMAGES"
	media.Controls[0].Feature.Value = []any{"image.jpg"}
	ad.Groups = []detailGroup{general, media}

	summary := New("https://999.md", Options{}).summary(ad)
	if summary.Listing.Title != "Tesla Model 3" || summary.Listing.Status != "PUBLIC" || summary.Description != "Clean description" {
		t.Fatalf("unexpected listing summary: %#v", summary)
	}
	if summary.Details["General"]["Țara de origine"] != "SUA" {
		t.Fatalf("translated option was not normalized: %#v", summary.Details)
	}
	if _, exists := summary.Details["General"]["Absent feature"]; exists {
		t.Fatal("unchecked boolean should be omitted")
	}
	if len(summary.Images) != 1 || summary.Images[0] != "https://i.simpalsmedia.com/999.md/BoardImages/900x900/image.jpg" {
		t.Fatalf("unexpected image URL: %#v", summary.Images)
	}
}
