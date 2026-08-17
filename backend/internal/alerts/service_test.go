package alerts

import (
	"strings"
	"testing"

	"github.com/andi/999scraper/internal/model"
)

func TestValidSearchPath(t *testing.T) {
	for _, value := range []string{"/?q=tesla&filters=abc", "/?q=apartament"} {
		if !ValidSearchPath(value) {
			t.Fatalf("rejected search path %q", value)
		}
	}
	for _, value := range []string{"https://evil.example/?q=tesla", "//evil.example/?q=tesla", "/account", "/?q=x#fragment"} {
		if ValidSearchPath(value) {
			t.Fatalf("accepted unsafe search path %q", value)
		}
	}
}

func TestCompareSnapshots(t *testing.T) {
	oldPrice, newPrice := 13_500, 12_900
	changes := compareSnapshots(
		[]string{"stayed", "repriced", "left"},
		[]model.Product{{ID: "stayed"}, {ID: "repriced", Title: "Cheaper", Price: &oldPrice, PriceString: "13.500 EUR", Currency: 1}, {ID: "left", Title: "Gone"}},
		[]model.Product{{ID: "new", Title: "Fresh"}, {ID: "stayed"}, {ID: "repriced", Title: "Cheaper", Price: &newPrice, PriceString: "12.900 EUR", Currency: 1}},
	)
	if len(changes.Added) != 1 || changes.Added[0].ID != "new" || len(changes.Removed) != 1 || changes.Removed[0].ID != "left" || len(changes.PriceChanges) != 1 || changes.PriceChanges[0].Before.PriceString != "13.500 EUR" || changes.PriceChanges[0].After.PriceString != "12.900 EUR" {
		t.Fatalf("unexpected changes: %#v", changes)
	}

	initial := compareSnapshots([]string{"existing"}, nil, []model.Product{{ID: "existing"}})
	if changeCount(initial) != 0 {
		t.Fatalf("initial snapshot produced changes: %#v", initial)
	}

	unchanged := compareSnapshots(
		[]string{"new", "stayed"},
		[]model.Product{{ID: "new"}, {ID: "stayed"}},
		[]model.Product{{ID: "new"}, {ID: "stayed"}},
	)
	if changeCount(unchanged) != 0 {
		t.Fatalf("unchanged snapshot produced changes: %#v", unchanged)
	}

	samePriceBefore, samePriceAfter := 10_000, 10_000
	formatOnly := compareSnapshots(
		[]string{"same-price"},
		[]model.Product{{ID: "same-price", Price: &samePriceBefore, Currency: 1, PriceString: "10.000 EUR"}},
		[]model.Product{{ID: "same-price", Price: &samePriceAfter, Currency: 1, PriceString: "10 000 EUR"}},
	)
	if changeCount(formatOnly) != 0 {
		t.Fatalf("format-only price update produced changes: %#v", formatOnly)
	}

	html := alertHTML(model.SearchSubscription{Query: "Tesla <3"}, changes, "https://example.com/search", true)
	for _, expected := range []string{"New in the latest results", "Left the latest results", "Price changes", "13.500 EUR", "12.900 EUR", "Fresh", "Gone", "Tesla &lt;3"} {
		if !strings.Contains(html, expected) {
			t.Fatalf("digest is missing %q", expected)
		}
	}
	if !strings.Contains(html, "TEST EMAIL · NO ALERT DATA WAS CHANGED") {
		t.Fatal("preview digest is not clearly labelled")
	}
}

func TestValidInterval(t *testing.T) {
	for _, minutes := range []int{15, 60, 360, 720, 1440} {
		if !ValidInterval(minutes) {
			t.Fatalf("rejected interval %d", minutes)
		}
	}
	for _, minutes := range []int{0, 5, 30, 719, 1441} {
		if ValidInterval(minutes) {
			t.Fatalf("accepted interval %d", minutes)
		}
	}
}
