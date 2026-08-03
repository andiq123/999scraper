package httpapi

import (
	"context"
	"errors"
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
