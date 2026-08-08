package httpapi

import "testing"

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
