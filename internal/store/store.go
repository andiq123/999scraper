package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/andi/999scraper/internal/model"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrNotFound   = errors.New("not found")
	ErrCodeExists = errors.New("login code already exists")
)

type Store struct{ db *pgxpool.Pool }

func Open(ctx context.Context, databaseURL string) (*Store, error) {
	db, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}
	if err := db.Ping(ctx); err != nil {
		db.Close()
		return nil, fmt.Errorf("ping database: %w", err)
	}
	s := &Store{db: db}
	if err := s.migrate(ctx); err != nil {
		db.Close()
		return nil, err
	}
	return s, nil
}

func (s *Store) Close() { s.db.Close() }

func (s *Store) migrate(ctx context.Context) error {
	const schema = `
DROP TABLE IF EXISTS favorites;
DROP TABLE IF EXISTS activities;
DROP TABLE IF EXISTS users;

CREATE TABLE IF NOT EXISTS accounts (
  id uuid PRIMARY KEY,
  code_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS search_history (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  query text NOT NULL,
  searched_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS search_history_account_date_idx
  ON search_history (account_id, searched_at DESC);
CREATE TABLE IF NOT EXISTS account_preferences (
  account_id uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  excluded_words text[] NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS saved_listings (
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  product_id text NOT NULL,
  product jsonb NOT NULL,
  saved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, product_id)
);
CREATE INDEX IF NOT EXISTS saved_listings_account_date_idx
  ON saved_listings (account_id, saved_at DESC);`
	if _, err := s.db.Exec(ctx, schema); err != nil {
		return fmt.Errorf("migrate database: %w", err)
	}
	return nil
}

func scanAccount(row pgx.Row) (model.Account, error) {
	var account model.Account
	err := row.Scan(&account.ID, &account.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return account, ErrNotFound
	}
	return account, err
}

func (s *Store) CreateAccount(ctx context.Context, codeHash string) (model.Account, error) {
	account, err := scanAccount(s.db.QueryRow(ctx, `
INSERT INTO accounts (id, code_hash) VALUES ($1, $2)
ON CONFLICT (code_hash) DO NOTHING
RETURNING id::text, created_at`, uuid.NewString(), codeHash))
	if errors.Is(err, ErrNotFound) {
		return account, ErrCodeExists
	}
	return account, err
}

func (s *Store) AccountByCodeHash(ctx context.Context, codeHash string) (model.Account, error) {
	return scanAccount(s.db.QueryRow(ctx, `
SELECT id::text, created_at FROM accounts WHERE code_hash=$1`, codeHash))
}

func (s *Store) AccountByID(ctx context.Context, id string) (model.Account, error) {
	return scanAccount(s.db.QueryRow(ctx, `
SELECT id::text, created_at FROM accounts WHERE id=$1`, id))
}

func (s *Store) AddSearch(ctx context.Context, accountID, query string) error {
	_, err := s.db.Exec(ctx, `
INSERT INTO search_history (id, account_id, query, searched_at)
VALUES ($1, $2, $3, $4)`, uuid.NewString(), accountID, query, time.Now().UTC())
	return err
}

func (s *Store) SearchHistory(ctx context.Context, accountID string) ([]model.SearchHistory, error) {
	rows, err := s.db.Query(ctx, `
SELECT id::text, query, searched_at
FROM search_history
WHERE account_id=$1
ORDER BY searched_at DESC
LIMIT 200`, accountID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]model.SearchHistory, 0)
	for rows.Next() {
		var item model.SearchHistory
		if err := rows.Scan(&item.ID, &item.Query, &item.SearchedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Store) Preferences(ctx context.Context, accountID string) (model.Preferences, error) {
	var preferences model.Preferences
	err := s.db.QueryRow(ctx, `SELECT excluded_words FROM account_preferences WHERE account_id=$1`, accountID).Scan(&preferences.ExcludedWords)
	if errors.Is(err, pgx.ErrNoRows) {
		return model.Preferences{ExcludedWords: []string{}}, nil
	}
	return preferences, err
}

func (s *Store) SavePreferences(ctx context.Context, accountID string, preferences model.Preferences) error {
	_, err := s.db.Exec(ctx, `
INSERT INTO account_preferences (account_id, excluded_words) VALUES ($1, $2)
ON CONFLICT (account_id) DO UPDATE SET excluded_words=EXCLUDED.excluded_words`, accountID, preferences.ExcludedWords)
	return err
}

func (s *Store) SavedListings(ctx context.Context, accountID string) ([]model.SavedListing, error) {
	rows, err := s.db.Query(ctx, `SELECT product, saved_at FROM saved_listings WHERE account_id=$1 ORDER BY saved_at DESC LIMIT 500`, accountID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]model.SavedListing, 0)
	for rows.Next() {
		var raw []byte
		var item model.SavedListing
		if err := rows.Scan(&raw, &item.SavedAt); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(raw, &item.Product); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Store) SaveListing(ctx context.Context, accountID string, product model.Product) error {
	raw, err := json.Marshal(product)
	if err != nil {
		return err
	}
	_, err = s.db.Exec(ctx, `
INSERT INTO saved_listings (account_id, product_id, product, saved_at) VALUES ($1, $2, $3, now())
ON CONFLICT (account_id, product_id) DO UPDATE SET product=EXCLUDED.product, saved_at=EXCLUDED.saved_at`, accountID, product.ID, raw)
	return err
}

func (s *Store) DeleteListing(ctx context.Context, accountID, productID string) error {
	_, err := s.db.Exec(ctx, `DELETE FROM saved_listings WHERE account_id=$1 AND product_id=$2`, accountID, productID)
	return err
}
