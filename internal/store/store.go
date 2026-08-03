package store

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/andi/999scraper/internal/model"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrNotFound = errors.New("not found")

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
  ON search_history (account_id, searched_at DESC);`
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
	return scanAccount(s.db.QueryRow(ctx, `
INSERT INTO accounts (id, code_hash) VALUES ($1, $2)
RETURNING id::text, created_at`, uuid.NewString(), codeHash))
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
