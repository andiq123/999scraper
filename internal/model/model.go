package model

import "time"

type Account struct {
	ID        string    `json:"id"`
	CreatedAt time.Time `json:"createdAt"`
}

type Session struct {
	ID string `json:"id"`
}

type Registration struct {
	Code string `json:"code"`
}

type SearchHistory struct {
	ID         string    `json:"id"`
	Query      string    `json:"query"`
	SearchedAt time.Time `json:"searchedAt"`
}

type Product struct {
	ID           string `json:"id"`
	Title        string `json:"title"`
	ThumbnailURL string `json:"thumbnailURL"`
	Price        *int   `json:"price"`
	PriceString  string `json:"priceString,omitempty"`
	Currency     int    `json:"currency"`
	IsBoosted    bool   `json:"isBoosted"`
	Year         int    `json:"year,omitempty"`
	Make         string `json:"make,omitempty"`
	Model        string `json:"model,omitempty"`
	URLToProduct string `json:"urlToProduct"`
}

type Filters struct {
	SmartCleanup           bool     `json:"smartCleanup"`
	ExcludeBoosted         bool     `json:"excludeBoosted"`
	ExcludePriceNegotiable bool     `json:"excludePriceNegotiable"`
	ExcludeOtherAds        bool     `json:"excludeOtherAds"`
	Order                  string   `json:"order"`
	KeysToExclude          []string `json:"keysToExclude"`
	ProductSearchCriteria  string   `json:"productSearchCriteria"`
	Intent                 string   `json:"intent,omitempty"`
	YearFrom               int      `json:"yearFrom,omitempty"`
	YearTo                 int      `json:"yearTo,omitempty"`
	PriceMin               int      `json:"priceMin,omitempty"`
	PriceMax               int      `json:"priceMax,omitempty"`
	Currency               *int     `json:"currency,omitempty"`
}

type ProductsContainer struct {
	Products []Product `json:"products"`
}
