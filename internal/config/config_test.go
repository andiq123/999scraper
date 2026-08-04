package config

import (
	"net/http"
	"net/url"
	"testing"
)

func TestCrossOriginCookieConfiguration(t *testing.T) {
	mode, err := sameSite("none")
	if err != nil || mode != http.SameSiteNoneMode {
		t.Fatalf("unexpected SameSite mode: %v %v", mode, err)
	}
	values, err := origins("https://market.example, https://preview.example/,https://market.example")
	if err != nil || len(values) != 2 || values[0] != "https://market.example" || values[1] != "https://preview.example" {
		t.Fatalf("unexpected origins: %#v %v", values, err)
	}
	if _, err := origins("https://market.example/path"); err == nil {
		t.Fatal("accepted an origin containing a path")
	}
}

func TestLoadDatabasePrefersURL(t *testing.T) {
	clearDatabaseEnvironment(t)
	t.Setenv("DATABASE_URL", "postgres://linked:secret@database.internal:5432/app?sslmode=require")
	t.Setenv("DB_MAX_CONNS", "4")
	settings, err := LoadDatabase()
	if err != nil {
		t.Fatal(err)
	}
	if settings.URL != "postgres://linked:secret@database.internal:5432/app?sslmode=require" || settings.MaxConnections != 4 {
		t.Fatalf("unexpected database settings: %#v", settings)
	}
}

func TestLoadDatabaseBuildsURLFromInjectedParts(t *testing.T) {
	clearDatabaseEnvironment(t)
	t.Setenv("DB_HOST", "database.internal")
	t.Setenv("DB_PORT", "6432")
	t.Setenv("DB_NAME", "market search")
	t.Setenv("DB_USER", "app user")
	t.Setenv("DB_PASSWORD", "p@ss:/word")
	t.Setenv("DB_SSLMODE", "verify-full")
	settings, err := LoadDatabase()
	if err != nil {
		t.Fatal(err)
	}
	parsed, err := url.Parse(settings.URL)
	if err != nil {
		t.Fatal(err)
	}
	password, _ := parsed.User.Password()
	if parsed.Host != "database.internal:6432" || parsed.Path != "/market search" || parsed.User.Username() != "app user" || password != "p@ss:/word" || parsed.Query().Get("sslmode") != "verify-full" {
		t.Fatalf("injected values were not preserved safely: %s", settings.URL)
	}
}

func TestLoadDatabaseSupportsPostgresVariableNames(t *testing.T) {
	clearDatabaseEnvironment(t)
	t.Setenv("POSTGRES_HOST", "postgres")
	t.Setenv("POSTGRES_DB", "app")
	t.Setenv("POSTGRES_USER", "appuser")
	t.Setenv("POSTGRES_PASSWORD", "secret")
	t.Setenv("DB_SSLMODE", "disable")
	settings, err := LoadDatabase()
	if err != nil {
		t.Fatal(err)
	}
	if parsed, _ := url.Parse(settings.URL); parsed.Host != "postgres:5432" || parsed.Query().Get("sslmode") != "disable" {
		t.Fatalf("unexpected PostgreSQL fallback URL: %s", settings.URL)
	}
}

func TestLoadDatabaseRequiresLinkedConfiguration(t *testing.T) {
	clearDatabaseEnvironment(t)
	if _, err := LoadDatabase(); err == nil {
		t.Fatal("expected missing database configuration to fail")
	}
}

func clearDatabaseEnvironment(t *testing.T) {
	t.Helper()
	for _, key := range []string{"DATABASE_URL", "DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_PASSWORD", "DB_SSLMODE", "POSTGRES_HOST", "POSTGRES_PORT", "POSTGRES_DB", "POSTGRES_USER", "POSTGRES_PASSWORD", "DB_MAX_CONNS", "DB_MIN_CONNS", "DB_CONNECT_TIMEOUT"} {
		t.Setenv(key, "")
	}
}
