package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

const (
	vinCacheLifetime = 24 * time.Hour
	vinCacheMaxItems = 512
)

type vinResearchEvent struct {
	Type    string      `json:"type"`
	VIN     string      `json:"vin,omitempty"`
	Message string      `json:"message,omitempty"`
	Vehicle *vinVehicle `json:"vehicle,omitempty"`
}

type vinVehicle struct {
	Make                 string `json:"make,omitempty"`
	Model                string `json:"model,omitempty"`
	ModelYear            string `json:"modelYear,omitempty"`
	Manufacturer         string `json:"manufacturer,omitempty"`
	VehicleType          string `json:"vehicleType,omitempty"`
	BodyClass            string `json:"bodyClass,omitempty"`
	Series               string `json:"series,omitempty"`
	Trim                 string `json:"trim,omitempty"`
	DriveType            string `json:"driveType,omitempty"`
	FuelTypePrimary      string `json:"fuelTypePrimary,omitempty"`
	ElectrificationLevel string `json:"electrificationLevel,omitempty"`
	EngineCylinders      string `json:"engineCylinders,omitempty"`
	DisplacementL        string `json:"displacementL,omitempty"`
	TransmissionStyle    string `json:"transmissionStyle,omitempty"`
	PlantCountry         string `json:"plantCountry,omitempty"`
	ErrorCode            string `json:"errorCode,omitempty"`
	ErrorText            string `json:"errorText,omitempty"`
}

type cachedVIN struct {
	vehicle   vinVehicle
	expiresAt time.Time
}

type vinDecoder struct {
	client  *http.Client
	mu      sync.Mutex
	entries map[string]cachedVIN
}

func newVINDecoder() *vinDecoder {
	return &vinDecoder{
		client:  &http.Client{Timeout: 9 * time.Second},
		entries: make(map[string]cachedVIN),
	}
}

func (a *API) vinResearchStream(w http.ResponseWriter, r *http.Request) {
	vin := normalizeVIN(r.PathValue("vin"))
	if vin == "" {
		writeError(w, http.StatusBadRequest, "enter a valid 17-character VIN")
		return
	}
	if !a.vinChecks.allow(clientAddress(r), time.Now()) {
		w.Header().Set("Retry-After", "60")
		writeError(w, http.StatusTooManyRequests, "too many VIN research requests; try again shortly")
		return
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, http.StatusInternalServerError, "streaming is unavailable")
		return
	}

	writer := beginStream(w, flusher)
	if err := writer.writeEvent("start", vinResearchEvent{Type: "start", VIN: vin, Message: "Decoding vehicle identity"}); err != nil {
		return
	}
	vehicle, err := a.vinDecoder.decode(r.Context(), vin)
	if err != nil {
		if !errors.Is(err, r.Context().Err()) {
			a.logger.Warn("NHTSA VIN decode failed", "error", err)
			_ = writer.writeEvent("warning", vinResearchEvent{Type: "warning", VIN: vin, Message: "Official vehicle identity is temporarily unavailable."})
		}
		_ = writer.writeEvent("done", vinResearchEvent{Type: "done", VIN: vin, Message: "Vehicle identity unavailable"})
		return
	}
	if err := writer.writeEvent("vehicle", vinResearchEvent{Type: "vehicle", VIN: vin, Vehicle: &vehicle}); err != nil {
		return
	}
	_ = writer.writeEvent("done", vinResearchEvent{Type: "done", VIN: vin, Message: "Vehicle identity decoded"})
}

func (d *vinDecoder) decode(ctx context.Context, vin string) (vinVehicle, error) {
	now := time.Now()
	d.mu.Lock()
	if cached, ok := d.entries[vin]; ok && now.Before(cached.expiresAt) {
		d.mu.Unlock()
		return cached.vehicle, nil
	}
	d.mu.Unlock()

	endpoint := "https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/" + url.PathEscape(vin) + "?format=json"
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return vinVehicle{}, err
	}
	request.Header.Set("Accept", "application/json")
	request.Header.Set("User-Agent", "999-Market-VIN-Research/1.0")
	response, err := d.client.Do(request)
	if err != nil {
		return vinVehicle{}, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return vinVehicle{}, fmt.Errorf("NHTSA returned status %d", response.StatusCode)
	}
	var payload struct {
		Results []vinVehicle `json:"Results"`
	}
	if err := json.NewDecoder(io.LimitReader(response.Body, 1<<20)).Decode(&payload); err != nil {
		return vinVehicle{}, err
	}
	if len(payload.Results) != 1 {
		return vinVehicle{}, errors.New("NHTSA returned no vehicle")
	}

	vehicle := payload.Results[0]
	d.mu.Lock()
	if len(d.entries) >= vinCacheMaxItems {
		for key := range d.entries {
			delete(d.entries, key)
			break
		}
	}
	d.entries[vin] = cachedVIN{vehicle: vehicle, expiresAt: now.Add(vinCacheLifetime)}
	d.mu.Unlock()
	return vehicle, nil
}

func normalizeVIN(value string) string {
	vin := strings.ToUpper(strings.TrimSpace(value))
	if len(vin) != 17 {
		return ""
	}
	for _, character := range vin {
		if character < '0' || character > 'Z' || (character > '9' && character < 'A') || character == 'I' || character == 'O' || character == 'Q' {
			return ""
		}
	}
	return vin
}
