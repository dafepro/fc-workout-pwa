package authn

import "testing"

func TestValidatePINRejectsWeakOrMalformedValues(t *testing.T) {
	for _, pin := range []string{"12345", "123456", "111111", "abcdef", "1234567"} {
		if err := ValidatePIN(pin); err == nil {
			t.Fatalf("ValidatePIN(%q) expected an error", pin)
		}
	}
	for _, pin := range []string{"246810", "519273"} {
		if err := ValidatePIN(pin); err != nil {
			t.Fatalf("ValidatePIN(%q) error = %v", pin, err)
		}
	}
}

func TestLockDurationIncreasesAfterFiveFailures(t *testing.T) {
	if lockDuration(5).Minutes() != 15 || lockDuration(6).Minutes() != 30 || lockDuration(9).Hours() != 4 {
		t.Fatal("lock duration did not follow the documented exponential schedule")
	}
}
