package config

import (
	"fmt"
	"os"
	"strconv"
	"time"
)

type Config struct {
	Address        string
	DatabaseURL    string
	RedisURL       string
	JWTSecret      string
	JWTIssuer      string
	JWTLifetime    time.Duration
	AdminUsername  string
	AdminEmail     string
	AdminPassword  string
	ScraperBaseURL string
	ScraperMaxPage int
	ScraperWorkers int
	ScraperDelay   time.Duration
	ScraperRetries int
}

// Load reads and validates the API's environment-based runtime configuration.
func Load() (Config, error) {
	maxPages, err := strconv.Atoi(env("SCRAPER_MAX_PAGES", "25"))
	if err != nil || maxPages < 1 {
		return Config{}, fmt.Errorf("SCRAPER_MAX_PAGES must be a positive integer")
	}
	workers, err := strconv.Atoi(env("SCRAPER_WORKERS", "3"))
	if err != nil || workers < 1 || workers > 8 {
		return Config{}, fmt.Errorf("SCRAPER_WORKERS must be between 1 and 8")
	}
	delay, err := time.ParseDuration(env("SCRAPER_REQUEST_DELAY", "350ms"))
	if err != nil || delay < 100*time.Millisecond {
		return Config{}, fmt.Errorf("SCRAPER_REQUEST_DELAY must be at least 100ms")
	}
	retries, err := strconv.Atoi(env("SCRAPER_RETRIES", "3"))
	if err != nil || retries < 0 || retries > 8 {
		return Config{}, fmt.Errorf("SCRAPER_RETRIES must be between 0 and 8")
	}
	cfg := Config{
		Address:        env("APP_ADDRESS", ":8080"),
		DatabaseURL:    env("DATABASE_URL", "postgres://appuser:secret@localhost:5432/999scraper?sslmode=disable"),
		RedisURL:       env("REDIS_URL", "redis://localhost:6379/0"),
		JWTSecret:      env("JWT_SECRET", "local-development-key-change-me-please"),
		JWTIssuer:      env("JWT_ISSUER", "999scraper"),
		JWTLifetime:    30 * 24 * time.Hour,
		AdminUsername:  env("ADMIN_USERNAME", "admin"),
		AdminEmail:     env("ADMIN_EMAIL", "admin@example.com"),
		AdminPassword:  env("ADMIN_PASSWORD", "change-me-now"),
		ScraperBaseURL: env("SCRAPER_BASE_URL", "https://999.md"),
		ScraperMaxPage: maxPages,
		ScraperWorkers: workers,
		ScraperDelay:   delay,
		ScraperRetries: retries,
	}
	if len(cfg.JWTSecret) < 32 {
		return Config{}, fmt.Errorf("JWT_SECRET must contain at least 32 characters")
	}
	return cfg, nil
}

func env(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
