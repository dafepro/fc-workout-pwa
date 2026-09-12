package httpapi

import (
	"bytes"
	"context"
	"errors"
	"io"
	"net/http"
)

type adminMutationKey struct{}
type adminMutation struct {
	audits      int
	auditError  error
	afterCommit []func(context.Context)
}

var errAdminMutationRejected = errors.New("administrative mutation rejected")

// Secrets and success responses must not leave the server before both the
// mutation and its audit record commit.
func (service *service) auditedStaffMutation(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if service.staffStore == nil {
			next(w, r)
			return
		}
		if _, ok := service.staffActor(w, r); !ok {
			return
		}
		// Never hold the only database connection while waiting for client bytes.
		body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 16*1024))
		_ = r.Body.Close()
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_request", "The request is invalid.")
			return
		}
		r.Body = io.NopCloser(bytes.NewReader(body))
		state := &adminMutation{}
		response := &adminResponse{header: make(http.Header)}
		err = service.staffStore.WithinTransaction(r.Context(), func(ctx context.Context) error {
			ctx = context.WithValue(ctx, adminMutationKey{}, state)
			next(response, r.WithContext(ctx))
			if response.status == 0 {
				response.status = http.StatusOK
			}
			if response.status < 200 || response.status >= 300 {
				return errAdminMutationRejected
			}
			if state.auditError != nil {
				return state.auditError
			}
			if state.audits == 0 {
				return errors.New("administrative mutation missing audit")
			}
			return nil
		})
		if err != nil {
			if !errors.Is(err, errAdminMutationRejected) {
				writeError(w, r, http.StatusInternalServerError, "internal_error", "The request could not be completed.")
				return
			}
		} else {
			for _, complete := range state.afterCommit {
				complete(r.Context())
			}
		}
		for key, values := range response.header {
			w.Header()[key] = values
		}
		w.WriteHeader(response.status)
		_, _ = w.Write(response.body.Bytes())
	}
}

type adminResponse struct {
	header http.Header
	status int
	body   bytes.Buffer
}

func (response *adminResponse) Header() http.Header { return response.header }
func (response *adminResponse) WriteHeader(status int) {
	if response.status == 0 {
		response.status = status
	}
}
func (response *adminResponse) Write(contents []byte) (int, error) {
	if response.status == 0 {
		response.WriteHeader(http.StatusOK)
	}
	return response.body.Write(contents)
}
