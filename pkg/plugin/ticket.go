package plugin

import (
	"crypto/ecdsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/hex"
	"encoding/pem"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const (
	ticketIssuer = "luminous-store"
	// Mesma chave pública do frontend. Só verifica; a privada fica na loja.
	ticketPublicPEM = `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAES0Vt0Xlrbf598lnLQ2BiFcRCYtWE
OigsNWG0eSvRxRyCXBzcPElrSNKK/R9LPdlC60c4amGoZ2d27y/s/iUQHg==
-----END PUBLIC KEY-----
`
)

type ticketClaims struct {
	PluginID string `json:"pluginId"`
	IP       string `json:"ip"`
	KeyHash  string `json:"keyHash"`
	jwt.RegisteredClaims
}

func parseECPublicKey(pemText string) (*ecdsa.PublicKey, error) {
	block, _ := pem.Decode([]byte(pemText))
	if block == nil {
		return nil, jwt.ErrTokenMalformed
	}
	parsed, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		return nil, err
	}
	pub, ok := parsed.(*ecdsa.PublicKey)
	if !ok {
		return nil, jwt.ErrTokenMalformed
	}
	return pub, nil
}

func licenseKeyHash(licenseKey string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(licenseKey)))
	return hex.EncodeToString(sum[:])
}

func verifyLicenseTicket(ticket, licenseKey, ip, pluginID, publicPEM string) bool {
	if strings.TrimSpace(ticket) == "" {
		return false
	}
	pub, err := parseECPublicKey(publicPEM)
	if err != nil {
		return false
	}
	parser := jwt.NewParser(
		jwt.WithValidMethods([]string{jwt.SigningMethodES256.Alg()}),
		jwt.WithLeeway(60*time.Second),
		jwt.WithAudience(pluginID),
		jwt.WithIssuer(ticketIssuer),
	)
	claims := &ticketClaims{}
	parsed, err := parser.ParseWithClaims(ticket, claims, func(t *jwt.Token) (any, error) {
		return pub, nil
	})
	if err != nil || !parsed.Valid {
		return false
	}
	if claims.PluginID != pluginID {
		return false
	}
	if claims.IP != strings.TrimSpace(ip) {
		return false
	}
	return claims.KeyHash == licenseKeyHash(licenseKey)
}
