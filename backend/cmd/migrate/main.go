package main

import (
	"context"
	"log/slog"
	"os"
	"time"

	"github.com/andi/999scraper/internal/config"
	"github.com/andi/999scraper/internal/data"
	"github.com/andi/999scraper/internal/store"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	settings, err := config.LoadDatabase()
	if err != nil {
		logger.Error("database configuration failed", "error", err)
		os.Exit(1)
	}
	pool, err := data.Open(ctx, settings)
	if err != nil {
		logger.Error("database connection failed", "error", err)
		os.Exit(1)
	}
	defer pool.Close()
	if err := store.New(pool).Migrate(ctx); err != nil {
		logger.Error("database migration failed", "error", err)
		os.Exit(1)
	}
	logger.Info("database migration complete")
}
