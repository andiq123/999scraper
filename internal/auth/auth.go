package auth

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"math/big"
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const sessionCookie = "999scraper_session"

type Claims struct {
	jwt.RegisteredClaims
}
type contextKey struct{}

type Service struct {
	secret   []byte
	issuer   string
	lifetime time.Duration
	secure   bool
}

func New(secret, issuer string, lifetime time.Duration, secure bool) *Service {
	return &Service{[]byte(secret), issuer, lifetime, secure}
}
func NewLoginCode() (string, error) {
	number, err := rand.Int(rand.Reader, big.NewInt(1_000_000))
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%06d", number.Int64()), nil
}

func ValidLoginCode(code string) bool {
	if len(code) != 6 {
		return false
	}
	for _, digit := range code {
		if digit < '0' || digit > '9' {
			return false
		}
	}
	return true
}

func (s *Service) CodeHash(code string) string {
	digest := hmac.New(sha256.New, s.secret)
	_, _ = digest.Write([]byte(strings.TrimSpace(code)))
	return hex.EncodeToString(digest.Sum(nil))
}

func (s *Service) Token(accountID string) (string, error) {
	now := time.Now()
	claims := Claims{jwt.RegisteredClaims{Subject: accountID, Issuer: s.issuer, IssuedAt: jwt.NewNumericDate(now), ExpiresAt: jwt.NewNumericDate(now.Add(s.lifetime))}}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(s.secret)
}

func (s *Service) SetSession(w http.ResponseWriter, token string) {
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookie,
		Value:    token,
		Path:     "/api",
		MaxAge:   int(s.lifetime.Seconds()),
		HttpOnly: true,
		Secure:   s.secure,
		SameSite: http.SameSiteLaxMode,
	})
}

func (s *Service) ClearSession(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookie,
		Path:     "/api",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   s.secure,
		SameSite: http.SameSiteLaxMode,
	})
}

func (s *Service) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		claims, ok := s.claims(r)
		if !ok {
			w.Header().Set("Content-Type", "application/json")
			http.Error(w, `{"error":"authentication required"}`, http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), contextKey{}, claims)))
	})
}

func (s *Service) OptionalMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if claims, ok := s.claims(r); ok {
			r = r.WithContext(context.WithValue(r.Context(), contextKey{}, claims))
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Service) claims(r *http.Request) (*Claims, bool) {
	cookie, err := r.Cookie(sessionCookie)
	if err != nil || cookie.Value == "" {
		return nil, false
	}
	claims := new(Claims)
	token, err := jwt.ParseWithClaims(cookie.Value, claims, func(_ *jwt.Token) (any, error) { return s.secret, nil },
		jwt.WithIssuer(s.issuer), jwt.WithExpirationRequired(), jwt.WithValidMethods([]string{"HS256"}))
	return claims, err == nil && token.Valid
}

func ClaimsFrom(ctx context.Context) *Claims {
	claims, _ := ctx.Value(contextKey{}).(*Claims)
	return claims
}
