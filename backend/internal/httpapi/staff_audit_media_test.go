package httpapi_test

import (
	"bytes"
	"image"
	"image/png"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"os"
	"reflect"
	"testing"

	"github.com/dafepro/fc-workout-pwa/backend/internal/httpapi"
	"github.com/dafepro/fc-workout-pwa/backend/internal/rewardmedia"
)

func TestAdministrativeMediaAuditFailureCleansProvisionalFiles(t *testing.T) {
	for _, commitFailure := range []bool{false, true} {
		name := "audit insert"
		if commitFailure {
			name = "transaction commit"
		}
		t.Run(name, func(t *testing.T) {
			root := t.TempDir()
			files, err := rewardmedia.NewFileStore(root)
			if err != nil {
				t.Fatal(err)
			}
			db, handler := administrativeAuditHandler(t, httpapi.WithTeamRewardMedia(files, rewardmedia.NewProcessor()))
			trigger := `CREATE TRIGGER fail_media_audit BEFORE INSERT ON admin_audit_events BEGIN SELECT RAISE(ABORT,'audit unavailable'); END`
			if commitFailure {
				trigger = `CREATE TABLE media_commit_fault(club_id TEXT REFERENCES clubs(id) DEFERRABLE INITIALLY DEFERRED);
				CREATE TRIGGER fail_media_audit AFTER INSERT ON admin_audit_events BEGIN INSERT INTO media_commit_fault VALUES('nonexistent'); END`
			}
			if _, err = db.Exec(trigger); err != nil {
				t.Fatal(err)
			}
			before := administrativeSnapshot(t, db)
			var upload bytes.Buffer
			form := multipart.NewWriter(&upload)
			part, err := form.CreatePart(textproto.MIMEHeader{"Content-Disposition": {`form-data; name="image"; filename="prize.png"`}, "Content-Type": {"image/png"}})
			if err != nil {
				t.Fatal(err)
			}
			if err = png.Encode(part, image.NewRGBA(image.Rect(0, 0, 32, 32))); err != nil {
				t.Fatal(err)
			}
			if err = form.WriteField("altKind", "prize_image"); err != nil {
				t.Fatal(err)
			}
			if err = form.Close(); err != nil {
				t.Fatal(err)
			}
			request := func() *httptest.ResponseRecorder {
				r := httptest.NewRequest(http.MethodPost, "/v1/staff/teams/team-one/reward-media", bytes.NewReader(upload.Bytes()))
				r.Header.Set("Authorization", "Bearer test")
				r.Header.Set("Content-Type", form.FormDataContentType())
				response := httptest.NewRecorder()
				handler.ServeHTTP(response, r)
				return response
			}
			if response := request(); response.Code != http.StatusInternalServerError {
				t.Fatalf("failed upload status=%d", response.Code)
			}
			if !reflect.DeepEqual(before, administrativeSnapshot(t, db)) {
				t.Fatal("failed media audit committed metadata")
			}
			if entries, err := os.ReadDir(root); err != nil || len(entries) != 0 {
				t.Fatalf("uncommitted files remain: count=%d err=%v", len(entries), err)
			}
			if _, err = db.Exec(`DROP TRIGGER fail_media_audit`); err != nil {
				t.Fatal(err)
			}
			if response := request(); response.Code != http.StatusCreated {
				t.Fatalf("successful retry status=%d body=%s", response.Code, response.Body.String())
			}
			if entries, err := os.ReadDir(root); err != nil || len(entries) != 1 {
				t.Fatalf("committed media missing: count=%d err=%v", len(entries), err)
			}
			var count int
			if err = db.QueryRow(`SELECT COUNT(*) FROM admin_audit_events WHERE action='team_reward.media_upload'`).Scan(&count); err != nil || count != 1 {
				t.Fatalf("committed media audit count=%d err=%v", count, err)
			}
		})
	}
}
