package currency

import (
	"context"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sync"
	"time"
)

const sourceURL = "https://www.bnm.md/en/official_exchange_rates"

type Rates struct {
	Date   string             `json:"date"`
	Source string             `json:"source"`
	Values map[string]float64 `json:"values"`
}

type Service struct {
	mu      sync.Mutex
	client  *http.Client
	cached  Rates
	expires time.Time
}

type response struct {
	Date    string `xml:"Date,attr"`
	Valutes []struct {
		Code    string  `xml:"CharCode"`
		Nominal float64 `xml:"Nominal"`
		Value   float64 `xml:"Value"`
	} `xml:"Valute"`
}

func New() *Service {
	return &Service{client: &http.Client{Timeout: 8 * time.Second}}
}

func (s *Service) Latest(ctx context.Context) (Rates, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if time.Now().Before(s.expires) && len(s.cached.Values) > 0 {
		return s.cached, nil
	}
	for daysBack := 0; daysBack < 7; daysBack++ {
		date := time.Now().AddDate(0, 0, -daysBack).Format("02.01.2006")
		rates, err := s.fetch(ctx, date)
		if err == nil {
			s.cached = rates
			s.expires = time.Now().Add(6 * time.Hour)
			return rates, nil
		}
	}
	if len(s.cached.Values) > 0 {
		return s.cached, nil
	}
	return Rates{}, fmt.Errorf("official exchange rates are unavailable")
}

func (s *Service) fetch(ctx context.Context, date string) (Rates, error) {
	endpoint := sourceURL + "?date=" + url.QueryEscape(date) + "&get_xml=1"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return Rates{}, err
	}
	res, err := s.client.Do(req)
	if err != nil {
		return Rates{}, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return Rates{}, fmt.Errorf("rates service returned %s", res.Status)
	}
	var payload response
	if err := xml.NewDecoder(io.LimitReader(res.Body, 1<<20)).Decode(&payload); err != nil {
		return Rates{}, err
	}
	values := map[string]float64{"MDL": 1}
	for _, item := range payload.Valutes {
		if (item.Code == "EUR" || item.Code == "USD") && item.Nominal > 0 && item.Value > 0 {
			values[item.Code] = item.Value / item.Nominal
		}
	}
	if len(values) != 3 {
		return Rates{}, fmt.Errorf("rates response is incomplete")
	}
	return Rates{Date: payload.Date, Source: "National Bank of Moldova", Values: values}, nil
}
