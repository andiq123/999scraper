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

const searchTTL = 5 * time.Minute

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

func (c *Cache) Get(ctx context.Context, id string) (model.ProductsContainer, bool) {
	if id == "" {
		return model.ProductsContainer{}, false
	}
	return c.get(ctx, "search:"+id)
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
	if json.Unmarshal(data, &result) != nil {
		return model.ProductsContainer{}, false
	}
	return result, true
}

func (c *Cache) Set(ctx context.Context, value model.ProductsContainer) {
	c.set(ctx, map[string][]byte{"search:" + value.ID: marshal(value)})
}

func (c *Cache) SetSearch(ctx context.Context, query string, value model.ProductsContainer) {
	data := marshal(value)
	c.set(ctx, map[string][]byte{
		"search:" + value.ID: data,
		queryKey(query):      data,
	})
}

func marshal(value model.ProductsContainer) []byte {
	data, _ := json.Marshal(value)
	return data
}

func (c *Cache) set(ctx context.Context, values map[string][]byte) {
	if c.client == nil {
		return
	}
	pipe := c.client.Pipeline()
	for key, data := range values {
		if key != "" && len(data) > 0 {
			pipe.Set(ctx, key, data, searchTTL)
		}
	}
	if _, err := pipe.Exec(ctx); err != nil {
		c.logger.Warn("cache write failed", "error", err)
	}
}

func queryKey(query string) string {
	query = strings.ToLower(strings.Join(strings.Fields(query), " "))
	if query == "" {
		return ""
	}
	sum := sha256.Sum256([]byte(query))
	return fmt.Sprintf("search-query:%x", sum)
}
