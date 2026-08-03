package model

import "time"

type User struct {
	ID           string    `json:"id"`
	Username     string    `json:"username"`
	Email        string    `json:"email"`
	PasswordHash string    `json:"-"`
	IsAdmin      bool      `json:"isAdmin"`
	IsBanned     bool      `json:"isBanned"`
	LastActive   time.Time `json:"lastActive"`
}

type UserResponse struct {
	ID         string    `json:"id"`
	Username   string    `json:"username"`
	Email      string    `json:"email"`
	Token      string    `json:"token,omitempty"`
	IsAdmin    bool      `json:"isAdmin"`
	IsBanned   bool      `json:"isBanned"`
	LastActive time.Time `json:"lastActive"`
}

func (u User) Response(token string) UserResponse {
	return UserResponse{u.ID, u.Username, u.Email, token, u.IsAdmin, u.IsBanned, u.LastActive}
}

type Activity struct {
	ID          string    `json:"id"`
	DateTime    time.Time `json:"dateTime"`
	Description string    `json:"description"`
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
	RedisID                string   `json:"redisId"`
	ProductSearchCriteria  string   `json:"productSearchCriteria"`
}

type ProductsContainer struct {
	ID       string    `json:"id"`
	Products []Product `json:"products"`
}
