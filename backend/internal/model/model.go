package model

import "time"

type Account struct {
	ID        string    `json:"id"`
	CreatedAt time.Time `json:"createdAt"`
}

type Session struct {
	ID    string `json:"id"`
	Token string `json:"token,omitempty"`
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

type SearchSubscription struct {
	ID                 string         `json:"id"`
	Query              string         `json:"query"`
	FilterParam        string         `json:"filterParam,omitempty"`
	SearchPath         string         `json:"searchPath"`
	RecipientEmail     string         `json:"recipientEmail"`
	IntervalMinutes    int            `json:"intervalMinutes"`
	CreatedAt          time.Time      `json:"createdAt"`
	LastCheckedAt      *time.Time     `json:"lastCheckedAt,omitempty"`
	LastNotifiedAt     *time.Time     `json:"lastNotifiedAt,omitempty"`
	LastChanges        *SearchChanges `json:"lastChanges,omitempty"`
	SnapshotProductIDs []string       `json:"-"`
	SnapshotProducts   []Product      `json:"-"`
}

type SearchChanges struct {
	Added      []Product `json:"added"`
	Removed    []Product `json:"removed"`
	DetectedAt time.Time `json:"detectedAt"`
}

type Product struct {
	ID                          string   `json:"id"`
	Title                       string   `json:"title"`
	ThumbnailURL                string   `json:"thumbnailURL"`
	Price                       *int     `json:"price"`
	PriceString                 string   `json:"priceString,omitempty"`
	OfferType                   string   `json:"offerType,omitempty"`
	Currency                    int      `json:"currency"`
	IsBoosted                   bool     `json:"isBoosted"`
	Year                        int      `json:"year,omitempty"`
	Make                        string   `json:"make,omitempty"`
	Model                       string   `json:"model,omitempty"`
	Fuel                        string   `json:"fuel,omitempty"`
	Transmission                string   `json:"transmission,omitempty"`
	BodyType                    string   `json:"bodyType,omitempty"`
	Mileage                     int      `json:"mileage,omitempty"`
	Power                       int      `json:"power,omitempty"`
	Drivetrain                  string   `json:"drivetrain,omitempty"`
	Registration                string   `json:"registration,omitempty"`
	OriginCountry               string   `json:"originCountry,omitempty"`
	VIN                         string   `json:"vin,omitempty"`
	ImageCount                  int      `json:"imageCount,omitempty"`
	DescriptionWordCount        int      `json:"descriptionWordCount,omitempty"`
	DescriptionUsefulWordCount  int      `json:"descriptionUsefulWordCount"`
	DescriptionMarketingPercent int      `json:"descriptionMarketingPercent,omitempty"`
	VehicleFlags                []string `json:"vehicleFlags,omitempty"`
	DeviceModel                 string   `json:"deviceModel,omitempty"`
	Storage                     string   `json:"storage,omitempty"`
	Brand                       string   `json:"brand,omitempty"`
	RAM                         string   `json:"ram,omitempty"`
	Processor                   string   `json:"processor,omitempty"`
	GPU                         string   `json:"gpu,omitempty"`
	Screen                      string   `json:"screen,omitempty"`
	Resolution                  string   `json:"resolution,omitempty"`
	OS                          string   `json:"os,omitempty"`
	Rooms                       string   `json:"rooms,omitempty"`
	Area                        string   `json:"area,omitempty"`
	Sector                      string   `json:"sector,omitempty"`
	HousingStock                string   `json:"housingStock,omitempty"`
	ListingAuthor               string   `json:"listingAuthor,omitempty"`
	Floor                       string   `json:"floor,omitempty"`
	PropertyState               string   `json:"propertyState,omitempty"`
	BuildingType                string   `json:"buildingType,omitempty"`
	Category                    string   `json:"category,omitempty"`
	Condition                   string   `json:"condition,omitempty"`
	URLToProduct                string   `json:"urlToProduct"`
}

type ProductsContainer struct {
	Products []Product `json:"products"`
}

// ListingSummary is a compact, LLM-friendly view of a public 999.md listing.
// Details preserves the marketplace's labelled fields while omitting empty and
// unchecked values.
type ListingSummary struct {
	Source      string                    `json:"source"`
	RetrievedAt time.Time                 `json:"retrievedAt"`
	Listing     ListingSummaryListing     `json:"listing"`
	Description string                    `json:"description,omitempty"`
	Details     map[string]map[string]any `json:"details,omitempty"`
	Images      []string                  `json:"images,omitempty"`
	Contacts    map[string]any            `json:"contacts,omitempty"`
}

type ListingSummaryListing struct {
	ID       string `json:"id"`
	URL      string `json:"url"`
	Title    string `json:"title"`
	Status   string `json:"status,omitempty"`
	Category string `json:"category,omitempty"`
	Seller   string `json:"seller,omitempty"`
}
