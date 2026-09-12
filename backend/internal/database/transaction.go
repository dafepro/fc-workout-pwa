package database

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"sync/atomic"
)

// Handle lets collaborating repositories share a request transaction without
// borrowing a second connection from SQLite's single-writer pool.
type Handle struct{ *sql.DB }

func NewHandle(db *sql.DB) *Handle { return &Handle{DB: db} }

type transactionKey struct{ db *sql.DB }

func (db *Handle) transaction(ctx context.Context) *sql.Tx {
	tx, _ := ctx.Value(transactionKey{db.DB}).(*sql.Tx)
	return tx
}

func (db *Handle) ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error) {
	if tx := db.transaction(ctx); tx != nil {
		return tx.ExecContext(ctx, query, args...)
	}
	return db.DB.ExecContext(ctx, query, args...)
}

func (db *Handle) QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error) {
	if tx := db.transaction(ctx); tx != nil {
		return tx.QueryContext(ctx, query, args...)
	}
	return db.DB.QueryContext(ctx, query, args...)
}

func (db *Handle) QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row {
	if tx := db.transaction(ctx); tx != nil {
		return tx.QueryRowContext(ctx, query, args...)
	}
	return db.DB.QueryRowContext(ctx, query, args...)
}

func (db *Handle) WithinTransaction(ctx context.Context, action func(context.Context) error) error {
	if db.transaction(ctx) != nil {
		return errors.New("request transaction already active")
	}
	tx, err := db.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err = action(context.WithValue(ctx, transactionKey{db.DB}, tx)); err != nil {
		return err
	}
	return tx.Commit()
}

var savepointSequence atomic.Uint64

type Transaction struct {
	*sql.Tx
	ctx       context.Context
	savepoint string
	done      bool
}

func (db *Handle) BeginTx(ctx context.Context, options *sql.TxOptions) (*Transaction, error) {
	if tx := db.transaction(ctx); tx != nil {
		if options != nil {
			return nil, errors.New("nested transaction cannot override options")
		}
		name := fmt.Sprintf("repository_%d", savepointSequence.Add(1))
		if _, err := tx.ExecContext(ctx, "SAVEPOINT "+name); err != nil {
			return nil, err
		}
		return &Transaction{Tx: tx, ctx: ctx, savepoint: name}, nil
	}
	tx, err := db.DB.BeginTx(ctx, options)
	if err != nil {
		return nil, err
	}
	return &Transaction{Tx: tx, ctx: ctx}, nil
}

func (tx *Transaction) Commit() error {
	if tx.done {
		return sql.ErrTxDone
	}
	tx.done = true
	if tx.savepoint == "" {
		return tx.Tx.Commit()
	}
	_, err := tx.Tx.ExecContext(tx.ctx, "RELEASE SAVEPOINT "+tx.savepoint)
	return err
}

func (tx *Transaction) Rollback() error {
	if tx.done {
		return sql.ErrTxDone
	}
	tx.done = true
	if tx.savepoint == "" {
		return tx.Tx.Rollback()
	}
	if _, err := tx.Tx.ExecContext(tx.ctx, "ROLLBACK TO SAVEPOINT "+tx.savepoint); err != nil {
		return err
	}
	_, err := tx.Tx.ExecContext(tx.ctx, "RELEASE SAVEPOINT "+tx.savepoint)
	return err
}
