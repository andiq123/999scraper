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
	Description  string `json:"description"`
	Price        *int   `json:"price"`
	PriceString  string `json:"priceString,omitempty"`
	Currency     int    `json:"currency"`
	IsBoosted    bool   `json:"isBoosted"`
	URLToProduct string `json:"urlToProduct"`
	IsGood       bool   `json:"isGood"`
}

type Filters struct {
	ExcludeBoosted         bool     `json:"excludeBoosted"`
	ExcludePriceNegotiable bool     `json:"excludePriceNegotiable"`
	ExcludeOtherAds        bool     `json:"excludeOtherAds"`
	Order                  string   `json:"order"`
	KeysToExclude          []string `json:"keysToExclude"`
	ProductSearchCriteria  string   `json:"productSearchCriteria"`
}

type ProductsContainer struct {
	ID       string    `json:"id"`
	Products []Product `json:"products"`
}
