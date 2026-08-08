package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestCORSAllowsOnlyConfiguredFrontend(t *testing.T) {
	api := &API{origins: map[string]struct{}{"https://market.example": {}}, logger: slog.Default()}
	handler := api.cors(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) }))

	allowed := httptest.NewRequest(http.MethodOptions, "/api/products/stream", nil)
	allowed.Header.Set("Origin", "https://market.example")
	allowedResponse := httptest.NewRecorder()
	handler.ServeHTTP(allowedResponse, allowed)
	if allowedResponse.Code != http.StatusNoContent || allowedResponse.Header().Get("Access-Control-Allow-Origin") != "https://market.example" || !strings.Contains(allowedResponse.Header().Get("Access-Control-Allow-Headers"), "Authorization") {
		t.Fatalf("configured origin was not allowed: %#v", allowedResponse.Result().Header)
	}

	denied := httptest.NewRequest(http.MethodOptions, "/api/products/stream", nil)
	denied.Header.Set("Origin", "https://attacker.example")
	deniedResponse := httptest.NewRecorder()
	handler.ServeHTTP(deniedResponse, denied)
	if deniedResponse.Code != http.StatusForbidden || deniedResponse.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Fatalf("unexpected response for denied origin: %d %#v", deniedResponse.Code, deniedResponse.Result().Header)
	}
}

func TestQueryGateWaitIsCancelable(t *testing.T) {
	gate := newQueryGate()
	release, err := gate.acquire(context.Background(), "  iPhone   15 ")
	if err != nil {
		t.Fatal(err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := gate.acquire(ctx, "iphone 15"); !errors.Is(err, context.Canceled) {
		t.Fatalf("expected canceled duplicate request, got %v", err)
	}
	release()

	releaseAgain, err := gate.acquire(context.Background(), "iphone 15")
	if err != nil {
		t.Fatal(err)
	}
	releaseAgain()
}

func TestLoginLimiterResetsAndExpires(t *testing.T) {
	limiter := newLoginLimiter()
	now := time.Now()
	for range 6 {
		if !limiter.allow("client", now) {
			t.Fatal("blocked an allowed attempt")
		}
	}
	if limiter.allow("client", now) {
		t.Fatal("allowed too many attempts")
	}
	limiter.reset("client")
	if !limiter.allow("client", now) {
		t.Fatal("reset did not clear the window")
	}
	if !limiter.allow("other", now.Add(2*time.Minute)) {
		t.Fatal("new window should allow attempts")
	}
}

func TestRequestLimiterUsesConfiguredWindow(t *testing.T) {
	limiter := newRequestLimiter(2, 10*time.Second)
	now := time.Now()
	if !limiter.allow("client", now) || !limiter.allow("client", now) {
		t.Fatal("blocked a request within the configured limit")
	}
	if limiter.allow("client", now) {
		t.Fatal("allowed a request above the configured limit")
	}
	if !limiter.allow("client", now.Add(11*time.Second)) {
		t.Fatal("did not reset after the configured window")
	}
}

func TestDecodeRejectsTrailingJSON(t *testing.T) {
	request := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"value":1}{"value":2}`))
	response := httptest.NewRecorder()
	var input struct {
		Value int `json:"value"`
	}
	if decode(response, request, &input) {
		t.Fatal("accepted more than one JSON value")
	}
	if response.Code != http.StatusBadRequest {
		t.Fatalf("unexpected status: %d", response.Code)
	}
}

func TestValidListingID(t *testing.T) {
	for _, id := range []string{"1", "104789746"} {
		if !validListingID(id) {
			t.Fatalf("rejected valid listing id %q", id)
		}
	}
	for _, id := range []string{"", "abc", "12/34", strings.Repeat("1", 33)} {
		if validListingID(id) {
			t.Fatalf("accepted invalid listing id %q", id)
		}
	}
}

func TestStreamWriterUsesSSEFrames(t *testing.T) {
	recorder := httptest.NewRecorder()
	writer := beginStream(recorder, recorder)
	if err := writer.write(searchEvent{Type: "chunk", LoadedPages: 2}); err != nil {
		t.Fatal(err)
	}
	response := recorder.Result()
	defer response.Body.Close()
	if contentType := response.Header.Get("Content-Type"); !strings.HasPrefix(contentType, "text/event-stream") {
		t.Fatalf("unexpected content type: %s", contentType)
	}
	body := recorder.Body.String()
	if !strings.HasPrefix(body, "event: chunk\ndata: ") || !strings.HasSuffix(body, "\n\n") {
		t.Fatalf("invalid SSE frame: %q", body)
	}
	data := strings.TrimSuffix(strings.TrimPrefix(body, "event: chunk\ndata: "), "\n\n")
	var event searchEvent
	if err := json.Unmarshal([]byte(data), &event); err != nil {
		t.Fatal(err)
	}
	if event.LoadedPages != 2 {
		t.Fatalf("unexpected event: %#v", event)
	}
	if response.StatusCode != http.StatusOK {
		t.Fatalf("unexpected status: %d", response.StatusCode)
	}
}
