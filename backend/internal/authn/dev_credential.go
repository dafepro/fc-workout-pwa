//go:build dev

package authn

import "context"

// IssueDevCredential is compiled only into a dev-tagged API. Production PIN
// validation continues to reject repeated and sequential values.
func (service *Service) IssueDevCredential(ctx context.Context, accountID, pin, token string) (Credential, error) {
	if !pinPattern.MatchString(pin) {
		return Credential{}, ErrInvalidPIN
	}
	return service.issueCredentialUnchecked(ctx, accountID, pin, token)
}
