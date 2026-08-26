package searchfilter

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"unicode"

	"github.com/andi/999scraper/internal/model"
)

var ErrInvalid = errors.New("invalid saved search filters")

type Filters struct {
	SmartCleanup                                                                          bool
	ExcludeNegotiable                                                                     bool
	OnlyWithPhotos                                                                        bool
	OnlyWithVIN                                                                           bool
	Categories                                                                            []string
	ExcludedWords                                                                         []string
	QueryExclusions                                                                       []string
	YearFrom, YearTo                                                                      *float64
	PriceMin, PriceMax                                                                    *float64
	PriceCurrency                                                                         *int
	Fuel, Transmission                                                                    []string
	GenerationFrom, GenerationTo                                                          *float64
	StorageFrom, StorageTo                                                                *float64
	RAMFrom, RAMTo                                                                        *float64
	RoomsFrom, RoomsTo                                                                    *float64
	AreaFrom, AreaTo                                                                      *float64
	FloorFrom, FloorTo                                                                    *float64
	PropertySector, PropertyState, HousingStock, ListingAuthor, BuildingType              []string
	ScreenFrom, ScreenTo                                                                  *float64
	MileageFrom, MileageTo                                                                *float64
	PowerFrom, PowerTo                                                                    *float64
	Drivetrain, BodyType, Registration, OriginCountry, DeviceTags, Condition, ListingMode []string
	QualityMin                                                                            int
}

func Decode(value string) (Filters, error) {
	if value == "" {
		return Filters{}, nil
	}
	if len(value) > 8000 {
		return Filters{}, ErrInvalid
	}
	payload, err := base64.RawURLEncoding.DecodeString(value)
	if err != nil {
		return Filters{}, ErrInvalid
	}
	var fields []json.RawMessage
	if err := json.Unmarshal(payload, &fields); err != nil || len(fields) == 0 {
		return Filters{}, ErrInvalid
	}
	var version int
	if json.Unmarshal(fields[0], &version) != nil || version < 1 || version > 5 {
		return Filters{}, ErrInvalid
	}
	want := map[int]int{1: 44, 2: 44, 3: 45, 4: 46, 5: 47}[version]
	if len(fields) != want {
		return Filters{}, ErrInvalid
	}
	var result Filters
	if err := decode(fields, 2, &result.SmartCleanup); err != nil ||
		decode(fields, 3, &result.ExcludeNegotiable) != nil ||
		decode(fields, 4, &result.OnlyWithPhotos) != nil {
		return Filters{}, ErrInvalid
	}
	if result.ExcludedWords, err = stringsAt(fields, 5, version == 1); err != nil {
		return Filters{}, ErrInvalid
	}
	if result.QueryExclusions, err = stringsAt(fields, 6, version == 1); err != nil {
		return Filters{}, ErrInvalid
	}
	for index, target := range map[int]**float64{
		7: &result.YearFrom, 8: &result.YearTo, 9: &result.PriceMin, 10: &result.PriceMax,
		14: &result.GenerationFrom, 15: &result.GenerationTo, 16: &result.StorageFrom, 17: &result.StorageTo,
		18: &result.RAMFrom, 19: &result.RAMTo, 20: &result.RoomsFrom, 21: &result.RoomsTo,
		22: &result.AreaFrom, 23: &result.AreaTo, 24: &result.FloorFrom, 25: &result.FloorTo,
		31: &result.ScreenFrom, 32: &result.ScreenTo, 33: &result.MileageFrom, 34: &result.MileageTo,
		35: &result.PowerFrom, 36: &result.PowerTo,
	} {
		if *target, err = numberAt(fields, index); err != nil {
			return Filters{}, ErrInvalid
		}
	}
	if result.PriceCurrency, err = intAt(fields, 11); err != nil ||
		(result.PriceCurrency != nil && (*result.PriceCurrency < 0 || *result.PriceCurrency > 2)) {
		return Filters{}, ErrInvalid
	}
	for index, target := range map[int]*[]string{
		12: &result.Fuel, 13: &result.Transmission, 26: &result.PropertySector, 27: &result.PropertyState,
		28: &result.HousingStock, 29: &result.ListingAuthor, 30: &result.BuildingType,
		37: &result.Drivetrain, 38: &result.BodyType, 39: &result.Registration, 40: &result.OriginCountry,
		41: &result.DeviceTags, 42: &result.Condition, 43: &result.ListingMode,
	} {
		if *target, err = stringsAt(fields, index, version == 1 && index != 41); err != nil {
			return Filters{}, ErrInvalid
		}
	}
	if version >= 3 && decode(fields, 44, &result.OnlyWithVIN) != nil {
		return Filters{}, ErrInvalid
	}
	if version >= 4 && decode(fields, 45, &result.QualityMin) != nil {
		return Filters{}, ErrInvalid
	}
	if version >= 5 {
		if result.Categories, err = stringsAt(fields, 46, false); err != nil {
			return Filters{}, ErrInvalid
		}
	}
	if !slices.Contains([]int{0, 5, 7, 9}, result.QualityMin) {
		return Filters{}, ErrInvalid
	}
	return result, nil
}

func Apply(query, encoded string, products []model.Product, rates map[string]float64) ([]model.Product, error) {
	filters, err := Decode(encoded)
	if err != nil {
		return nil, err
	}
	queryWords := words(query)
	evChargerSearch := isEVChargerQuery(query)
	vehicleSearch := false
	if !evChargerSearch {
		for _, product := range products {
			if product.Make != "" && product.Model != "" && containsAll(words(product.Title), queryWords) {
				vehicleSearch = true
				break
			}
		}
	}
	seen := make(map[string]struct{}, len(products))
	result := make([]model.Product, 0, len(products))
	for _, product := range products {
		titleWords := words(product.Title)
		if filters.SmartCleanup {
			signature := fmt.Sprintf("%s|%v|%d", strings.Join(titleWords, " "), product.Price, product.Currency)
			if product.IsBoosted || wanted(product) || !smartSearchMatch(product, titleWords, queryWords, evChargerSearch) {
				continue
			}
			if _, duplicate := seen[signature]; duplicate {
				continue
			}
			if vehicleSearch && !plausibleVehicle(product, titleWords, rates) {
				continue
			}
			seen[signature] = struct{}{}
		}
		if !matches(filters, product, rates) {
			continue
		}
		result = append(result, product)
	}
	return result, nil
}

func smartSearchMatch(product model.Product, titleWords, queryWords []string, evChargerSearch bool) bool {
	if evChargerSearch {
		return isEVChargerProduct(product)
	}
	return containsAll(titleWords, queryWords)
}

func matches(filters Filters, product model.Product, rates map[string]float64) bool {
	if !inRange(number(product.Year), filters.YearFrom, filters.YearTo) ||
		!inRange(number(product.Mileage), filters.MileageFrom, filters.MileageTo) ||
		!inRange(number(product.Power), filters.PowerFrom, filters.PowerTo) {
		return false
	}
	if !anyChoice(product.Fuel, filters.Fuel) || !anyChoice(product.Transmission, filters.Transmission) ||
		!anyChoice(product.Drivetrain, filters.Drivetrain) || !anyChoice(product.BodyType, filters.BodyType) ||
		!anyFacet(product.OriginCountry, filters.OriginCountry) || !anyFacet(product.Sector, filters.PropertySector) ||
		!anyFacet(product.PropertyState, filters.PropertyState) || !anyFacet(product.HousingStock, filters.HousingStock) ||
		!anyFacet(product.ListingAuthor, filters.ListingAuthor) || !anyFacet(product.BuildingType, filters.BuildingType) ||
		!anyFacet(product.Category, filters.Categories) {
		return false
	}
	if len(filters.Registration) > 0 && !slices.ContainsFunc(filters.Registration, func(choice string) bool {
		actual := fold(product.Registration)
		return choice == "moldova" && actual == "republica moldova" || choice == "other" && actual != "" && actual != "republica moldova"
	}) {
		return false
	}
	if len(filters.Condition) > 0 && !slices.ContainsFunc(filters.Condition, func(choice string) bool { return conditionMatches(product, choice) }) {
		return false
	}
	if len(filters.ListingMode) > 0 && !slices.ContainsFunc(filters.ListingMode, func(choice string) bool { return offerMatches(product.OfferType, choice) }) {
		return false
	}
	if !inRange(parsedNumber(product.Rooms, product.Title), filters.RoomsFrom, filters.RoomsTo) ||
		!inRange(parsedNumber(product.Area, product.Title), filters.AreaFrom, filters.AreaTo) ||
		!inRange(parsedNumber(product.Floor, ""), filters.FloorFrom, filters.FloorTo) ||
		!inRange(parsedNumber(product.Screen, product.Title), filters.ScreenFrom, filters.ScreenTo) ||
		!inRange(parsedStorage(product.Storage+" "+product.Title), filters.StorageFrom, filters.StorageTo) ||
		!inRange(parsedRAM(product.RAM+" "+product.Title), filters.RAMFrom, filters.RAMTo) ||
		!inRange(parsedGeneration(product.DeviceModel+" "+product.Title), filters.GenerationFrom, filters.GenerationTo) {
		return false
	}
	searchable := fold(product.DeviceModel + " " + product.Title)
	for _, tag := range filters.DeviceTags {
		if !strings.Contains(searchable, fold(tag)) {
			return false
		}
	}
	if filters.PriceMin != nil || filters.PriceMax != nil {
		price := convertedPrice(product, filters.PriceCurrency, rates)
		if !inRange(price, filters.PriceMin, filters.PriceMax) {
			return false
		}
	}
	if filters.ExcludeNegotiable && product.Price == nil || filters.OnlyWithPhotos && product.ThumbnailURL == "" ||
		filters.OnlyWithVIN && product.VIN == "" || filters.QualityMin > 0 && qualityScore(product) < filters.QualityMin {
		return false
	}
	title := " " + strings.Join(words(product.Title), " ") + " "
	for _, phrase := range append(filters.ExcludedWords, filters.QueryExclusions...) {
		if strings.Contains(title, " "+strings.Join(words(phrase), " ")+" ") {
			return false
		}
	}
	return true
}

var (
	numberPattern     = regexp.MustCompile(`-?\d+(?:[.,]\d+)?`)
	storagePattern    = regexp.MustCompile(`(?i)\b(\d{2,4})\s*(gb|g|tb)\b`)
	ramPattern        = regexp.MustCompile(`(?i)(?:ram\s*)?(\d{1,3})\s*gb|ram\s*(\d{1,3})`)
	generationPattern = regexp.MustCompile(`(?i)(?:iphone\s*|playstation\s*|ps)(\d{1,2})`)
	wordPattern       = regexp.MustCompile(`[\p{L}\p{N}]+`)
	vehicleNoise      = map[string]struct{}{
		"accesorii": {}, "acumulator": {}, "baterie": {}, "cheie": {}, "faruri": {}, "huse": {}, "jante": {},
		"piese": {}, "reparatie": {}, "service": {}, "anvelope": {}, "radiator": {}, "chirie": {}, "inchiriere": {},
		"запчасти": {}, "ремонт": {}, "аренда": {},
	}
)

func isEVChargerQuery(query string) bool {
	value := " " + strings.Join(words(query), " ") + " "
	for _, phrase := range []string{
		" evse ", " wallbox ", " nacs ", " chademo ", " ccs ", " ccs2 ", " gb t ", " incarcator ", " incarcatoare ",
		" incarcare auto ", " statie de incarcare ", " charging station ", " charging cable ", " ev charger ",
		" type 1 ", " type 2 ", " tip 1 ", " tip 2 ",
	} {
		if strings.Contains(value, phrase) {
			return true
		}
	}
	return false
}

func isEVChargerProduct(product model.Product) bool {
	if strings.Trim(product.CategoryURL, "/") != "" {
		return strings.Trim(product.CategoryURL, "/") == "transport/chargers-for-cars"
	}
	category := strings.Join(words(product.Category), " ")
	if category != "" {
		return strings.Contains(category, "incarcatoare auto") || strings.Contains(category, "incarcatoare pentru masini electrice")
	}
	title := " " + strings.Join(words(product.Title), " ") + " "
	if strings.Contains(title, " evse ") || strings.Contains(title, " wallbox ") {
		return true
	}
	hasProductWord := false
	for _, word := range []string{" incarcator ", " statie ", " cablu ", " adaptor "} {
		if strings.Contains(title, word) {
			hasProductWord = true
			break
		}
	}
	if !hasProductWord {
		return false
	}
	for _, marker := range []string{" ev ", " electric ", " tesla ", " nacs ", " chademo ", " ccs ", " ccs2 ", " gb t ", " type 1 ", " type 2 ", " tip 1 ", " tip 2 "} {
		if strings.Contains(title, marker) {
			return true
		}
	}
	return false
}

func plausibleVehicle(product model.Product, title []string, rates map[string]float64) bool {
	if product.Make == "" || product.Model == "" || product.Year == 0 || product.Price == nil || wanted(product) {
		return false
	}
	for _, word := range title {
		if _, noisy := vehicleNoise[word]; noisy {
			return false
		}
	}
	price := convertedPrice(product, intPointer(1), rates)
	return price != nil && *price >= 300
}

func wanted(product model.Product) bool {
	text := " " + strings.Join(words(product.OfferType+" "+product.Category+" "+product.Title), " ") + " "
	for _, phrase := range []string{"cumpar", "cumparare", "achizitionez", "wanted", "buying", "куплю", "купим"} {
		if strings.Contains(text, " "+phrase+" ") {
			return true
		}
	}
	return strings.Contains(text, " dezm") || strings.Contains(text, " zapчаст")
}

func qualityScore(product model.Product) int {
	if wanted(product) {
		return 1
	}
	score := 1
	if len(words(product.Title)) >= 3 {
		score++
	}
	if product.Price != nil {
		score++
	}
	if product.ThumbnailURL != "" {
		score++
	}
	if product.ImageCount >= 4 {
		score++
	}
	if product.DescriptionUsefulWordCount >= 15 {
		score++
	}
	if product.DescriptionUsefulWordCount >= 40 {
		score++
	}
	if product.Make != "" || product.Brand != "" || product.Area != "" {
		score++
	}
	if product.Model != "" || product.DeviceModel != "" || product.Rooms != "" {
		score++
	}
	if product.VIN != "" || product.Year != 0 || product.Condition != "" {
		score++
	}
	return min(score, 10)
}

func convertedPrice(product model.Product, target *int, rates map[string]float64) *float64 {
	if product.Price == nil {
		return nil
	}
	value := float64(*product.Price)
	if target == nil || *target == product.Currency {
		return &value
	}
	codes := []string{"MDL", "EUR", "USD"}
	if product.Currency < 0 || product.Currency >= len(codes) || *target < 0 || *target >= len(codes) {
		return nil
	}
	source, targetRate := rates[codes[product.Currency]], rates[codes[*target]]
	if source <= 0 || targetRate <= 0 {
		return nil
	}
	value = value * source / targetRate
	return &value
}

func anyChoice(value string, choices []string) bool {
	if len(choices) == 0 {
		return true
	}
	actual := fold(value)
	return slices.ContainsFunc(choices, func(choice string) bool {
		choice = fold(choice)
		switch choice {
		case "benzina":
			return strings.Contains(actual, "benzina") && !strings.Contains(actual, "hybrid")
		case "gaz":
			return strings.Contains(actual, "gaz")
		case "hybrid":
			return strings.Contains(actual, "hybrid")
		default:
			return strings.Contains(actual, choice)
		}
	})
}

func anyFacet(value string, choices []string) bool {
	if len(choices) == 0 {
		return true
	}
	actual := strings.TrimSpace(fold(value))
	return slices.ContainsFunc(choices, func(choice string) bool {
		expected := strings.TrimSpace(fold(choice))
		return actual != "" && expected != "" && (strings.Contains(actual, expected) || strings.Contains(expected, actual))
	})
}

func conditionMatches(product model.Product, expected string) bool {
	value := " " + strings.Join(words(product.Condition+" "+product.Title), " ") + " "
	used := containsOne(value, "uzat", "folosit", "rulaj", "used", "second hand", "pre owned", "б у")
	if expected == "used" {
		return used
	}
	return !used && containsOne(value, "nou", "noua", "new", "sigilat", "sealed", "нов")
}

func offerMatches(value, expected string) bool {
	normalized := fold(value)
	if expected == "daily" {
		return containsOne(normalized, "pe zi", "pe noapte", "daily", "short term", "сут")
	}
	if expected == "monthly" {
		return containsOne(normalized, "inchiri", "chirie", "monthly", "long term", "аренд", "сда") && !offerMatches(value, "daily")
	}
	return containsOne(normalized, "vand", "vanzare", "sale", "sell", "прод")
}

func inRange(value, from, to *float64) bool {
	if from == nil && to == nil {
		return true
	}
	return value != nil && (from == nil || *value >= *from) && (to == nil || *value <= *to)
}

func number(value int) *float64 {
	if value == 0 {
		return nil
	}
	result := float64(value)
	return &result
}

func parsedNumber(values ...string) *float64 {
	match := numberPattern.FindString(strings.Join(values, " "))
	if match == "" {
		return nil
	}
	value, err := strconv.ParseFloat(strings.ReplaceAll(match, ",", "."), 64)
	if err != nil {
		return nil
	}
	return &value
}

func parsedStorage(value string) *float64 {
	match := storagePattern.FindStringSubmatch(value)
	if len(match) == 0 {
		return nil
	}
	amount, _ := strconv.ParseFloat(match[1], 64)
	if strings.EqualFold(match[2], "tb") {
		amount *= 1024
	}
	return &amount
}

func parsedRAM(value string) *float64 {
	match := ramPattern.FindStringSubmatch(value)
	if len(match) == 0 {
		return nil
	}
	return parsedNumber(match[1], match[2])
}

func parsedGeneration(value string) *float64 {
	match := generationPattern.FindStringSubmatch(value)
	if len(match) == 0 {
		return nil
	}
	return parsedNumber(match[1])
}

func containsAll(haystack, needles []string) bool {
	for _, needle := range needles {
		if !slices.Contains(haystack, needle) {
			return false
		}
	}
	return true
}

func containsOne(value string, choices ...string) bool {
	return slices.ContainsFunc(choices, func(choice string) bool { return strings.Contains(value, fold(choice)) })
}

func words(value string) []string { return wordPattern.FindAllString(fold(value), -1) }

func fold(value string) string {
	value = strings.ToLower(value)
	value = strings.NewReplacer("ă", "a", "â", "a", "î", "i", "ș", "s", "ş", "s", "ț", "t", "ţ", "t").Replace(value)
	return strings.Map(func(r rune) rune {
		if unicode.Is(unicode.Mn, r) {
			return -1
		}
		return r
	}, value)
}

func intPointer(value int) *int { return &value }

func decode[T any](fields []json.RawMessage, index int, target *T) error {
	if index >= len(fields) {
		return ErrInvalid
	}
	return json.Unmarshal(fields[index], target)
}

func numberAt(fields []json.RawMessage, index int) (*float64, error) {
	if index >= len(fields) {
		return nil, ErrInvalid
	}
	if string(fields[index]) == "null" {
		return nil, nil
	}
	var value float64
	if json.Unmarshal(fields[index], &value) != nil {
		return nil, ErrInvalid
	}
	return &value, nil
}

func intAt(fields []json.RawMessage, index int) (*int, error) {
	number, err := numberAt(fields, index)
	if err != nil || number == nil {
		return nil, err
	}
	value := int(*number)
	if float64(value) != *number {
		return nil, ErrInvalid
	}
	return &value, nil
}

func stringsAt(fields []json.RawMessage, index int, legacy bool) ([]string, error) {
	if index >= len(fields) || string(fields[index]) == "null" {
		return nil, nil
	}
	var values []string
	if legacy {
		var value string
		if json.Unmarshal(fields[index], &value) != nil {
			return nil, ErrInvalid
		}
		if value != "" {
			values = []string{value}
		}
	} else if json.Unmarshal(fields[index], &values) != nil {
		return nil, ErrInvalid
	}
	if len(values) > 30 || slices.ContainsFunc(values, func(value string) bool { return len(value) > 100 }) {
		return nil, ErrInvalid
	}
	return values, nil
}
