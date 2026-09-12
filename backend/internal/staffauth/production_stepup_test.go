//go:build !dev

package staffauth

import (
	"context"
	"testing"
)

func TestProductionServiceHasNoPasswordOnlyStepUpCapability(t *testing.T) {
	if _, ok := any(&Service{}).(interface {
		ConfirmDevStepUp(context.Context, string, string) (bool, error)
	}); ok {
		t.Fatal("production binary exposes dev password-only reauthentication")
	}
}
