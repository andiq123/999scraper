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
	changes := compareSnapshots(
		[]string{"stayed", "left"},
		[]model.Product{{ID: "stayed"}, {ID: "left", Title: "Gone"}},
		[]model.Product{{ID: "new", Title: "Fresh"}, {ID: "stayed"}},
	)
	if len(changes.Added) != 1 || changes.Added[0].ID != "new" || len(changes.Removed) != 1 || changes.Removed[0].ID != "left" {
		t.Fatalf("unexpected changes: %#v", changes)
	}

	initial := compareSnapshots([]string{"existing"}, nil, []model.Product{{ID: "existing"}})
	if len(initial.Removed) != 0 || len(initial.Added) != 0 {
		t.Fatalf("initial snapshot produced changes: %#v", initial)
	}

	html := alertHTML(model.SearchSubscription{Query: "Tesla <3"}, changes, "https://example.com/search", true)
	for _, expected := range []string{"New in the latest results", "Left the latest results", "Fresh", "Gone", "Tesla &lt;3"} {
		if !strings.Contains(html, expected) {
			t.Fatalf("digest is missing %q", expected)
		}
	}
	if !strings.Contains(html, "TEST EMAIL · NO ALERT DATA WAS CHANGED") {
		t.Fatal("preview digest is not clearly labelled")
	}
}

func TestValidInterval(t *testing.T) {
	for _, minutes := range []int{15, 60, 360, 1440} {
		if !ValidInterval(minutes) {
			t.Fatalf("rejected interval %d", minutes)
		}
	}
	for _, minutes := range []int{0, 5, 30, 1441} {
		if ValidInterval(minutes) {
			t.Fatalf("accepted interval %d", minutes)
		}
	}
}
