package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base32"
	"encoding/hex"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type Claims struct {
	jwt.RegisteredClaims
}
type contextKey struct{}

type Service struct {
	secret   []byte
	issuer   string
	lifetime time.Duration
}

func New(secret, issuer string, lifetime time.Duration) *Service {
	return &Service{[]byte(secret), issuer, lifetime}
}
func NewLoginCode() (string, error) {
	random := make([]byte, 16)
	if _, err := rand.Read(random); err != nil {
		return "", err
	}
	raw := base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(random)
	parts := make([]string, 0, 7)
	for len(raw) > 4 {
		parts = append(parts, raw[:4])
		raw = raw[4:]
	}
	if raw != "" {
		parts = append(parts, raw)
	}
	return strings.Join(parts, "-"), nil
}

func CodeHash(code string) string {
	normalized := strings.ToUpper(strings.NewReplacer("-", "", " ", "").Replace(strings.TrimSpace(code)))
	sum := sha256.Sum256([]byte(normalized))
	return hex.EncodeToString(sum[:])
}

func (s *Service) Token(accountID string) (string, error) {
	now := time.Now()
	claims := Claims{jwt.RegisteredClaims{Subject: accountID, Issuer: s.issuer, IssuedAt: jwt.NewNumericDate(now), ExpiresAt: jwt.NewNumericDate(now.Add(s.lifetime))}}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(s.secret)
}

func (s *Service) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		header := r.Header.Get("Authorization")
		if !strings.HasPrefix(header, "Bearer ") {
			w.Header().Set("Content-Type", "application/json")
			http.Error(w, `{"error":"authentication required"}`, http.StatusUnauthorized)
			return
		}
		claims := new(Claims)
		token, err := jwt.ParseWithClaims(strings.TrimPrefix(header, "Bearer "), claims, func(token *jwt.Token) (any, error) {
			if token.Method != jwt.SigningMethodHS256 {
				return nil, errors.New("unexpected signing method")
			}
			return s.secret, nil
		}, jwt.WithIssuer(s.issuer), jwt.WithExpirationRequired())
		if err != nil || !token.Valid {
			w.Header().Set("Content-Type", "application/json")
			http.Error(w, `{"error":"invalid token"}`, http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), contextKey{}, claims)))
	})
}

func ClaimsFrom(ctx context.Context) *Claims {
	claims, _ := ctx.Value(contextKey{}).(*Claims)
	return claims
}
