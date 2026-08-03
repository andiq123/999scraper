package app

import (
	"context"
	"io/fs"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/andi/999scraper/internal/auth"
	"github.com/andi/999scraper/internal/cache"
	"github.com/andi/999scraper/internal/config"
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
	hash, err := auth.Hash(cfg.AdminPassword)
	if err != nil {
		db.Close()
		return nil, nil, err
	}
	if err := db.EnsureAdmin(ctx, cfg.AdminUsername, cfg.AdminEmail, hash); err != nil {
		db.Close()
		return nil, nil, err
	}
	redisCache := cache.Open(ctx, cfg.RedisURL, logger)
	web, err := webFiles()
	if err != nil {
		redisCache.Close()
		db.Close()
		return nil, nil, err
	}
	scrape := scraper.New(cfg.ScraperBaseURL, scraper.Options{
		MaxPages:       cfg.ScraperMaxPage,
		Concurrency:    cfg.ScraperWorkers,
		MinInterval:    cfg.ScraperDelay,
		MaxRetries:     cfg.ScraperRetries,
		RequestTimeout: 20 * time.Second,
	})
	handler := httpapi.New(db, auth.New(cfg.JWTSecret, cfg.JWTIssuer, cfg.JWTLifetime), scrape, redisCache, logger, web)
	server := &http.Server{Addr: cfg.Address, Handler: handler, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 30 * time.Second, WriteTimeout: 5 * time.Minute, IdleTimeout: 2 * time.Minute}
	return server, func() { redisCache.Close(); db.Close() }, nil
}

func webFiles() (fs.FS, error) {
	root := os.Getenv("WEB_ROOT")
	if root == "" {
		root = "web"
	}
	absolute, err := filepath.Abs(root)
	if err != nil {
		return nil, err
	}
	return os.DirFS(absolute), nil
}
