package cache

import (
	"context"
	"crypto/sha256"
	"encoding/json"
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
	searchTTL    = 5 * time.Minute
	maxEntrySize = 4 << 20
)

func Open(ctx context.Context, rawURL string, logger *slog.Logger) *Cache {
	options, err := redis.ParseURL(rawURL)
	if err != nil {
		logger.Warn("redis disabled", "error", err)
		return &Cache{logger: logger}
	}
	client := redis.NewClient(options)
	if err := client.Ping(ctx).Err(); err != nil {
		logger.Warn("redis unavailable; continuing without cache", "error", err)
		_ = client.Close()
		return &Cache{logger: logger}
	}
	return &Cache{client: client, logger: logger}
}

func (c *Cache) Close() {
	if c.client != nil {
		_ = c.client.Close()
	}
}

func (c *Cache) GetQuery(ctx context.Context, query string) (model.ProductsContainer, bool) {
	return c.get(ctx, queryKey(query))
}

func (c *Cache) get(ctx context.Context, key string) (model.ProductsContainer, bool) {
	if c.client == nil || key == "" {
		return model.ProductsContainer{}, false
	}
	data, err := c.client.Get(ctx, key).Bytes()
	if err != nil {
		return model.ProductsContainer{}, false
	}
	var result model.ProductsContainer
	if err := json.Unmarshal(data, &result); err != nil {
		_ = c.client.Del(ctx, key).Err()
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
	if err := c.client.Set(ctx, key, data, searchTTL).Err(); err != nil {
		c.logger.Warn("cache write failed", "error", err)
	}
}

func queryKey(query string) string {
	query = strings.ToLower(strings.Join(strings.Fields(query), " "))
	if query == "" {
		return ""
	}
	sum := sha256.Sum256([]byte(query))
	return fmt.Sprintf("search-query:v5:%x", sum)
}
