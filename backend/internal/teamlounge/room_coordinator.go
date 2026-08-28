package teamlounge

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/dafepro/canvas/server/pkg/roomsdk"
)

type SQLiteRoomCoordinator struct {
	db  *sql.DB
	now func() time.Time
}

func NewSQLiteRoomCoordinator(db *sql.DB, now func() time.Time) *SQLiteRoomCoordinator {
	if now == nil {
		now = time.Now
	}
	return &SQLiteRoomCoordinator{db: db, now: now}
}

func (coordinator *SQLiteRoomCoordinator) AcquireRoom(
	ctx context.Context,
	request roomsdk.RoomOwnershipRequest,
) (roomsdk.RoomOwnership, error) {
	if err := ctx.Err(); err != nil {
		return roomsdk.RoomOwnership{}, err
	}
	if request.RoomID == "" || request.ReplicaID == "" || request.OwnerID == "" || request.TTL <= 0 {
		return roomsdk.RoomOwnership{}, errors.New("acquire lounge room: incomplete request")
	}
	connection, err := coordinator.db.Conn(ctx)
	if err != nil {
		return roomsdk.RoomOwnership{}, fmt.Errorf("open lounge ownership transaction: %w", err)
	}
	defer connection.Close()
	if _, err = connection.ExecContext(ctx, "BEGIN IMMEDIATE"); err != nil {
		return roomsdk.RoomOwnership{}, fmt.Errorf("begin lounge ownership transaction: %w", err)
	}
	committed := false
	defer func() {
		if !committed {
			_, _ = connection.ExecContext(context.Background(), "ROLLBACK")
		}
	}()
	if _, err = connection.ExecContext(ctx, `INSERT INTO team_lounge_room_ownership (room_id, generation)
		SELECT room.room_id, COALESCE(snapshot.room_ownership_generation, 0)
		FROM team_lounge_rooms AS room
		LEFT JOIN team_lounge_snapshots AS snapshot ON snapshot.room_id = room.room_id
		WHERE room.room_id = ? ON CONFLICT(room_id) DO NOTHING`, request.RoomID); err != nil {
		return roomsdk.RoomOwnership{}, fmt.Errorf("initialize lounge ownership: %w", err)
	}
	current, err := loadRoomOwnership(ctx, connection, request.RoomID)
	if err != nil {
		return roomsdk.RoomOwnership{}, err
	}
	now := coordinator.now().UTC()
	if current.LeaseID != "" && now.Before(current.LeaseExpiresAt) {
		return roomsdk.RoomOwnership{}, roomsdk.ErrRoomOwnershipHeld
	}
	leaseID, err := newCoordinatorLeaseID()
	if err != nil {
		return roomsdk.RoomOwnership{}, err
	}
	lease := roomsdk.RoomOwnership{
		RoomID: request.RoomID, ReplicaID: request.ReplicaID, OwnerID: request.OwnerID,
		LeaseID: leaseID, Generation: current.Generation + 1, LeaseExpiresAt: now.Add(request.TTL),
	}
	if _, err = connection.ExecContext(ctx, `UPDATE team_lounge_room_ownership SET
		generation = ?, replica_id = ?, owner_id = ?, lease_id = ?, lease_expires_at = ?
		WHERE room_id = ?`, lease.Generation, lease.ReplicaID, lease.OwnerID, lease.LeaseID,
		lease.LeaseExpiresAt.Format(time.RFC3339Nano), lease.RoomID); err != nil {
		return roomsdk.RoomOwnership{}, fmt.Errorf("acquire lounge ownership: %w", err)
	}
	if _, err = connection.ExecContext(ctx, "COMMIT"); err != nil {
		return roomsdk.RoomOwnership{}, fmt.Errorf("commit lounge ownership: %w", err)
	}
	committed = true
	return lease, nil
}

func (coordinator *SQLiteRoomCoordinator) RenewRoom(
	ctx context.Context,
	lease roomsdk.RoomOwnership,
	ttl time.Duration,
) (roomsdk.RoomOwnership, error) {
	if err := ctx.Err(); err != nil {
		return roomsdk.RoomOwnership{}, err
	}
	if ttl <= 0 {
		return roomsdk.RoomOwnership{}, errors.New("renew lounge room: invalid TTL")
	}
	now := coordinator.now().UTC()
	renewed := lease
	renewed.LeaseExpiresAt = now.Add(ttl)
	result, err := coordinator.db.ExecContext(ctx, `UPDATE team_lounge_room_ownership SET lease_expires_at = ?
		WHERE room_id = ? AND replica_id = ? AND owner_id = ? AND lease_id = ? AND generation = ?
		AND lease_expires_at = ? AND lease_expires_at > ?`, renewed.LeaseExpiresAt.Format(time.RFC3339Nano),
		lease.RoomID, lease.ReplicaID, lease.OwnerID, lease.LeaseID, lease.Generation,
		lease.LeaseExpiresAt.UTC().Format(time.RFC3339Nano), now.Format(time.RFC3339Nano))
	if err != nil {
		return roomsdk.RoomOwnership{}, fmt.Errorf("renew lounge ownership: %w", err)
	}
	if rows, _ := result.RowsAffected(); rows != 1 {
		return roomsdk.RoomOwnership{}, roomsdk.ErrRoomOwnershipFenced
	}
	return renewed, nil
}

func (coordinator *SQLiteRoomCoordinator) ValidateRoom(ctx context.Context, lease roomsdk.RoomOwnership) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	current, err := loadRoomOwnership(ctx, coordinator.db, lease.RoomID)
	if err != nil || !sameRoomOwnership(current, lease) || !coordinator.now().UTC().Before(current.LeaseExpiresAt) {
		return roomsdk.ErrRoomOwnershipFenced
	}
	return nil
}

func (coordinator *SQLiteRoomCoordinator) ReleaseRoom(ctx context.Context, lease roomsdk.RoomOwnership) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	result, err := coordinator.db.ExecContext(ctx, `UPDATE team_lounge_room_ownership SET
		replica_id = NULL, owner_id = NULL, lease_id = NULL, lease_expires_at = NULL
		WHERE room_id = ? AND replica_id = ? AND owner_id = ? AND lease_id = ? AND generation = ?
		AND lease_expires_at = ?`, lease.RoomID, lease.ReplicaID, lease.OwnerID, lease.LeaseID,
		lease.Generation, lease.LeaseExpiresAt.UTC().Format(time.RFC3339Nano))
	if err != nil {
		return fmt.Errorf("release lounge ownership: %w", err)
	}
	if rows, _ := result.RowsAffected(); rows != 1 {
		return roomsdk.ErrRoomOwnershipFenced
	}
	return nil
}

type ownershipQuerier interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

func loadRoomOwnership(ctx context.Context, db ownershipQuerier, roomID string) (roomsdk.RoomOwnership, error) {
	var lease roomsdk.RoomOwnership
	var replicaID, ownerID, leaseID, expiresAt sql.NullString
	err := db.QueryRowContext(ctx, `SELECT room_id, generation, replica_id, owner_id, lease_id, lease_expires_at
		FROM team_lounge_room_ownership WHERE room_id = ?`, roomID).Scan(
		&lease.RoomID, &lease.Generation, &replicaID, &ownerID, &leaseID, &expiresAt,
	)
	if err != nil {
		return roomsdk.RoomOwnership{}, fmt.Errorf("load lounge ownership: %w", err)
	}
	lease.ReplicaID, lease.OwnerID, lease.LeaseID = replicaID.String, ownerID.String, leaseID.String
	if expiresAt.Valid {
		lease.LeaseExpiresAt, err = time.Parse(time.RFC3339Nano, expiresAt.String)
		if err != nil {
			return roomsdk.RoomOwnership{}, fmt.Errorf("parse lounge ownership expiry: %w", err)
		}
	}
	return lease, nil
}

func sameRoomOwnership(left, right roomsdk.RoomOwnership) bool {
	return left.RoomID == right.RoomID && left.ReplicaID == right.ReplicaID &&
		left.OwnerID == right.OwnerID && left.LeaseID == right.LeaseID &&
		left.Generation == right.Generation && left.LeaseExpiresAt.Equal(right.LeaseExpiresAt)
}

func newCoordinatorLeaseID() (string, error) {
	random := make([]byte, 16)
	if _, err := rand.Read(random); err != nil {
		return "", fmt.Errorf("create lounge ownership lease: %w", err)
	}
	return hex.EncodeToString(random), nil
}
