package staffauth

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1"
	"crypto/subtle"
	"encoding/base32"
	"encoding/base64"
	"encoding/binary"
	"errors"
	"fmt"
	"net/url"
	"strings"
	"time"

	qrcode "github.com/skip2/go-qrcode"
)

// RFC 6238 with the parameters every authenticator app assumes by default:
// SHA-1, six digits, thirty-second steps. Choosing differently here would mean
// a coach's app silently producing codes this service rejects.
const (
	totpDigits     = 6
	totpStepLength = 30 * time.Second
	// One step either side, so a phone clock that is a little out still works.
	totpSkewSteps = 1
	totpIssuer    = "ZoomiGo"
)

var errInvalidCode = errors.New("invalid code")

func totpStep(at time.Time) int64 { return at.Unix() / int64(totpStepLength.Seconds()) }

func totpCode(secret []byte, step int64) string {
	counter := make([]byte, 8)
	binary.BigEndian.PutUint64(counter, uint64(step))
	mac := hmac.New(sha1.New, secret)
	mac.Write(counter)
	sum := mac.Sum(nil)
	offset := sum[len(sum)-1] & 0x0f
	truncated := binary.BigEndian.Uint32(sum[offset:offset+4]) & 0x7fffffff
	return fmt.Sprintf("%0*d", totpDigits, truncated%1_000_000)
}

// Returns the step the code belongs to, so the caller can refuse a step at or
// below the last one it accepted. Without that, a code stays usable for its
// whole window and a shoulder-surfed code is a working credential.
func verifyTOTP(secret []byte, code string, at time.Time) (int64, error) {
	code = strings.TrimSpace(code)
	if len(code) != totpDigits {
		return 0, errInvalidCode
	}
	current := totpStep(at)
	for offset := -totpSkewSteps; offset <= totpSkewSteps; offset++ {
		step := current + int64(offset)
		if subtle.ConstantTimeCompare([]byte(totpCode(secret, step)), []byte(code)) == 1 {
			return step, nil
		}
	}
	return 0, errInvalidCode
}

func newTOTPSecret() ([]byte, error) {
	secret := make([]byte, 20)
	if _, err := rand.Read(secret); err != nil {
		return nil, err
	}
	return secret, nil
}

func totpSecretBase32(secret []byte) string {
	return base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(secret)
}

// The otpauth URI an authenticator app scans or accepts pasted. The account
// label carries the staff email so a coach with more than one entry can tell
// them apart.
func totpProvisioningURI(email string, secret []byte) string {
	label := url.PathEscape(totpIssuer + ":" + email)
	query := url.Values{}
	query.Set("secret", totpSecretBase32(secret))
	query.Set("issuer", totpIssuer)
	query.Set("algorithm", "SHA1")
	query.Set("digits", fmt.Sprint(totpDigits))
	query.Set("period", fmt.Sprint(int(totpStepLength.Seconds())))
	return "otpauth://totp/" + label + "?" + query.Encode()
}

// The same URI as a PNG, so enrolment is a scan rather than a hand-copied
// secret. Encoded here, next to the URI it draws, for the reason the player
// login QR is encoded server-side: the image is built from the value the
// service just stored, and no QR library ships to the page that also handles
// the secret.
//
// An encoding failure returns the empty string rather than an error. The setup
// key and the URI beside it are a complete fallback, so a missing image is a
// worse enrolment, not a broken one.
func totpProvisioningQR(uri string) string {
	png, err := qrcode.Encode(uri, qrcode.Medium, 512)
	if err != nil {
		return ""
	}
	return base64.StdEncoding.EncodeToString(png)
}

// The secret is encrypted rather than hashed because verifying a time-based
// code needs it back. The key lives in the process environment, so a stolen
// database or backup is not by itself a stolen second factor.
func sealSecret(key, secret []byte) (ciphertext, nonce []byte, err error) {
	gcm, err := newGCM(key)
	if err != nil {
		return nil, nil, err
	}
	nonce = make([]byte, gcm.NonceSize())
	if _, err = rand.Read(nonce); err != nil {
		return nil, nil, err
	}
	return gcm.Seal(nil, nonce, secret, nil), nonce, nil
}

func openSecret(key, ciphertext, nonce []byte) ([]byte, error) {
	gcm, err := newGCM(key)
	if err != nil {
		return nil, err
	}
	return gcm.Open(nil, nonce, ciphertext, nil)
}

func newGCM(key []byte) (cipher.AEAD, error) {
	if len(key) != 32 {
		return nil, errors.New("staff secret key must be 32 bytes")
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}

// decodeBase32 turns a displayed secret back into bytes. Only tests and the
// setup flow need this; a stored secret is never displayed again.
func decodeBase32(encoded string) ([]byte, error) {
	return base32.StdEncoding.WithPadding(base32.NoPadding).DecodeString(strings.ToUpper(strings.TrimSpace(encoded)))
}
