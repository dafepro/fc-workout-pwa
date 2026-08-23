package httpapi

import (
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
	"github.com/dafepro/fc-workout-pwa/backend/internal/rewardmedia"
	"github.com/dafepro/fc-workout-pwa/backend/internal/store"
)

const rewardMediaMultipartOverhead = 64 << 10

var (
	errRewardMediaForm         = errors.New("invalid reward media form")
	errRewardMediaTypeMismatch = errors.New("reward media type mismatch")
)

func WithTeamRewardMedia(media rewardmedia.Store, processor *rewardmedia.Processor) Option {
	return func(service *service) {
		service.rewardMedia = media
		service.rewardImages = processor
	}
}

func (service *service) uploadTeamRewardMedia(w http.ResponseWriter, r *http.Request) {
	teamID := r.PathValue("teamId")
	actor, ok := service.teamActor(w, r, teamID)
	if !ok || !service.rewardMediaReady(w, r) {
		return
	}
	started := time.Now()
	upload, altKind, err := readRewardMediaMultipart(w, r)
	if err != nil {
		service.writeRewardMediaUploadError(w, r, err)
		return
	}
	processed, err := service.rewardImages.ProcessContext(r.Context(), upload.contents)
	if err == nil && processed.SourceMIME != upload.claimedType {
		err = errRewardMediaTypeMismatch
	}
	if err != nil {
		service.writeRewardMediaUploadError(w, r, err)
		slog.Info("reward media rejected", "team_id", teamID, "code", rewardMediaErrorCode(err), "duration_ms", time.Since(started).Milliseconds())
		return
	}
	storageKey, err := rewardmedia.NewStorageKey()
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "reward_media_store_failed", "The image could not be stored.")
		return
	}
	if err = service.rewardMedia.Put(r.Context(), storageKey, processed.Display, processed.Thumbnail); err != nil {
		writeError(w, r, http.StatusInternalServerError, "reward_media_store_failed", "The image could not be stored.")
		return
	}
	media, err := service.rewards.CreateTeamRewardMedia(r.Context(), store.CreateTeamRewardMediaInput{
		TeamID: teamID, CreatedByAccountID: actor.AccountID, StorageKey: storageKey,
		SHA256: processed.SHA256, MIMEType: processed.MIMEType, Width: processed.Width,
		Height: processed.Height, ByteSize: processed.ByteSize, AltKind: altKind, Now: service.now().UTC(),
	})
	if err != nil {
		_ = service.rewardMedia.Delete(r.Context(), storageKey)
		service.writeRewardError(w, r, err)
		return
	}
	service.cleanupUnattachedRewardMedia(r)
	service.record(r.Context(), actor, "team_reward.media_upload", "team_reward_media", media.ID,
		map[string]any{"teamId": teamID, "byteSize": media.ByteSize, "width": media.Width, "height": media.Height})
	slog.Info("reward media stored", "team_id", teamID, "media_id", media.ID, "byte_size", media.ByteSize, "duration_ms", time.Since(started).Milliseconds())
	writeJSON(w, http.StatusCreated, media)
}

func (service *service) getStaffTeamRewardMedia(w http.ResponseWriter, r *http.Request) {
	teamID := r.PathValue("teamId")
	if _, ok := service.teamActor(w, r, teamID); !ok || !service.rewardMediaReady(w, r) {
		return
	}
	media, err := service.rewards.TeamRewardMedia(r.Context(), teamID, r.PathValue("mediaId"))
	if service.writeRewardError(w, r, err) {
		return
	}
	service.serveTeamRewardMedia(w, r, media)
}

func (service *service) getPlayerTeamRewardMedia(w http.ResponseWriter, r *http.Request) {
	actor, ok := service.authenticate(w, r)
	if !ok {
		return
	}
	if actor.Role != domain.RolePlayer || actor.PlayerID == "" {
		writeError(w, r, http.StatusForbidden, "forbidden", "This account does not have player reward media.")
		return
	}
	if !service.rewardMediaReady(w, r) {
		return
	}
	media, err := service.rewards.TeamRewardMediaForPlayer(r.Context(), actor, r.PathValue("teamId"), r.PathValue("mediaId"), service.now().UTC())
	if service.writeRewardError(w, r, err) {
		return
	}
	service.serveTeamRewardMedia(w, r, media)
}

func (service *service) serveTeamRewardMedia(w http.ResponseWriter, r *http.Request, media store.TeamRewardMedia) {
	variant := rewardmedia.DisplayVariant
	switch r.URL.Query().Get("variant") {
	case "", "display":
	case "thumbnail":
		variant = rewardmedia.ThumbnailVariant
	default:
		writeError(w, r, http.StatusBadRequest, "invalid_reward_media_variant", "Choose the display or thumbnail image.")
		return
	}
	reader, err := service.rewardMedia.Open(r.Context(), media.StorageKey, variant)
	if errors.Is(err, rewardmedia.ErrMediaNotFound) {
		writeError(w, r, http.StatusNotFound, "not_found", "The requested image was not found.")
		return
	}
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "reward_media_read_failed", "The image could not be loaded.")
		return
	}
	defer reader.Close()
	contents, err := io.ReadAll(io.LimitReader(reader, 2<<20))
	if err != nil || len(contents) == 0 || len(contents) >= 2<<20 {
		writeError(w, r, http.StatusInternalServerError, "reward_media_read_failed", "The image could not be loaded.")
		return
	}
	w.Header().Set("Content-Type", "image/jpeg")
	w.Header().Set("Content-Length", strconv.Itoa(len(contents)))
	w.Header().Set("Content-Disposition", "inline")
	w.Header().Set("Cache-Control", "private, max-age=31536000, immutable")
	w.Header().Set("Vary", "Authorization")
	w.Header().Set("ETag", fmt.Sprintf(`"%s-%s"`, media.ID, variant))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(contents)
}

type rewardMediaUpload struct {
	contents    []byte
	claimedType string
}

func readRewardMediaMultipart(w http.ResponseWriter, r *http.Request) (rewardMediaUpload, store.TeamRewardMediaAltKind, error) {
	r.Body = http.MaxBytesReader(w, r.Body, rewardmedia.MaxUploadBytes+rewardMediaMultipartOverhead)
	reader, err := r.MultipartReader()
	if err != nil {
		return rewardMediaUpload{}, "", errRewardMediaForm
	}
	var upload rewardMediaUpload
	var altKind store.TeamRewardMediaAltKind
	seenImage, seenAlt := false, false
	for {
		part, partErr := reader.NextPart()
		if errors.Is(partErr, io.EOF) {
			break
		}
		if partErr != nil {
			return rewardMediaUpload{}, "", partErr
		}
		switch part.FormName() {
		case "image":
			if seenImage || part.FileName() == "" {
				return rewardMediaUpload{}, "", errRewardMediaForm
			}
			seenImage = true
			upload.claimedType = strings.ToLower(strings.TrimSpace(part.Header.Get("Content-Type")))
			if upload.claimedType != "image/jpeg" && upload.claimedType != "image/png" {
				return rewardMediaUpload{}, "", errRewardMediaTypeMismatch
			}
			upload.contents, err = io.ReadAll(io.LimitReader(part, rewardmedia.MaxUploadBytes+1))
			if err != nil {
				return rewardMediaUpload{}, "", err
			}
			if len(upload.contents) > rewardmedia.MaxUploadBytes {
				return rewardMediaUpload{}, "", rewardmedia.ErrUploadTooLarge
			}
		case "altKind":
			if seenAlt {
				return rewardMediaUpload{}, "", errRewardMediaForm
			}
			seenAlt = true
			value, readErr := io.ReadAll(io.LimitReader(part, 65))
			if readErr != nil || len(value) > 64 {
				return rewardMediaUpload{}, "", errRewardMediaForm
			}
			altKind = store.TeamRewardMediaAltKind(strings.TrimSpace(string(value)))
		default:
			return rewardMediaUpload{}, "", errRewardMediaForm
		}
		_ = part.Close()
	}
	if !seenImage || !seenAlt || !altKind.Valid() || len(upload.contents) == 0 {
		return rewardMediaUpload{}, "", errRewardMediaForm
	}
	return upload, altKind, nil
}

func (service *service) rewardMediaReady(w http.ResponseWriter, r *http.Request) bool {
	if service.rewards == nil || service.rewardMedia == nil || service.rewardImages == nil {
		writeError(w, r, http.StatusServiceUnavailable, "not_ready", "Reward images are not ready.")
		return false
	}
	return true
}

func (service *service) writeRewardMediaUploadError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, rewardmedia.ErrUploadTooLarge), isMaxBytesError(err):
		writeError(w, r, http.StatusRequestEntityTooLarge, "reward_media_too_large", "Choose an image smaller than 3 MB.")
	case errors.Is(err, rewardmedia.ErrImageDimensions):
		writeError(w, r, http.StatusUnprocessableEntity, "reward_media_dimensions", "Choose an image no larger than 2048 by 2048 pixels.")
	case errors.Is(err, errRewardMediaTypeMismatch):
		writeError(w, r, http.StatusUnprocessableEntity, "reward_media_type_mismatch", "Choose an original JPEG or PNG image.")
	case errors.Is(err, rewardmedia.ErrInvalidImage):
		writeError(w, r, http.StatusUnprocessableEntity, "reward_media_invalid", "That image could not be read. Choose another JPEG or PNG.")
	default:
		writeError(w, r, http.StatusBadRequest, "invalid_reward_media_upload", "Choose one image and one description.")
	}
}

func rewardMediaErrorCode(err error) string {
	switch {
	case errors.Is(err, rewardmedia.ErrUploadTooLarge):
		return "too_large"
	case errors.Is(err, rewardmedia.ErrImageDimensions):
		return "dimensions"
	case errors.Is(err, errRewardMediaTypeMismatch):
		return "type_mismatch"
	default:
		return "invalid"
	}
}

func isMaxBytesError(err error) bool {
	var maximum *http.MaxBytesError
	return errors.As(err, &maximum)
}

func (service *service) cleanupUnattachedRewardMedia(r *http.Request) {
	now := service.now().UTC()
	_, err := rewardmedia.CleanupExpired(r.Context(), service.rewards, service.rewardMedia, now.Add(-24*time.Hour), now)
	if err != nil {
		slog.Warn("reward media cleanup failed", "error", err)
	}
}
