package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

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

func TestStreamWriterUsesSSEFrames(t *testing.T) {
	recorder := httptest.NewRecorder()
	writer := beginStream(recorder, recorder)
	if err := writer.write(searchEvent{Type: "chunk", ID: "search-1", Page: 2}); err != nil {
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
	if event.ID != "search-1" || event.Page != 2 {
		t.Fatalf("unexpected event: %#v", event)
	}
	if response.StatusCode != http.StatusOK {
		t.Fatalf("unexpected status: %d", response.StatusCode)
	}
}
