package app

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/andi/999scraper/internal/auth"
	"github.com/andi/999scraper/internal/cache"
	"github.com/andi/999scraper/internal/config"
	"github.com/andi/999scraper/internal/currency"
	"github.com/andi/999scraper/internal/httpapi"
	"github.com/andi/999scraper/internal/scraper"
	"github.com/andi/999scraper/internal/store"
)

func New(ctx context.Context, logger *slog.Logger) (*http.Server, func(), error) {
	cfg, err := config.Load()
	if err != nil {
		return nil, nil, err
	}
	db, err := store.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		return nil, nil, err
	}
	redisCache := cache.Open(ctx, cfg.RedisURL, logger)
	scrape := scraper.New(cfg.ScraperBaseURL, scraper.Options{
		MaxPages:       cfg.ScraperMaxPage,
		Concurrency:    cfg.ScraperWorkers,
		MinInterval:    cfg.ScraperDelay,
		MaxRetries:     cfg.ScraperRetries,
		RequestTimeout: 20 * time.Second,
	})
	handler := httpapi.New(db, auth.New(cfg.JWTSecret, cfg.JWTIssuer, cfg.JWTLifetime, cfg.CookieSecure), scrape, redisCache, currency.New(), logger)
	server := &http.Server{Addr: cfg.Address, Handler: handler, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 30 * time.Second, WriteTimeout: 5 * time.Minute, IdleTimeout: 2 * time.Minute}
	return server, func() { redisCache.Close(); db.Close() }, nil
}
