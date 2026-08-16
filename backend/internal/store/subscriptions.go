package store

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/andi/999scraper/internal/model"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

const maxSearchSubscriptions = 10

var ErrSubscriptionLimit = errors.New("search subscription limit reached")

func (s *Store) SearchSubscriptions(ctx context.Context, accountID string) ([]model.SearchSubscription, error) {
	ctx, cancel := context.WithTimeout(ctx, queryTimeout)
	defer cancel()
	rows, err := s.db.Query(ctx, `
SELECT id::text, query, filter_param, search_path, recipient_email, interval_minutes, created_at, last_checked_at, last_notified_at
FROM search_subscriptions
WHERE account_id=$1 AND active
ORDER BY created_at DESC`, accountID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]model.SearchSubscription, 0)
	for rows.Next() {
		var item model.SearchSubscription
		if err := rows.Scan(&item.ID, &item.Query, &item.FilterParam, &item.SearchPath, &item.RecipientEmail, &item.IntervalMinutes, &item.CreatedAt, &item.LastCheckedAt, &item.LastNotifiedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Store) PrepareSearchSubscription(ctx context.Context, accountID string, item model.SearchSubscription, nextCheck time.Time) (model.SearchSubscription, error) {
	ctx, cancel := context.WithTimeout(ctx, queryTimeout)
	defer cancel()
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return model.SearchSubscription{}, err
	}
	defer tx.Rollback(ctx)
	var count int
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM search_subscriptions WHERE account_id=$1 AND active`, accountID).Scan(&count); err != nil {
		return model.SearchSubscription{}, err
	}
	if count >= maxSearchSubscriptions {
		var exists bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM search_subscriptions WHERE account_id=$1 AND query=$2 AND filter_param=$3 AND recipient_email=$4)`, accountID, item.Query, item.FilterParam, item.RecipientEmail).Scan(&exists); err != nil {
			return model.SearchSubscription{}, err
		}
		if !exists {
			return model.SearchSubscription{}, ErrSubscriptionLimit
		}
	}
	item.ID = uuid.NewString()
	err = tx.QueryRow(ctx, `
INSERT INTO search_subscriptions (id, account_id, query, filter_param, search_path, recipient_email, interval_minutes, snapshot_product_ids, active, next_check_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false, $9)
ON CONFLICT (account_id, query, filter_param, recipient_email) DO UPDATE SET
  search_path=EXCLUDED.search_path,
  interval_minutes=EXCLUDED.interval_minutes,
  snapshot_product_ids=EXCLUDED.snapshot_product_ids,
  updated_at=now(),
  next_check_at=EXCLUDED.next_check_at,
  locked_until=NULL
RETURNING id::text, created_at`, item.ID, accountID, item.Query, item.FilterParam, item.SearchPath, item.RecipientEmail, item.IntervalMinutes, item.SnapshotProductIDs, nextCheck).Scan(&item.ID, &item.CreatedAt)
	if err != nil {
		return model.SearchSubscription{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return model.SearchSubscription{}, err
	}
	return item, nil
}

func (s *Store) ActivateSearchSubscription(ctx context.Context, id string) error {
	ctx, cancel := context.WithTimeout(ctx, queryTimeout)
	defer cancel()
	_, err := s.db.Exec(ctx, `UPDATE search_subscriptions SET active=true, updated_at=now() WHERE id=$1`, id)
	return err
}

func (s *Store) DeleteSearchSubscription(ctx context.Context, accountID, id string) error {
	ctx, cancel := context.WithTimeout(ctx, queryTimeout)
	defer cancel()
	command, err := s.db.Exec(ctx, `DELETE FROM search_subscriptions WHERE account_id=$1 AND id=$2`, accountID, id)
	if err == nil && command.RowsAffected() == 0 {
		return ErrNotFound
	}
	return err
}

func (s *Store) DeletePreparedSearchSubscription(ctx context.Context, id string) error {
	ctx, cancel := context.WithTimeout(ctx, queryTimeout)
	defer cancel()
	_, err := s.db.Exec(ctx, `DELETE FROM search_subscriptions WHERE id=$1 AND NOT active`, id)
	return err
}

func (s *Store) ClaimDueSearchSubscriptions(ctx context.Context, limit int, lease time.Duration) ([]model.SearchSubscription, error) {
	ctx, cancel := context.WithTimeout(ctx, queryTimeout)
	defer cancel()
	rows, err := s.db.Query(ctx, `
WITH due AS (
  SELECT id
  FROM search_subscriptions
  WHERE active AND next_check_at <= now() AND (locked_until IS NULL OR locked_until < now())
  ORDER BY next_check_at
  FOR UPDATE SKIP LOCKED
  LIMIT $1
)
UPDATE search_subscriptions AS subscription
SET locked_until=now() + $2::interval
FROM due
WHERE subscription.id=due.id
RETURNING subscription.id::text, subscription.query, subscription.filter_param, subscription.search_path,
		  subscription.recipient_email, subscription.interval_minutes, subscription.created_at, subscription.last_checked_at,
		  subscription.last_notified_at, subscription.snapshot_product_ids, subscription.snapshot_products`, limit, lease.String())
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]model.SearchSubscription, 0, limit)
	for rows.Next() {
		var item model.SearchSubscription
		var snapshot []byte
		if err := rows.Scan(&item.ID, &item.Query, &item.FilterParam, &item.SearchPath, &item.RecipientEmail, &item.IntervalMinutes, &item.CreatedAt, &item.LastCheckedAt, &item.LastNotifiedAt, &item.SnapshotProductIDs, &snapshot); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(snapshot, &item.SnapshotProducts); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Store) CompleteSearchSubscription(ctx context.Context, id string, snapshot []model.Product, nextCheck time.Time, notified bool) error {
	ctx, cancel := context.WithTimeout(ctx, queryTimeout)
	defer cancel()
	payload, err := json.Marshal(snapshot)
	if err != nil {
		return err
	}
	ids := make([]string, 0, len(snapshot))
	for _, product := range snapshot {
		ids = append(ids, product.ID)
	}
	_, err = s.db.Exec(ctx, `
UPDATE search_subscriptions SET
  snapshot_product_ids=$2,
  snapshot_products=$3::jsonb,
  last_checked_at=now(),
  last_notified_at=CASE WHEN $5 THEN now() ELSE last_notified_at END,
  next_check_at=$4,
  locked_until=NULL,
  updated_at=now()
WHERE id=$1 AND active`, id, ids, string(payload), nextCheck, notified)
	return err
}

func (s *Store) RetrySearchSubscription(ctx context.Context, id string, nextCheck time.Time) error {
	ctx, cancel := context.WithTimeout(ctx, queryTimeout)
	defer cancel()
	command, err := s.db.Exec(ctx, `UPDATE search_subscriptions SET next_check_at=$2, locked_until=NULL WHERE id=$1 AND active`, id, nextCheck)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && command.RowsAffected() == 0) {
		return ErrNotFound
	}
	return err
}
