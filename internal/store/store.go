package store

import (
	"context"
	"errors"
	"fmt"
	"strings"
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
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY, username text NOT NULL, email text NOT NULL,
  password_hash text NOT NULL, is_admin boolean NOT NULL DEFAULT false,
  is_banned boolean NOT NULL DEFAULT false, last_active timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_idx ON users (lower(username));
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (lower(email));
CREATE TABLE IF NOT EXISTS activities (
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date_time timestamptz NOT NULL DEFAULT now(), description text NOT NULL
);
CREATE INDEX IF NOT EXISTS activities_user_date_idx ON activities (user_id, date_time DESC);
CREATE TABLE IF NOT EXISTS favorites (
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL, thumbnail_url text NOT NULL DEFAULT '', description text NOT NULL DEFAULT '',
  price integer, price_string text NOT NULL DEFAULT '', currency integer NOT NULL DEFAULT 0,
  is_boosted boolean NOT NULL DEFAULT false, url_to_product text NOT NULL DEFAULT '',
  is_good boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS favorites_user_title_lower_idx ON favorites (user_id, lower(title));`
	if _, err := s.db.Exec(ctx, schema); err != nil {
		return fmt.Errorf("migrate database: %w", err)
	}
	return nil
}

func scanUser(row pgx.Row) (model.User, error) {
	var u model.User
	err := row.Scan(&u.ID, &u.Username, &u.Email, &u.PasswordHash, &u.IsAdmin, &u.IsBanned, &u.LastActive)
	if errors.Is(err, pgx.ErrNoRows) {
		return u, ErrNotFound
	}
	return u, err
}

const userColumns = `id::text, username, email, password_hash, is_admin, is_banned, last_active`

func (s *Store) CreateUser(ctx context.Context, username, email, passwordHash string, admin bool) (model.User, error) {
	id := uuid.NewString()
	return scanUser(s.db.QueryRow(ctx, `INSERT INTO users (id, username, email, password_hash, is_admin)
VALUES ($1,$2,$3,$4,$5) RETURNING `+userColumns, id, username, email, passwordHash, admin))
}

func (s *Store) UserByLogin(ctx context.Context, login string) (model.User, error) {
	return scanUser(s.db.QueryRow(ctx, `SELECT `+userColumns+` FROM users WHERE lower(username)=lower($1) OR lower(email)=lower($1)`, login))
}

func (s *Store) UserByID(ctx context.Context, id string) (model.User, error) {
	return scanUser(s.db.QueryRow(ctx, `UPDATE users SET last_active=now() WHERE id=$1 RETURNING `+userColumns, id))
}

func (s *Store) EnsureAdmin(ctx context.Context, username, email, hash string) error {
	var exists bool
	if err := s.db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM users WHERE is_admin)`).Scan(&exists); err != nil {
		return err
	}
	if exists {
		return nil
	}
	_, err := s.CreateUser(ctx, username, email, hash, true)
	return err
}

func (s *Store) Users(ctx context.Context, exceptID string) ([]model.UserResponse, error) {
	rows, err := s.db.Query(ctx, `SELECT `+userColumns+` FROM users WHERE id<>$1 ORDER BY last_active DESC`, exceptID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	users := []model.UserResponse{}
	for rows.Next() {
		u, err := scanUser(rows)
		if err != nil {
			return nil, err
		}
		users = append(users, u.Response(""))
	}
	return users, rows.Err()
}

func (s *Store) ToggleBan(ctx context.Context, id string) (bool, error) {
	var banned bool
	err := s.db.QueryRow(ctx, `UPDATE users SET is_banned=NOT is_banned WHERE id=$1 RETURNING is_banned`, id).Scan(&banned)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, ErrNotFound
	}
	return banned, err
}

func (s *Store) AddActivity(ctx context.Context, userID, search string) (model.Activity, error) {
	a := model.Activity{ID: uuid.NewString(), DateTime: time.Now().UTC(), Description: "Has searched for " + search}
	_, err := s.db.Exec(ctx, `INSERT INTO activities (id,user_id,date_time,description) VALUES ($1,$2,$3,$4)`, a.ID, userID, a.DateTime, a.Description)
	return a, err
}

func (s *Store) Activities(ctx context.Context, userID string) ([]model.Activity, error) {
	rows, err := s.db.Query(ctx, `SELECT id::text,date_time,description FROM activities WHERE user_id=$1 ORDER BY date_time DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []model.Activity{}
	for rows.Next() {
		var a model.Activity
		if err := rows.Scan(&a.ID, &a.DateTime, &a.Description); err != nil {
			return nil, err
		}
		items = append(items, a)
	}
	return items, rows.Err()
}

func (s *Store) Favorites(ctx context.Context, userID string) ([]model.Product, error) {
	rows, err := s.db.Query(ctx, `SELECT id::text,title,thumbnail_url,description,price,price_string,currency,is_boosted,url_to_product,is_good FROM favorites WHERE user_id=$1 ORDER BY created_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []model.Product{}
	for rows.Next() {
		var p model.Product
		if err := rows.Scan(&p.ID, &p.Title, &p.ThumbnailURL, &p.Description, &p.Price, &p.PriceString, &p.Currency, &p.IsBoosted, &p.URLToProduct, &p.IsGood); err != nil {
			return nil, err
		}
		items = append(items, p)
	}
	return items, rows.Err()
}

func (s *Store) AddFavorite(ctx context.Context, userID string, p model.Product) error {
	p.ID = uuid.NewString()
	_, err := s.db.Exec(ctx, `INSERT INTO favorites (id,user_id,title,thumbnail_url,description,price,price_string,currency,is_boosted,url_to_product,is_good)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, p.ID, userID, p.Title, p.ThumbnailURL, p.Description, p.Price, p.PriceString, p.Currency, p.IsBoosted, p.URLToProduct, p.IsGood)
	if err != nil && strings.Contains(err.Error(), "favorites_user_title_lower_idx") {
		return fmt.Errorf("favorite already exists")
	}
	return err
}

func (s *Store) RemoveFavorite(ctx context.Context, userID, id string) error {
	tag, err := s.db.Exec(ctx, `DELETE FROM favorites WHERE id=$1 AND user_id=$2`, id, userID)
	if err == nil && tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return err
}
