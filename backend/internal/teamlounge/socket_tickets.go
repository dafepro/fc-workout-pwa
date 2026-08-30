package teamlounge

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"errors"
	"fmt"
	"time"
)

func (store *SQLiteStore) IssueSocketTicket(
	ctx context.Context,
	roomID, playerID string,
	now time.Time,
	ttl time.Duration,
) (string, error) {
	if roomID == "" || playerID == "" || now.IsZero() || ttl <= 0 {
		return "", errors.New("issue lounge socket ticket: invalid request")
	}
	random := make([]byte, 32)
	if _, err := rand.Read(random); err != nil {
		return "", fmt.Errorf("issue lounge socket ticket: %w", err)
	}
	ticket := base64.RawURLEncoding.EncodeToString(random)
	hash := sha256.Sum256([]byte(ticket))
	now = now.UTC()
	if _, err := store.db.ExecContext(ctx, `DELETE FROM team_lounge_socket_tickets WHERE expires_at <= ?`,
		now.Format(time.RFC3339Nano)); err != nil {
		return "", fmt.Errorf("prune lounge socket tickets: %w", err)
	}
	if _, err := store.db.ExecContext(ctx, `INSERT INTO team_lounge_socket_tickets
		(ticket_hash, player_id, room_id, expires_at, issued_at) VALUES (?, ?, ?, ?, ?)`,
		hash[:], playerID, roomID, now.Add(ttl).Format(time.RFC3339Nano), now.Format(time.RFC3339Nano)); err != nil {
		return "", fmt.Errorf("persist lounge socket ticket: %w", err)
	}
	return ticket, nil
}

func (store *SQLiteStore) ConsumeSocketTicket(
	ctx context.Context,
	ticket, roomID string,
	now time.Time,
) (string, bool) {
	if len(ticket) != 43 || roomID == "" || now.IsZero() {
		return "", false
	}
	hash := sha256.Sum256([]byte(ticket))
	var playerID string
	err := store.db.QueryRowContext(ctx, `DELETE FROM team_lounge_socket_tickets
		WHERE ticket_hash = ? AND room_id = ? AND expires_at > ? RETURNING player_id`,
		hash[:], roomID, now.UTC().Format(time.RFC3339Nano)).Scan(&playerID)
	if errors.Is(err, sql.ErrNoRows) {
		return "", false
	}
	return playerID, err == nil && playerID != ""
}
