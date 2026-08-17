package searchfilter

import (
	"encoding/base64"
	"encoding/json"
	"testing"

	"github.com/andi/999scraper/internal/model"
)

func TestApplyReplaysSavedFiltersAndCleanup(t *testing.T) {
	fields := make([]any, 46)
	fields[0] = 4
	fields[1] = "relevance"
	fields[2] = true
	fields[3] = false
	fields[4] = false
	for _, index := range []int{5, 6, 12, 13, 26, 27, 28, 29, 30, 37, 38, 39, 40, 41, 42, 43} {
		fields[index] = []string{}
	}
	fields[7], fields[8] = 2021, 2025
	fields[9], fields[10], fields[11] = 14_000, 18_000, 1
	fields[44], fields[45] = false, 0
	payload, err := json.Marshal(fields)
	if err != nil {
		t.Fatal(err)
	}
	encoded := base64.RawURLEncoding.EncodeToString(payload)
	price := func(value int) *int { return &value }
	products := []model.Product{
		{ID: "good", Title: "Tesla Model Y", Price: price(17_000), Currency: 1, Year: 2022, Make: "Tesla", Model: "Model Y"},
		{ID: "expensive", Title: "Tesla Model Y", Price: price(24_000), Currency: 1, Year: 2022, Make: "Tesla", Model: "Model Y"},
		{ID: "battery", Title: "Tesla reparație baterie", Price: price(1_600), Currency: 0},
		{ID: "key", Title: "Telecomanda cheie Tesla Key Fob pentru Model 3 Y", Price: price(4_000), Currency: 0},
	}
	got, err := Apply("tesla model y", encoded, products, map[string]float64{"MDL": 1, "EUR": 19.5, "USD": 17.8})
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0].ID != "good" {
		t.Fatalf("unexpected filtered snapshot: %#v", got)
	}
}
