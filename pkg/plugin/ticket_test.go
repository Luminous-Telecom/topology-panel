package plugin

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"encoding/pem"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func signTestTicket(t *testing.T, key *ecdsa.PrivateKey, claims ticketClaims) string {
	t.Helper()
	token := jwt.NewWithClaims(jwt.SigningMethodES256, claims)
	signed, err := token.SignedString(key)
	if err != nil {
		t.Fatal(err)
	}
	return signed
}

func publicPEM(t *testing.T, key *ecdsa.PrivateKey) string {
	t.Helper()
	der, err := x509.MarshalPKIXPublicKey(&key.PublicKey)
	if err != nil {
		t.Fatal(err)
	}
	return string(pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: der}))
}

func TestVerifyLicenseTicket(t *testing.T) {
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	pemText := publicPEM(t, key)
	now := time.Now()
	base := ticketClaims{
		PluginID: ID,
		IP:       "203.0.113.10",
		KeyHash:  licenseKeyHash("LUM-TEST"),
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    ticketIssuer,
			Audience:  jwt.ClaimStrings{ID},
			ExpiresAt: jwt.NewNumericDate(now.Add(time.Hour)),
			IssuedAt:  jwt.NewNumericDate(now),
		},
	}
	ticket := signTestTicket(t, key, base)
	if !verifyLicenseTicket(ticket, "LUM-TEST", "203.0.113.10", ID, pemText) {
		t.Fatal("ticket válido foi recusado")
	}
	if verifyLicenseTicket(ticket, "LUM-TEST", "203.0.113.10", ID, ticketPublicPEM) {
		t.Fatal("ticket de outra chave foi aceito")
	}
	if verifyLicenseTicket(ticket, "LUM-TEST", "10.0.0.1", ID, pemText) {
		t.Fatal("ticket de outro IP foi aceito")
	}
	if verifyLicenseTicket(ticket, "outra", "203.0.113.10", ID, pemText) {
		t.Fatal("ticket de outra chave de licença foi aceito")
	}
	if verifyLicenseTicket("nao-e-jwt", "LUM-TEST", "203.0.113.10", ID, pemText) {
		t.Fatal("lixo foi aceito")
	}
	expired := base
	expired.ExpiresAt = jwt.NewNumericDate(now.Add(-2 * time.Minute))
	if verifyLicenseTicket(signTestTicket(t, key, expired), "LUM-TEST", "203.0.113.10", ID, pemText) {
		t.Fatal("ticket expirado foi aceito")
	}
}
