package auth

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestLoginCodeIsSixRandomDigits(t *testing.T) {
	first, err := NewLoginCode()
	if err != nil {
		t.Fatal(err)
	}
	second, err := NewLoginCode()
	if err != nil {
		t.Fatal(err)
	}
	if first == second || len(first) != 6 {
		t.Fatalf("unexpected generated codes: %q and %q", first, second)
	}
	for _, digit := range first {
		if digit < '0' || digit > '9' {
			t.Fatalf("code contains a non-digit: %q", first)
		}
	}
	service := New(strings.Repeat("s", 32), "test", time.Hour)
	if service.CodeHash(first) != service.CodeHash(" "+first+" ") {
		t.Fatal("surrounding whitespace changed the hash")
	}
}

func TestLoginCodeValidation(t *testing.T) {
	for _, code := range []string{"12345", "1234567", "12a456", " 123456"} {
		if ValidLoginCode(code) {
			t.Fatalf("accepted invalid code %q", code)
		}
	}
	if !ValidLoginCode("012345") {
		t.Fatal("rejected a valid code with a leading zero")
	}
}

func TestBearerTokenAuthenticatesRequest(t *testing.T) {
	service := New(strings.Repeat("s", 32), "test", time.Hour)
	token, err := service.Token("account-1")
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodGet, "/api/history", nil)
	request.Header.Set("Authorization", "Bearer "+token)
	authenticated := false
	handler := service.Middleware(http.HandlerFunc(func(_ http.ResponseWriter, request *http.Request) {
		authenticated = ClaimsFrom(request.Context()).Subject == "account-1"
	}))
	handler.ServeHTTP(httptest.NewRecorder(), request.WithContext(context.Background()))
	if !authenticated {
		t.Fatal("bearer token did not authenticate the request")
	}
}
