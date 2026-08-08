package httpapi

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestNormalizeVIN(t *testing.T) {
	for _, input := range []string{"7SAYGDEF3NF464219", " 7saygdef3nf464219 "} {
		if got := normalizeVIN(input); got != "7SAYGDEF3NF464219" {
			t.Fatalf("normalizeVIN(%q) = %q", input, got)
		}
	}
	for _, input := range []string{"", "7SAYGDEF3NF46421", "7SAYGDEF3NF4642190", "7SAYGDEI3NF464219", "7SAYGDEO3NF464219", "7SAYGDEQ3NF464219", "7SAYGDEF3NF46421-"} {
		if got := normalizeVIN(input); got != "" {
			t.Fatalf("normalizeVIN(%q) accepted invalid VIN %q", input, got)
		}
	}
}

func TestExactVINEvidenceAcceptsDetailPagesOnly(t *testing.T) {
	const vin = "5YJ3E1EB6NF278375"
	result := googleSearchResult{
		Title:   "2022 Tesla MODEL 3 | 5YJ3E1EB6NF278375 | Bid History",
		Link:    "https://bid.cars/en/lot/1-55374626/2022-Tesla-MODEL-3-5YJ3E1EB6NF278375",
		Snippet: "Final bid $9,800. Primary damage: rear. Odometer 64,189 mi.",
	}
	evidence, ok := exactVINEvidence(vin, result)
	if !ok {
		t.Fatal("rejected an exact-VIN auction detail page")
	}
	if evidence.Source != "Bid.Cars" || evidence.URL != result.Link || len(evidence.Facts) == 0 || evidence.Facts[0].Value != "1-55374626" {
		t.Fatalf("unexpected evidence: %#v", evidence)
	}

	for name, changed := range map[string]googleSearchResult{
		"generic search": {Title: result.Title, Link: "https://bid.cars/en/search/results?query=" + vin, Snippet: result.Snippet},
		"wrong VIN":      {Title: "2022 Tesla", Link: "https://bid.cars/en/lot/1-55374626/2022-Tesla", Snippet: "Auction result"},
		"unknown host":   {Title: result.Title, Link: "https://example.com/lot/123/" + vin, Snippet: result.Snippet},
		"insecure":       {Title: result.Title, Link: "http://bid.cars/en/lot/123/" + vin, Snippet: result.Snippet},
	} {
		t.Run(name, func(t *testing.T) {
			if _, accepted := exactVINEvidence(vin, changed); accepted {
				t.Fatal("accepted a non-evidence result")
			}
		})
	}

	archive, ok := exactVINEvidence(vin, googleSearchResult{
		Title:   "2022 Tesla Model 3 — VIN " + vin,
		Link:    "https://stat.vin/cars/" + strings.ToLower(vin),
		Snippet: "Copart lot 55374626, rear-end damage, 64,189 miles.",
	})
	if !ok || archive.Source != "Stat.vin" {
		t.Fatalf("rejected an exact-VIN archive detail page: %#v", archive)
	}
	if _, ok := exactVINEvidence(vin, googleSearchResult{
		Title: "Tesla Model 3 auction history", Link: "https://stat.vin/vehicles/tesla/model-3", Snippet: vin,
	}); ok {
		t.Fatal("accepted a category page that merely mentioned the VIN")
	}
}

func TestVINSearcherUsesExactTermsAndFiltersResults(t *testing.T) {
	const vin = "5YJ3E1EB6NF278375"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("key") != "test-key" || r.URL.Query().Get("cx") != "test-engine" || r.URL.Query().Get("exactTerms") != vin {
			t.Fatalf("unexpected Google query: %s", r.URL.RawQuery)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"items":[
			{"title":"2022 Tesla MODEL 3 | 5YJ3E1EB6NF278375 | Bid History","link":"https://bid.cars/en/lot/1-55374626/2022-Tesla-MODEL-3-5YJ3E1EB6NF278375","snippet":"Final bid $9,800"},
			{"title":"Search cars","link":"https://bid.cars/en/search/results","snippet":"5YJ3E1EB6NF278375"},
			{"title":"Random result 5YJ3E1EB6NF278375","link":"https://spam.example/lot/123","snippet":"Unknown"}
		]}`))
	}))
	defer server.Close()

	searcher := newVINSearcher("test-key", "test-engine")
	searcher.endpoint = server.URL
	items, err := searcher.search(context.Background(), vin)
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 || !strings.Contains(items[0].URL, vin) {
		t.Fatalf("expected one verified result, got %#v", items)
	}
}

func TestVINSearcherRequiresBothGoogleCredentials(t *testing.T) {
	for _, credentials := range [][2]string{{}, {"key", ""}, {"", "engine"}} {
		_, err := newVINSearcher(credentials[0], credentials[1]).search(context.Background(), "5YJ3E1EB6NF278375")
		if err == nil || !strings.Contains(err.Error(), "not configured") {
			t.Fatalf("expected configuration error, got %v", err)
		}
	}
}
