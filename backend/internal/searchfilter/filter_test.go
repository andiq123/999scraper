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

func TestApplyKeepsEVChargersOutOfVehicleCleanup(t *testing.T) {
	fields := make([]any, 46)
	fields[0] = 4
	fields[1] = "relevance"
	fields[2] = true
	fields[3], fields[4], fields[44], fields[45] = false, false, false, 0
	for _, index := range []int{5, 6, 12, 13, 26, 27, 28, 29, 30, 37, 38, 39, 40, 41, 42, 43} {
		fields[index] = []string{}
	}
	payload, err := json.Marshal(fields)
	if err != nil {
		t.Fatal(err)
	}
	price := 2_900
	products := []model.Product{
		{ID: "charger", Title: "Încărcător Type 2", Category: "Încărcătoare auto", CategoryURL: "transport/chargers-for-cars", Price: &price},
		{ID: "car", Title: "Tesla Model 2", Category: "Autoturisme", Price: &price, Make: "Tesla", Model: "Model 2", Year: 2025},
		{ID: "phone", Title: "Cablu Type 2 Tesla pentru telefon", Category: "Accesorii telefoane", Price: &price},
	}
	got, err := Apply("type 2 tesla", base64.RawURLEncoding.EncodeToString(payload), products, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0].ID != "charger" {
		t.Fatalf("unexpected charger snapshot: %#v", got)
	}
}

func TestApplyReplaysCategorySelection(t *testing.T) {
	fields := make([]any, 47)
	fields[0] = 5
	fields[1] = "relevance"
	fields[2] = false
	fields[3], fields[4], fields[44], fields[45] = false, false, false, 0
	for _, index := range []int{5, 6, 12, 13, 26, 27, 28, 29, 30, 37, 38, 39, 40, 41, 42, 43} {
		fields[index] = []string{}
	}
	fields[46] = []string{"Încărcătoare auto"}
	payload, err := json.Marshal(fields)
	if err != nil {
		t.Fatal(err)
	}
	products := []model.Product{
		{ID: "charger", Title: "Type 2", Category: "Încărcătoare auto", CategoryURL: "transport/chargers-for-cars"},
		{ID: "car", Title: "Tesla", Category: "Autoturisme"},
	}
	got, err := Apply("tesla", base64.RawURLEncoding.EncodeToString(payload), products, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0].ID != "charger" {
		t.Fatalf("unexpected category selection: %#v", got)
	}
}
