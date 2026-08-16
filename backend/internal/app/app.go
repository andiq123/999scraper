package app

import (
	"context"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/andi/999scraper/internal/alerts"
	"github.com/andi/999scraper/internal/auth"
	"github.com/andi/999scraper/internal/cache"
	"github.com/andi/999scraper/internal/config"
	"github.com/andi/999scraper/internal/currency"
	"github.com/andi/999scraper/internal/data"
	"github.com/andi/999scraper/internal/httpapi"
	"github.com/andi/999scraper/internal/mailer"
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
	migrationCtx, cancelMigration := context.WithTimeout(ctx, 45*time.Second)
	defer cancelMigration()
	if err := db.Migrate(migrationCtx); err != nil {
		dbPool.Close()
		return nil, nil, err
	}
	logger.Info("database schema ready")
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
	var emailSender *mailer.Sender
	if cfg.Email.Enabled() {
		emailSender, err = mailer.New(mailer.Config{FromEmail: cfg.Email.FromEmail, AppPassword: cfg.Email.AppPassword, Host: cfg.Email.Host, Port: cfg.Email.Port})
		if err != nil {
			redisCache.Close()
			dbPool.Close()
			return nil, nil, err
		}
	}
	alertService := alerts.New(db, scrape, emailSender, publicFrontendURL(cfg.AllowedOrigins), logger)
	workerCtx, stopWorker := context.WithCancel(ctx)
	go alertService.Run(workerCtx)
	handler := httpapi.New(db, auth.New(cfg.JWTSecret, cfg.JWTIssuer, cfg.JWTLifetime), scrape, redisCache, currency.New(), alertService, cfg.AllowedOrigins, logger)
	server := &http.Server{Addr: cfg.Address, Handler: handler, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 30 * time.Second, WriteTimeout: 5 * time.Minute, IdleTimeout: 2 * time.Minute}
	return server, func() { stopWorker(); redisCache.Close(); dbPool.Close() }, nil
}

func publicFrontendURL(origins []string) string {
	for _, origin := range origins {
		if strings.HasPrefix(origin, "https://") {
			return origin
		}
	}
	if len(origins) > 0 {
		return origins[0]
	}
	return "http://localhost:4200"
}
