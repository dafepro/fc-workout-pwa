package authn

import (
	"context"
	"errors"

	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
)

var ErrUnauthenticated = errors.New("unauthenticated")

type Authenticator interface {
	Authenticate(context.Context, string) (domain.Actor, error)
}

type Disabled struct{}

func (Disabled) Authenticate(context.Context, string) (domain.Actor, error) {
	return domain.Actor{}, ErrUnauthenticated
}
