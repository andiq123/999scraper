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
	"github.com/andi/999scraper/internal/data"
	"github.com/andi/999scraper/internal/httpapi"
	"github.com/andi/999scraper/internal/scraper"
	"github.com/andi/999scraper/internal/store"
)

func New(ctx context.Context, logger *slog.Logger) (*http.Server, func(), error) {
	cfg, err := config.Load()
	if err != nil {
		return nil, nil, err
	}
	dbPool, err := data.Open(ctx, cfg.Database)
	if err != nil {
		return nil, nil, err
	}
	db := store.New(dbPool)
	redisCache, err := cache.Open(ctx, cfg.Redis.URL, logger)
	if err != nil {
		dbPool.Close()
		return nil, nil, err
	}
	scrape := scraper.New(cfg.ScraperBaseURL, scraper.Options{
		MaxPages:       cfg.ScraperMaxPage,
		Concurrency:    cfg.ScraperWorkers,
		MaxSearches:    cfg.ScraperSearches,
		MinInterval:    cfg.ScraperDelay,
		MaxRetries:     cfg.ScraperRetries,
		RequestTimeout: 20 * time.Second,
	})
	handler := httpapi.New(db, auth.New(cfg.JWTSecret, cfg.JWTIssuer, cfg.JWTLifetime, cfg.CookieSecure, cfg.CookieSameSite), scrape, redisCache, currency.New(), cfg.AllowedOrigins, logger)
	server := &http.Server{Addr: cfg.Address, Handler: handler, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 30 * time.Second, WriteTimeout: 5 * time.Minute, IdleTimeout: 2 * time.Minute}
	return server, func() { redisCache.Close(); dbPool.Close() }, nil
}
