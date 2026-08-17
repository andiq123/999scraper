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

const queryTimeout = 5 * time.Second
const healthTimeout = 2 * time.Second

type Store struct{ db *pgxpool.Pool }

func New(db *pgxpool.Pool) *Store { return &Store{db: db} }

func (s *Store) Healthy(ctx context.Context) bool {
	ctx, cancel := context.WithTimeout(ctx, healthTimeout)
	defer cancel()
	return s.db.Ping(ctx) == nil
}

func (s *Store) Migrate(ctx context.Context) error {
	const schema = `
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
  ON saved_listings (account_id, saved_at DESC);
CREATE TABLE IF NOT EXISTS search_subscriptions (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  query text NOT NULL,
  filter_param text NOT NULL DEFAULT '',
  search_path text NOT NULL,
  recipient_email text NOT NULL,
  interval_minutes integer NOT NULL DEFAULT 15 CHECK (interval_minutes IN (15, 60, 360, 720, 1440)),
  snapshot_product_ids text[] NOT NULL DEFAULT '{}',
  snapshot_products jsonb NOT NULL DEFAULT '[]'::jsonb,
  active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  next_check_at timestamptz NOT NULL DEFAULT now(),
  last_checked_at timestamptz,
  last_notified_at timestamptz,
  last_changes jsonb,
  locked_until timestamptz,
  UNIQUE (account_id, query, filter_param, recipient_email)
);
CREATE INDEX IF NOT EXISTS search_subscriptions_due_idx
  ON search_subscriptions (next_check_at) WHERE active;
ALTER TABLE search_subscriptions
  ADD COLUMN IF NOT EXISTS interval_minutes integer NOT NULL DEFAULT 15;
ALTER TABLE search_subscriptions
  DROP CONSTRAINT IF EXISTS search_subscriptions_interval_minutes_check;
ALTER TABLE search_subscriptions
  ADD CONSTRAINT search_subscriptions_interval_minutes_check CHECK (interval_minutes IN (15, 60, 360, 720, 1440));
DO $migration$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='search_subscriptions' AND column_name='seen_product_ids')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='search_subscriptions' AND column_name='snapshot_product_ids') THEN
    ALTER TABLE search_subscriptions RENAME COLUMN seen_product_ids TO snapshot_product_ids;
  END IF;
END $migration$;
ALTER TABLE search_subscriptions
  ADD COLUMN IF NOT EXISTS snapshot_products jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS last_changes jsonb;`
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin database migration: %w", err)
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext('999scraper_schema'))`); err != nil {
		return fmt.Errorf("lock database migration: %w", err)
	}
	if _, err := tx.Exec(ctx, schema); err != nil {
		return fmt.Errorf("migrate database: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit database migration: %w", err)
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
	ctx, cancel := context.WithTimeout(ctx, queryTimeout)
	defer cancel()
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
	ctx, cancel := context.WithTimeout(ctx, queryTimeout)
	defer cancel()
	return scanAccount(s.db.QueryRow(ctx, `
SELECT id::text, created_at FROM accounts WHERE code_hash=$1`, codeHash))
}

func (s *Store) AccountByID(ctx context.Context, id string) (model.Account, error) {
	ctx, cancel := context.WithTimeout(ctx, queryTimeout)
	defer cancel()
	return scanAccount(s.db.QueryRow(ctx, `
SELECT id::text, created_at FROM accounts WHERE id=$1`, id))
}

func (s *Store) AddSearch(ctx context.Context, accountID, query string) error {
	ctx, cancel := context.WithTimeout(ctx, queryTimeout)
	defer cancel()
	_, err := s.db.Exec(ctx, `
INSERT INTO search_history (id, account_id, query, searched_at)
SELECT $1, id, $3, $4 FROM accounts WHERE id=$2`, uuid.NewString(), accountID, query, time.Now().UTC())
	return err
}

func (s *Store) SearchHistory(ctx context.Context, accountID string) ([]model.SearchHistory, error) {
	ctx, cancel := context.WithTimeout(ctx, queryTimeout)
	defer cancel()
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
	ctx, cancel := context.WithTimeout(ctx, queryTimeout)
	defer cancel()
	var preferences model.Preferences
	err := s.db.QueryRow(ctx, `SELECT excluded_words FROM account_preferences WHERE account_id=$1`, accountID).Scan(&preferences.ExcludedWords)
	if errors.Is(err, pgx.ErrNoRows) {
		return model.Preferences{ExcludedWords: []string{}}, nil
	}
	return preferences, err
}

func (s *Store) SavePreferences(ctx context.Context, accountID string, preferences model.Preferences) error {
	ctx, cancel := context.WithTimeout(ctx, queryTimeout)
	defer cancel()
	_, err := s.db.Exec(ctx, `
INSERT INTO account_preferences (account_id, excluded_words) VALUES ($1, $2)
ON CONFLICT (account_id) DO UPDATE SET excluded_words=EXCLUDED.excluded_words`, accountID, preferences.ExcludedWords)
	return err
}

func (s *Store) SavedListings(ctx context.Context, accountID string) ([]model.SavedListing, error) {
	ctx, cancel := context.WithTimeout(ctx, queryTimeout)
	defer cancel()
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
	ctx, cancel := context.WithTimeout(ctx, queryTimeout)
	defer cancel()
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
	ctx, cancel := context.WithTimeout(ctx, queryTimeout)
	defer cancel()
	_, err := s.db.Exec(ctx, `DELETE FROM saved_listings WHERE account_id=$1 AND product_id=$2`, accountID, productID)
	return err
}
