package alerts

import (
	"context"
	"errors"
	"fmt"
	"html"
	"log/slog"
	"net/url"
	"strings"
	"time"

	"github.com/andi/999scraper/internal/mailer"
	"github.com/andi/999scraper/internal/model"
	"github.com/andi/999scraper/internal/scraper"
	"github.com/andi/999scraper/internal/store"
)

var (
	ErrUnavailable = errors.New("email alerts are not configured")
	ErrDelivery    = errors.New("email could not be sent")
)

const DefaultIntervalMinutes = 15

type Service struct {
	store     *store.Store
	scraper   *scraper.Scraper
	sender    *mailer.Sender
	publicURL string
	logger    *slog.Logger
}

func New(db *store.Store, searcher *scraper.Scraper, sender *mailer.Sender, publicURL string, logger *slog.Logger) *Service {
	return &Service{store: db, scraper: searcher, sender: sender, publicURL: strings.TrimRight(publicURL, "/"), logger: logger}
}

func (s *Service) Available() bool { return s.sender != nil }

func (s *Service) List(ctx context.Context, accountID string) ([]model.SearchSubscription, error) {
	return s.store.SearchSubscriptions(ctx, accountID)
}

func (s *Service) Subscribe(ctx context.Context, accountID string, subscription model.SearchSubscription) (model.SearchSubscription, error) {
	if !s.Available() {
		return model.SearchSubscription{}, ErrUnavailable
	}
	interval := time.Duration(subscription.IntervalMinutes) * time.Minute
	prepared, err := s.store.PrepareSearchSubscription(ctx, accountID, subscription, time.Now().Add(interval))
	if err != nil {
		return model.SearchSubscription{}, err
	}
	if err := s.sender.Send(ctx, prepared.RecipientEmail, "Search alerts are ready", welcomeText(prepared, interval), welcomeHTML(prepared, interval, s.searchURL(prepared.SearchPath))); err != nil {
		_ = s.store.DeletePreparedSearchSubscription(context.WithoutCancel(ctx), prepared.ID)
		s.logger.Warn("search alert confirmation failed", "subscription_id", prepared.ID, "error", err)
		return model.SearchSubscription{}, ErrDelivery
	}
	if err := s.store.ActivateSearchSubscription(ctx, prepared.ID); err != nil {
		return model.SearchSubscription{}, err
	}
	return prepared, nil
}

func (s *Service) Delete(ctx context.Context, accountID, id string) error {
	return s.store.DeleteSearchSubscription(ctx, accountID, id)
}

func (s *Service) Test(ctx context.Context, accountID, id string) error {
	if !s.Available() {
		return ErrUnavailable
	}
	items, err := s.List(ctx, accountID)
	if err != nil {
		return err
	}
	for _, item := range items {
		if item.ID != id {
			continue
		}
		searchURL := s.searchURL(item.SearchPath)
		changes := snapshotChanges{
			Added:   []model.Product{{ID: "105000001", Title: "Example new listing", PriceString: "12.500 EUR", URLToProduct: searchURL}},
			Removed: []model.Product{{ID: "104999999", Title: "Example listing that left", PriceString: "11.900 EUR", URLToProduct: searchURL}},
		}
		if err := s.sender.Send(ctx, item.RecipientEmail, "Test: search alert preview for "+item.Query, alertText(item, changes, searchURL, true), alertHTML(item, changes, searchURL, true)); err != nil {
			s.logger.Warn("search alert test failed", "subscription_id", item.ID, "error", err)
			return ErrDelivery
		}
		return nil
	}
	return store.ErrNotFound
}

func (s *Service) Run(ctx context.Context) {
	if !s.Available() {
		return
	}
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.check(ctx)
		}
	}
}

func (s *Service) check(ctx context.Context) {
	subscriptions, err := s.store.ClaimDueSearchSubscriptions(ctx, 4, 5*time.Minute)
	if err != nil {
		s.logger.Error("claim search alerts", "error", err)
		return
	}
	for _, subscription := range subscriptions {
		if ctx.Err() != nil {
			return
		}
		s.checkOne(ctx, subscription)
	}
}

func (s *Service) checkOne(ctx context.Context, subscription model.SearchSubscription) {
	interval := time.Duration(subscription.IntervalMinutes) * time.Minute
	products, err := s.scraper.SearchLatest(ctx, subscription.Query, scraper.SearchOptions{ExtractVINFromDescription: true})
	if err != nil {
		s.logger.Warn("search alert check failed", "subscription_id", subscription.ID, "error", err)
		_ = s.store.RetrySearchSubscription(context.WithoutCancel(ctx), subscription.ID, time.Now().Add(min(interval, 10*time.Minute)))
		return
	}
	if len(products) == 0 && len(subscription.SnapshotProductIDs) > 0 {
		// ponytail: an empty page is too ambiguous for a mass-removal alert; add a
		// persisted confirmation counter only if real empty searches need reporting.
		s.logger.Warn("empty search alert snapshot ignored", "subscription_id", subscription.ID)
		_ = s.store.RetrySearchSubscription(context.WithoutCancel(ctx), subscription.ID, time.Now().Add(min(interval, 10*time.Minute)))
		return
	}
	changes := compareSnapshots(subscription.SnapshotProductIDs, subscription.SnapshotProducts, products)
	notified := false
	if len(changes.Added)+len(changes.Removed) > 0 {
		if err := s.sender.Send(ctx, subscription.RecipientEmail, subject(subscription.Query, changes), alertText(subscription, changes, s.searchURL(subscription.SearchPath), false), alertHTML(subscription, changes, s.searchURL(subscription.SearchPath), false)); err != nil {
			s.logger.Warn("search alert delivery failed", "subscription_id", subscription.ID, "error", err)
			_ = s.store.RetrySearchSubscription(context.WithoutCancel(ctx), subscription.ID, time.Now().Add(min(interval, 10*time.Minute)))
			return
		}
		notified = true
	}
	if err := s.store.CompleteSearchSubscription(context.WithoutCancel(ctx), subscription.ID, products, time.Now().Add(interval), notified); err != nil {
		s.logger.Error("complete search alert check", "subscription_id", subscription.ID, "error", err)
	}
}

func (s *Service) searchURL(path string) string {
	return s.publicURL + path
}

type snapshotChanges struct {
	Added   []model.Product
	Removed []model.Product
}

func compareSnapshots(previousIDs []string, previous, current []model.Product) snapshotChanges {
	previousSet := make(map[string]struct{}, len(previousIDs))
	for _, id := range previousIDs {
		previousSet[id] = struct{}{}
	}
	currentSet := make(map[string]struct{}, len(current))
	changes := snapshotChanges{Added: make([]model.Product, 0), Removed: make([]model.Product, 0)}
	for _, product := range current {
		currentSet[product.ID] = struct{}{}
		if _, exists := previousSet[product.ID]; !exists {
			changes.Added = append(changes.Added, product)
		}
	}
	for _, product := range previous {
		if _, exists := currentSet[product.ID]; !exists {
			changes.Removed = append(changes.Removed, product)
		}
	}
	return changes
}

func subject(query string, changes snapshotChanges) string {
	if len(changes.Removed) == 0 {
		return fmt.Sprintf("%d new %s for %s", len(changes.Added), plural("listing", len(changes.Added)), query)
	}
	if len(changes.Added) == 0 {
		return fmt.Sprintf("%d %s left the latest results for %s", len(changes.Removed), plural("listing", len(changes.Removed)), query)
	}
	return fmt.Sprintf("%d search updates for %s", len(changes.Added)+len(changes.Removed), query)
}

func welcomeText(item model.SearchSubscription, interval time.Duration) string {
	return fmt.Sprintf("Search alerts are active for: %s\n\nWe will compare the latest result snapshot every %s and email you when listings enter or leave it. You can manage or stop this alert from your account.", item.Query, intervalLabel(interval))
}

func welcomeHTML(item model.SearchSubscription, interval time.Duration, searchURL string) string {
	return fmt.Sprintf(`<div style="margin:0;background:#f3f6fb;padding:32px 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#172033"><div style="max-width:600px;margin:auto;background:#fff;border:1px solid #e5eaf2;border-radius:20px;overflow:hidden"><div style="padding:30px;background:linear-gradient(135deg,#eff6ff,#f0fdfa)"><div style="color:#0f766e;font-size:12px;font-weight:800;letter-spacing:.12em">999 WATCH</div><h1 style="margin:10px 0 8px;font-size:28px;line-height:1.15">Your search is being watched</h1><p style="margin:0;color:#64748b;line-height:1.55">We’ll compare the latest results for <strong style="color:#172033">%s</strong> every %s.</p></div><div style="padding:24px 30px"><table role="presentation" style="width:100%%;border-collapse:separate;border-spacing:0 10px"><tr><td style="width:42px;height:42px;border-radius:12px;background:#dbeafe;color:#2563eb;text-align:center;font-size:22px">＋</td><td style="padding-left:12px"><strong>New listings</strong><div style="color:#64748b;font-size:13px;margin-top:3px">Know when something new reaches the latest results.</div></td></tr><tr><td style="width:42px;height:42px;border-radius:12px;background:#ffedd5;color:#c2410c;text-align:center;font-size:22px">−</td><td style="padding-left:12px"><strong>Listings that leave</strong><div style="color:#64748b;font-size:13px;margin-top:3px">They may be sold, paused, removed, or move beyond the latest page.</div></td></tr></table><a href="%s" style="display:block;margin-top:16px;padding:13px 18px;border-radius:12px;background:#2563eb;color:#fff;text-align:center;text-decoration:none;font-weight:750">Open saved search&nbsp; ↗</a><p style="margin:18px 0 0;color:#94a3b8;font-size:12px;text-align:center">Manage or stop this alert from your account at any time.</p></div></div></div>`, html.EscapeString(item.Query), html.EscapeString(intervalLabel(interval)), html.EscapeString(searchURL))
}

func alertText(item model.SearchSubscription, changes snapshotChanges, searchURL string, preview bool) string {
	var output strings.Builder
	if preview {
		output.WriteString("TEST EMAIL — your alert snapshot was not changed.\n\n")
	}
	fmt.Fprintf(&output, "%s\n\n", subject(item.Query, changes))
	if len(changes.Added) > 0 {
		fmt.Fprintln(&output, "NEW IN THE LATEST RESULTS")
		writeTextProducts(&output, changes.Added)
	}
	if len(changes.Removed) > 0 {
		fmt.Fprintln(&output, "\nLEFT THE LATEST RESULTS")
		writeTextProducts(&output, changes.Removed)
	}
	fmt.Fprintf(&output, "\nA listing may be sold, paused, removed, or move beyond the latest page.\nOpen the saved search: %s", searchURL)
	return output.String()
}

func alertHTML(item model.SearchSubscription, changes snapshotChanges, searchURL string, preview bool) string {
	var sections strings.Builder
	previewBanner := ""
	if preview {
		previewBanner = `<div style="padding:10px 16px;background:#ecfdf5;color:#047857;text-align:center;font-size:12px;font-weight:800;letter-spacing:.05em">✓ TEST EMAIL · NO ALERT DATA WAS CHANGED</div>`
	}
	if len(changes.Added) > 0 {
		sections.WriteString(emailSection("New in the latest results", "Fresh listings matching this search", "+", "#2563eb", "#dbeafe", changes.Added))
	}
	if len(changes.Removed) > 0 {
		sections.WriteString(emailSection("Left the latest results", "Possibly sold, paused, removed, or moved beyond the latest page", "−", "#c2410c", "#ffedd5", changes.Removed))
	}
	return fmt.Sprintf(`<div style="margin:0;background:#f3f6fb;padding:32px 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#172033"><div style="max-width:620px;margin:auto;background:#fff;border:1px solid #e5eaf2;border-radius:20px;overflow:hidden">%s<div style="padding:28px 30px;background:linear-gradient(135deg,#eff6ff,#f0fdfa)"><div style="color:#0f766e;font-size:12px;font-weight:800;letter-spacing:.12em">999 WATCH · SEARCH UPDATE</div><h1 style="margin:10px 0 6px;font-size:27px;line-height:1.2">%s</h1><p style="margin:0;color:#64748b">Latest snapshot for <strong style="color:#172033">%s</strong></p><div style="margin-top:18px"><span style="display:inline-block;margin-right:8px;padding:7px 11px;border-radius:999px;background:#dbeafe;color:#1d4ed8;font-size:13px;font-weight:750">＋ %d new</span><span style="display:inline-block;padding:7px 11px;border-radius:999px;background:#ffedd5;color:#c2410c;font-size:13px;font-weight:750">− %d left</span></div></div><div style="padding:8px 30px 28px">%s<a href="%s" style="display:block;margin-top:24px;padding:13px 18px;border-radius:12px;background:#2563eb;color:#fff;text-align:center;text-decoration:none;font-weight:750">Open saved search&nbsp; ↗</a><p style="margin:18px 0 0;color:#94a3b8;font-size:12px;line-height:1.5;text-align:center">Leaving the latest snapshot does not prove deletion. Rankings and pagination can also change.</p></div></div></div>`, previewBanner, html.EscapeString(subject(item.Query, changes)), html.EscapeString(item.Query), len(changes.Added), len(changes.Removed), sections.String(), html.EscapeString(searchURL))
}

func writeTextProducts(output *strings.Builder, products []model.Product) {
	for _, product := range products[:min(len(products), 12)] {
		fmt.Fprintf(output, "- %s · %s · ID %s\n  %s\n", product.Title, priceLabel(product), product.ID, product.URLToProduct)
	}
}

func emailSection(title, note, symbol, color, soft string, products []model.Product) string {
	var rows strings.Builder
	for _, product := range products[:min(len(products), 12)] {
		fmt.Fprintf(&rows, `<tr><td style="padding:9px 0"><table role="presentation" style="width:100%%;border-collapse:collapse"><tr><td style="width:40px;height:40px;border-radius:11px;background:%s;color:%s;text-align:center;font-size:20px;font-weight:700">%s</td><td style="padding-left:12px"><a href="%s" style="display:block;color:#172033;text-decoration:none;font-size:15px;font-weight:750;line-height:1.3">%s</a><div style="margin-top:4px;color:#64748b;font-size:12px"><strong style="color:%s">%s</strong>&nbsp; · &nbsp;ID %s</div></td><td style="width:52px;text-align:right"><a href="%s" style="color:%s;text-decoration:none;font-size:12px;font-weight:750">View ↗</a></td></tr></table></td></tr>`, soft, color, symbol, html.EscapeString(product.URLToProduct), html.EscapeString(product.Title), color, html.EscapeString(priceLabel(product)), html.EscapeString(product.ID), html.EscapeString(product.URLToProduct), color)
	}
	return fmt.Sprintf(`<section style="margin-top:22px"><h2 style="margin:0;font-size:18px">%s</h2><p style="margin:5px 0 8px;color:#64748b;font-size:12px;line-height:1.45">%s</p><table role="presentation" style="width:100%%;border-collapse:collapse">%s</table></section>`, html.EscapeString(title), html.EscapeString(note), rows.String())
}

func priceLabel(product model.Product) string {
	if product.PriceString == "" {
		return "Price unavailable"
	}
	return product.PriceString
}

func plural(noun string, count int) string {
	if count == 1 {
		return noun
	}
	return noun + "s"
}

func intervalLabel(value time.Duration) string {
	if value%time.Hour == 0 {
		hours := int(value / time.Hour)
		if hours == 1 {
			return "1 hour"
		}
		return fmt.Sprintf("%d hours", hours)
	}
	return fmt.Sprintf("%d minutes", int(value/time.Minute))
}

func ValidInterval(minutes int) bool {
	switch minutes {
	case 15, 60, 360, 1440:
		return true
	default:
		return false
	}
}

func ValidSearchPath(value string) bool {
	if len(value) < 2 || len(value) > 9000 {
		return false
	}
	parsed, err := url.Parse(value)
	return err == nil && parsed.IsAbs() == false && parsed.Host == "" && parsed.Path == "/" && parsed.Fragment == ""
}
