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

type Preferences struct {
	ExcludedWords []string `json:"excludedWords"`
}

type SavedListing struct {
	Product Product   `json:"product"`
	SavedAt time.Time `json:"savedAt"`
}

type Product struct {
	ID            string `json:"id"`
	Title         string `json:"title"`
	ThumbnailURL  string `json:"thumbnailURL"`
	Price         *int   `json:"price"`
	PriceString   string `json:"priceString,omitempty"`
	OfferType     string `json:"offerType,omitempty"`
	Currency      int    `json:"currency"`
	IsBoosted     bool   `json:"isBoosted"`
	Year          int    `json:"year,omitempty"`
	Make          string `json:"make,omitempty"`
	Model         string `json:"model,omitempty"`
	Fuel          string `json:"fuel,omitempty"`
	Transmission  string `json:"transmission,omitempty"`
	BodyType      string `json:"bodyType,omitempty"`
	Mileage       int    `json:"mileage,omitempty"`
	Power         int    `json:"power,omitempty"`
	Drivetrain    string `json:"drivetrain,omitempty"`
	Registration  string `json:"registration,omitempty"`
	DeviceModel   string `json:"deviceModel,omitempty"`
	Storage       string `json:"storage,omitempty"`
	Brand         string `json:"brand,omitempty"`
	RAM           string `json:"ram,omitempty"`
	Processor     string `json:"processor,omitempty"`
	GPU           string `json:"gpu,omitempty"`
	Screen        string `json:"screen,omitempty"`
	Resolution    string `json:"resolution,omitempty"`
	OS            string `json:"os,omitempty"`
	Rooms         string `json:"rooms,omitempty"`
	Area          string `json:"area,omitempty"`
	Floor         string `json:"floor,omitempty"`
	PropertyState string `json:"propertyState,omitempty"`
	BuildingType  string `json:"buildingType,omitempty"`
	Category      string `json:"category,omitempty"`
	Condition     string `json:"condition,omitempty"`
	URLToProduct  string `json:"urlToProduct"`
}

type ProductsContainer struct {
	Products []Product `json:"products"`
}
