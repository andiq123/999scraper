package auth

import (
	"strings"
	"testing"
)

func TestLoginCodeIsRandomAndFormattingDoesNotAffectHash(t *testing.T) {
	first, err := NewLoginCode()
	if err != nil {
		t.Fatal(err)
	}
	second, err := NewLoginCode()
	if err != nil {
		t.Fatal(err)
	}
	if first == second || len(strings.ReplaceAll(first, "-", "")) != 26 {
		t.Fatalf("unexpected generated codes: %q and %q", first, second)
	}
	compact := strings.ToLower(strings.ReplaceAll(first, "-", ""))
	if CodeHash(first) != CodeHash(compact) {
		t.Fatal("code normalization changed its hash")
	}
}
