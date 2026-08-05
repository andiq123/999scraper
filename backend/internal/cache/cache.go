package cache

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/andi/999scraper/internal/model"
	"github.com/redis/go-redis/v9"
)

type Cache struct {
	client *redis.Client
	logger *slog.Logger
}

const (
	searchTTL        = 5 * time.Minute
	listingTTL       = time.Hour
	maxEntrySize     = 4 << 20
	connectTimeout   = 3 * time.Second
	operationTimeout = 2 * time.Second
)

func Open(ctx context.Context, rawURL string, logger *slog.Logger) (*Cache, error) {
	options, err := redis.ParseURL(rawURL)
	if err != nil {
		return nil, errors.New("parse Redis configuration")
	}
	options.PoolSize = 5
	options.MinIdleConns = 0
	options.MaxRetries = 2
	options.DialTimeout = connectTimeout
	options.ReadTimeout = operationTimeout
	options.WriteTimeout = operationTimeout
	options.PoolTimeout = operationTimeout
	client := redis.NewClient(options)
	pingCtx, cancel := context.WithTimeout(ctx, connectTimeout)
	defer cancel()
	if err := client.Ping(pingCtx).Err(); err != nil {
		_ = client.Close()
		return nil, fmt.Errorf("connect Redis cache: %w", err)
	}
	return &Cache{client: client, logger: logger}, nil
}

func (c *Cache) Close() {
	if c.client != nil {
		_ = c.client.Close()
	}
}

func (c *Cache) Healthy(ctx context.Context) bool {
	if c.client == nil {
		return false
	}
	operationCtx, cancel := context.WithTimeout(ctx, operationTimeout)
	defer cancel()
	return c.client.Ping(operationCtx).Err() == nil
}

func (c *Cache) GetQuery(ctx context.Context, query string) (model.ProductsContainer, bool) {
	return c.get(ctx, queryKey(query))
}

func (c *Cache) get(ctx context.Context, key string) (model.ProductsContainer, bool) {
	if c.client == nil || key == "" {
		return model.ProductsContainer{}, false
	}
	operationCtx, cancel := context.WithTimeout(ctx, operationTimeout)
	defer cancel()
	data, err := c.client.Get(operationCtx, key).Bytes()
	if err != nil {
		return model.ProductsContainer{}, false
	}
	var result model.ProductsContainer
	if err := json.Unmarshal(data, &result); err != nil {
		_ = c.client.Del(operationCtx, key).Err()
		return model.ProductsContainer{}, false
	}
	return result, true
}

func (c *Cache) SetSearch(ctx context.Context, query string, value model.ProductsContainer) {
	data, err := json.Marshal(value)
	if err != nil {
		c.logger.Warn("cache encoding failed", "error", err)
		return
	}
	key := queryKey(query)
	if c.client == nil || key == "" || len(data) == 0 || len(data) > maxEntrySize {
		return
	}
	operationCtx, cancel := context.WithTimeout(ctx, operationTimeout)
	defer cancel()
	if err := c.client.Set(operationCtx, key, data, searchTTL).Err(); err != nil {
		c.logger.Warn("cache write failed", "error", err)
	}
}

func (c *Cache) GetListingSummary(ctx context.Context, id string) (model.ListingSummary, bool) {
	if c.client == nil || id == "" {
		return model.ListingSummary{}, false
	}
	operationCtx, cancel := context.WithTimeout(ctx, operationTimeout)
	defer cancel()
	data, err := c.client.Get(operationCtx, listingKey(id)).Bytes()
	if err != nil {
		return model.ListingSummary{}, false
	}
	var summary model.ListingSummary
	if err := json.Unmarshal(data, &summary); err != nil {
		_ = c.client.Del(operationCtx, listingKey(id)).Err()
		return model.ListingSummary{}, false
	}
	return summary, true
}

func (c *Cache) SetListingSummary(ctx context.Context, id string, value model.ListingSummary) {
	data, err := json.Marshal(value)
	if err != nil {
		c.logger.Warn("listing summary cache encoding failed", "error", err)
		return
	}
	if c.client == nil || id == "" || len(data) == 0 || len(data) > maxEntrySize {
		return
	}
	operationCtx, cancel := context.WithTimeout(ctx, operationTimeout)
	defer cancel()
	if err := c.client.Set(operationCtx, listingKey(id), data, listingTTL).Err(); err != nil {
		c.logger.Warn("listing summary cache write failed", "error", err)
	}
}

func queryKey(query string) string {
	query = strings.ToLower(strings.Join(strings.Fields(query), " "))
	if query == "" {
		return ""
	}
	sum := sha256.Sum256([]byte(query))
	// Bump when the cached Product payload gains searchable facets.
	return fmt.Sprintf("999scraper:search:v8:%x", sum)
}

func listingKey(id string) string {
	sum := sha256.Sum256([]byte(id))
	return fmt.Sprintf("999scraper:listing-summary:v1:%x", sum)
}
