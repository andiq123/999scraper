package config

import (
	"fmt"
	"net"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

type DatabaseConfig struct {
	URL            string
	MaxConnections int32
	MinConnections int32
	ConnectTimeout time.Duration
}

type RedisConfig struct {
	URL string
}

type Config struct {
	Address         string
	Database        DatabaseConfig
	Redis           RedisConfig
	JWTSecret       string
	JWTIssuer       string
	JWTLifetime     time.Duration
	CookieSecure    bool
	CookieSameSite  http.SameSite
	AllowedOrigins  []string
	ScraperBaseURL  string
	ScraperMaxPage  int
	ScraperWorkers  int
	ScraperSearches int
	ScraperDelay    time.Duration
	ScraperRetries  int
}

// Load reads and validates the API's environment-based runtime configuration.
func Load() (Config, error) {
	database, err := LoadDatabase()
	if err != nil {
		return Config{}, err
	}
	redisConfig, err := LoadRedis()
	if err != nil {
		return Config{}, err
	}
	maxPages, err := strconv.Atoi(env("SCRAPER_MAX_PAGES", "25"))
	if err != nil || maxPages < 1 {
		return Config{}, fmt.Errorf("SCRAPER_MAX_PAGES must be a positive integer")
	}
	workers, err := strconv.Atoi(env("SCRAPER_WORKERS", "3"))
	if err != nil || workers < 1 || workers > 8 {
		return Config{}, fmt.Errorf("SCRAPER_WORKERS must be between 1 and 8")
	}
	searches, err := strconv.Atoi(env("SCRAPER_CONCURRENT_SEARCHES", "2"))
	if err != nil || searches < 1 || searches > 4 {
		return Config{}, fmt.Errorf("SCRAPER_CONCURRENT_SEARCHES must be between 1 and 4")
	}
	delay, err := time.ParseDuration(env("SCRAPER_REQUEST_DELAY", "350ms"))
	if err != nil || delay < 100*time.Millisecond {
		return Config{}, fmt.Errorf("SCRAPER_REQUEST_DELAY must be at least 100ms")
	}
	retries, err := strconv.Atoi(env("SCRAPER_RETRIES", "3"))
	if err != nil || retries < 0 || retries > 8 {
		return Config{}, fmt.Errorf("SCRAPER_RETRIES must be between 0 and 8")
	}
	cookieSecure, err := strconv.ParseBool(env("COOKIE_SECURE", "false"))
	if err != nil {
		return Config{}, fmt.Errorf("COOKIE_SECURE must be true or false")
	}
	cookieSameSite, err := sameSite(env("COOKIE_SAME_SITE", "lax"))
	if err != nil {
		return Config{}, err
	}
	if cookieSameSite == http.SameSiteNoneMode && !cookieSecure {
		return Config{}, fmt.Errorf("COOKIE_SECURE must be true when COOKIE_SAME_SITE is none")
	}
	allowedOrigins, err := origins(env("CORS_ALLOWED_ORIGINS", "http://localhost:4200,https://localhost:4200"))
	if err != nil {
		return Config{}, err
	}
	cfg := Config{
		Address:         env("APP_ADDRESS", ":8080"),
		Database:        database,
		Redis:           redisConfig,
		JWTSecret:       strings.TrimSpace(os.Getenv("JWT_SECRET")),
		JWTIssuer:       env("JWT_ISSUER", "999scraper"),
		JWTLifetime:     30 * 24 * time.Hour,
		CookieSecure:    cookieSecure,
		CookieSameSite:  cookieSameSite,
		AllowedOrigins:  allowedOrigins,
		ScraperBaseURL:  env("SCRAPER_BASE_URL", "https://999.md"),
		ScraperMaxPage:  maxPages,
		ScraperWorkers:  workers,
		ScraperSearches: searches,
		ScraperDelay:    delay,
		ScraperRetries:  retries,
	}
	if len(cfg.JWTSecret) < 32 {
		return Config{}, fmt.Errorf("JWT_SECRET must contain at least 32 characters")
	}
	return cfg, nil
}

// LoadRedis accepts the linked service's REDIS_URL and otherwise constructs an
// equivalent URL from its scoped REDIS_* variables. The resulting URL is kept
// in memory and is never logged.
func LoadRedis() (RedisConfig, error) {
	rawURL := strings.TrimSpace(os.Getenv("REDIS_URL"))
	if rawURL == "" {
		var err error
		rawURL, err = redisURLFromParts()
		if err != nil {
			return RedisConfig{}, err
		}
	}
	parsed, err := url.Parse(rawURL)
	if err != nil || (parsed.Scheme != "redis" && parsed.Scheme != "rediss") || parsed.Host == "" || parsed.Fragment != "" {
		return RedisConfig{}, fmt.Errorf("REDIS_URL must be a valid redis:// or rediss:// connection URL")
	}
	return RedisConfig{URL: rawURL}, nil
}

func redisURLFromParts() (string, error) {
	host := env("REDIS_HOST", "localhost")
	port := env("REDIS_PORT", "6379")
	portNumber, err := strconv.ParseUint(port, 10, 16)
	if err != nil || portNumber == 0 {
		return "", fmt.Errorf("REDIS_PORT must be a valid port")
	}
	database, err := nonNegativeInt("REDIS_DB", 0, 255)
	if err != nil {
		return "", err
	}
	tlsEnabled, err := strconv.ParseBool(env("REDIS_TLS", "false"))
	if err != nil {
		return "", fmt.Errorf("REDIS_TLS must be true or false")
	}
	connection := &url.URL{
		Scheme: "redis",
		Host:   net.JoinHostPort(host, port),
		Path:   "/" + strconv.Itoa(database),
	}
	if tlsEnabled {
		connection.Scheme = "rediss"
	}
	username := strings.TrimSpace(os.Getenv("REDIS_USERNAME"))
	password := os.Getenv("REDIS_PASSWORD")
	if username != "" || password != "" {
		if username == "" {
			username = "default"
		}
		connection.User = url.UserPassword(username, password)
	}
	return connection.String(), nil
}

func sameSite(value string) (http.SameSite, error) {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "strict":
		return http.SameSiteStrictMode, nil
	case "lax":
		return http.SameSiteLaxMode, nil
	case "none":
		return http.SameSiteNoneMode, nil
	default:
		return http.SameSiteDefaultMode, fmt.Errorf("COOKIE_SAME_SITE must be strict, lax, or none")
	}
}

func origins(value string) ([]string, error) {
	seen := make(map[string]struct{})
	result := make([]string, 0)
	for _, candidate := range strings.Split(value, ",") {
		candidate = strings.TrimSpace(candidate)
		if candidate == "" {
			continue
		}
		parsed, err := url.Parse(candidate)
		if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" || (parsed.Path != "" && parsed.Path != "/") || parsed.RawQuery != "" || parsed.Fragment != "" || parsed.User != nil {
			return nil, fmt.Errorf("CORS_ALLOWED_ORIGINS must contain only HTTP(S) origins without paths")
		}
		origin := parsed.Scheme + "://" + parsed.Host
		if _, exists := seen[origin]; exists {
			continue
		}
		seen[origin] = struct{}{}
		result = append(result, origin)
	}
	return result, nil
}

// LoadDatabase accepts the platform's preferred DATABASE_URL and falls back to
// its injected DB_* or POSTGRES_* components. Credentials are never embedded in
// application defaults.
func LoadDatabase() (DatabaseConfig, error) {
	rawURL := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	if rawURL == "" {
		var err error
		rawURL, err = databaseURLFromParts()
		if err != nil {
			return DatabaseConfig{}, err
		}
	}
	if parsed, err := url.Parse(rawURL); err != nil || (parsed.Scheme != "postgres" && parsed.Scheme != "postgresql") || parsed.Host == "" {
		return DatabaseConfig{}, fmt.Errorf("DATABASE_URL must be a valid PostgreSQL connection URL")
	}
	maxConnections, err := positiveInt("DB_MAX_CONNS", 5, 20)
	if err != nil {
		return DatabaseConfig{}, err
	}
	minConnections, err := nonNegativeInt("DB_MIN_CONNS", 0, maxConnections)
	if err != nil {
		return DatabaseConfig{}, err
	}
	connectTimeout, err := time.ParseDuration(env("DB_CONNECT_TIMEOUT", "10s"))
	if err != nil || connectTimeout <= 0 || connectTimeout > time.Minute {
		return DatabaseConfig{}, fmt.Errorf("DB_CONNECT_TIMEOUT must be between 1ns and 1m")
	}
	return DatabaseConfig{URL: rawURL, MaxConnections: int32(maxConnections), MinConnections: int32(minConnections), ConnectTimeout: connectTimeout}, nil
}

func databaseURLFromParts() (string, error) {
	host := firstEnv("DB_HOST", "POSTGRES_HOST")
	name := firstEnv("DB_NAME", "POSTGRES_DB")
	user := firstEnv("DB_USER", "POSTGRES_USER")
	if host == "" || name == "" || user == "" {
		return "", fmt.Errorf("link a PostgreSQL database and provide DATABASE_URL or DB_HOST, DB_NAME, and DB_USER")
	}
	port := firstEnv("DB_PORT", "POSTGRES_PORT")
	if port == "" {
		port = "5432"
	}
	portNumber, err := strconv.ParseUint(port, 10, 16)
	if err != nil || portNumber == 0 {
		return "", fmt.Errorf("DB_PORT or POSTGRES_PORT must be a valid port")
	}
	password := firstEnv("DB_PASSWORD", "POSTGRES_PASSWORD")
	credentials := url.User(user)
	if password != "" {
		credentials = url.UserPassword(user, password)
	}
	connection := &url.URL{Scheme: "postgres", User: credentials, Host: net.JoinHostPort(host, port), Path: "/" + name}
	query := connection.Query()
	query.Set("sslmode", env("DB_SSLMODE", "require"))
	connection.RawQuery = query.Encode()
	return connection.String(), nil
}

func positiveInt(key string, fallback, maximum int) (int, error) {
	value, err := strconv.Atoi(env(key, strconv.Itoa(fallback)))
	if err != nil || value < 1 || value > maximum {
		return 0, fmt.Errorf("%s must be between 1 and %d", key, maximum)
	}
	return value, nil
}

func nonNegativeInt(key string, fallback, maximum int) (int, error) {
	value, err := strconv.Atoi(env(key, strconv.Itoa(fallback)))
	if err != nil || value < 0 || value > maximum {
		return 0, fmt.Errorf("%s must be between 0 and %d", key, maximum)
	}
	return value, nil
}

func firstEnv(keys ...string) string {
	for _, key := range keys {
		if value := strings.TrimSpace(os.Getenv(key)); value != "" {
			return value
		}
	}
	return ""
}

func env(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
