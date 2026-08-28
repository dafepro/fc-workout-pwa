//go:build e2e && linux

package e2e_test

import (
	"bytes"
	"context"
	"database/sql"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"testing"
	"time"

	"github.com/coder/websocket"
	pb "github.com/dafepro/canvas/server/gen/canvasphysicsv1"
	"github.com/dafepro/fc-workout-pwa/backend/internal/database"
	"google.golang.org/protobuf/proto"
)

type topologyProcess struct {
	id      string
	baseURL string
	command *exec.Cmd
	done    chan error
	output  *lockedBuffer
}

type lockedBuffer struct {
	mu sync.Mutex
	b  bytes.Buffer
}

func (buffer *lockedBuffer) Write(value []byte) (int, error) {
	buffer.mu.Lock()
	defer buffer.mu.Unlock()
	return buffer.b.Write(value)
}

func (buffer *lockedBuffer) String() string {
	buffer.mu.Lock()
	defer buffer.mu.Unlock()
	return buffer.b.String()
}

type loungeCredential struct {
	Ticket string `json:"ticket"`
	RoomID string `json:"roomId"`
}

func TestTwoAPIProcessesFenceAndHandoffCanvasRoomsThroughDeploymentProxy(t *testing.T) {
	apiBinary := os.Getenv("E2E_API_BINARY")
	caddyBinary := os.Getenv("E2E_CADDY_BINARY")
	caddyConfig := os.Getenv("E2E_CADDY_CONFIG")
	if apiBinary == "" || caddyBinary == "" || caddyConfig == "" {
		t.Skip("the two-process topology proof runs in the Docker E2E environment")
	}

	databasePath := filepath.Join(t.TempDir(), "topology.db")
	databaseURL := "file:" + filepath.ToSlash(databasePath)
	proxyPort := availablePort(t)
	apiA := startTopologyAPI(t, apiBinary, databaseURL, "topology-api-a", proxyPort)
	apiClient{baseURL: apiA.baseURL, resetKey: "topology-reset", client: topologyHTTPClient()}.reset(t)
	apiB := startTopologyAPI(t, apiBinary, databaseURL, "topology-api-b", proxyPort)
	proxy := startTopologyProxy(t, caddyBinary, caddyConfig, proxyPort, apiA, apiB)

	qualified := proxy.do(t, http.MethodPost, "/v1/me/training-entries", masonToken,
		"topology-same-day-entry", validTrainingEntryPayload(time.Now().UTC().Add(-time.Minute)))
	assertStatus(t, qualified, http.StatusCreated)
	_ = qualified.Body.Close()

	credential := issueLoungeTicket(t, proxy)
	ownerSocket, accepted := joinLounge(t, proxy.baseURL, credential)
	t.Cleanup(func() { _ = ownerSocket.CloseNow() })
	if accepted.GetUserId() != "player-mason" {
		t.Fatalf("proxy join user = %q", accepted.GetUserId())
	}

	db, err := database.Open(t.Context(), databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	ownerID, firstGeneration := currentRoomOwner(t, db, credential.RoomID)
	owner, peer := processPair(t, ownerID, apiA, apiB)

	assertSharedTicketConsumedOnce(t, proxy, apiA, apiB)

	if _, err := db.ExecContext(t.Context(), `UPDATE team_lounge_room_ownership
		SET lease_expires_at = ? WHERE room_id = ? AND replica_id = ?`,
		time.Now().UTC().Add(-time.Second).Format(time.RFC3339Nano), credential.RoomID, owner.id); err != nil {
		t.Fatal(err)
	}
	peerCredential := issueLoungeTicket(t, apiClient{baseURL: peer.baseURL, client: topologyHTTPClient()})
	peerSocket, peerAccepted := joinLounge(t, peer.baseURL, peerCredential)
	t.Cleanup(func() { _ = peerSocket.CloseNow() })
	if peerAccepted.GetUserId() != "player-mason" {
		t.Fatalf("handoff join user = %q", peerAccepted.GetUserId())
	}
	newOwnerID, secondGeneration := currentRoomOwner(t, db, credential.RoomID)
	if newOwnerID != peer.id || secondGeneration <= firstGeneration {
		t.Fatalf("handoff owner/generation = %s/%d, want %s/>%d",
			newOwnerID, secondGeneration, peer.id, firstGeneration)
	}
	if code := readLoungeError(t, ownerSocket, 8*time.Second); code != "room_ownership_lost" {
		t.Fatalf("stale owner connection error = %q", code)
	}
	staleCredential := issueLoungeTicket(t, apiClient{baseURL: owner.baseURL, client: topologyHTTPClient()})
	if code := rejectedLoungeJoin(t, owner.baseURL, staleCredential); code != "room_owned_elsewhere" {
		t.Fatalf("stale process join error = %q", code)
	}

	peer.stop(t, syscall.SIGTERM)
	waitForReleasedOwnership(t, db, credential.RoomID)

	failoverCredential := issueLoungeTicket(t, proxy)
	failoverSocket, failoverAccepted := joinLounge(t, proxy.baseURL, failoverCredential)
	t.Cleanup(func() { _ = failoverSocket.CloseNow() })
	if failoverAccepted.GetUserId() != "player-mason" {
		t.Fatalf("post-drain proxy join user = %q", failoverAccepted.GetUserId())
	}
	finalOwnerID, finalGeneration := currentRoomOwner(t, db, credential.RoomID)
	if finalOwnerID != owner.id || finalGeneration <= secondGeneration {
		t.Fatalf("post-drain owner/generation = %s/%d, want %s/>%d",
			finalOwnerID, finalGeneration, owner.id, secondGeneration)
	}
}

func startTopologyAPI(
	t *testing.T,
	binary, databaseURL, replicaID string,
	proxyPort int,
) *topologyProcess {
	t.Helper()
	port, metricsPort := availablePort(t), availablePort(t)
	process := startTopologyProcess(t, replicaID, binary, nil, []string{
		"APP_ENV=e2e",
		"PORT=" + strconv.Itoa(port),
		"METRICS_PORT=" + strconv.Itoa(metricsPort),
		"DATABASE_URL=" + databaseURL,
		"ALLOWED_ORIGIN=http://127.0.0.1:" + strconv.Itoa(proxyPort),
		"ENABLE_E2E_FIXTURES=true",
		"E2E_RESET_KEY=topology-reset",
		"TEAM_TIME_ZONE=America/Chicago",
		"CANVAS_REPLICA_ID=" + replicaID,
		"RELEASE_SHA=" + replicaID,
		"SHUTDOWN_TIMEOUT=8s",
	})
	process.baseURL = "http://127.0.0.1:" + strconv.Itoa(port)
	waitForReady(t, process)
	return process
}

func startTopologyProxy(
	t *testing.T,
	binary, configPath string,
	port int,
	upstreams ...*topologyProcess,
) apiClient {
	t.Helper()
	addresses := make([]string, 0, len(upstreams))
	for _, upstream := range upstreams {
		addresses = append(addresses, strings.TrimPrefix(upstream.baseURL, "http://"))
	}
	process := startTopologyProcess(t, "topology-caddy", binary,
		[]string{"run", "--config", configPath, "--adapter", "caddyfile"},
		[]string{
			"CADDY_SITE_ADDRESS=http://127.0.0.1:" + strconv.Itoa(port),
			"CADDY_UPSTREAMS=" + strings.Join(addresses, " "),
		})
	process.baseURL = "http://127.0.0.1:" + strconv.Itoa(port)
	waitForReady(t, process)
	return apiClient{baseURL: process.baseURL, client: topologyHTTPClient()}
}

func startTopologyProcess(
	t *testing.T,
	id, binary string,
	arguments, environment []string,
) *topologyProcess {
	t.Helper()
	command := exec.Command(binary, arguments...)
	output := &lockedBuffer{}
	command.Stdout, command.Stderr = output, output
	command.Env = append(os.Environ(), environment...)
	if err := command.Start(); err != nil {
		t.Fatalf("start %s: %v", id, err)
	}
	process := &topologyProcess{id: id, command: command, done: make(chan error, 1), output: output}
	go func() { process.done <- command.Wait() }()
	t.Cleanup(func() {
		if command.ProcessState != nil && command.ProcessState.Exited() {
			return
		}
		_ = command.Process.Signal(syscall.SIGTERM)
		select {
		case <-process.done:
		case <-time.After(5 * time.Second):
			_ = command.Process.Kill()
			<-process.done
		}
	})
	return process
}

func (process *topologyProcess) stop(t *testing.T, signal os.Signal) {
	t.Helper()
	if err := process.command.Process.Signal(signal); err != nil {
		t.Fatalf("signal %s: %v", process.id, err)
	}
	select {
	case err := <-process.done:
		if err != nil {
			t.Fatalf("%s did not drain cleanly: %v\n%s", process.id, err, process.output.String())
		}
	case <-time.After(10 * time.Second):
		t.Fatalf("%s did not drain before its shutdown timeout\n%s", process.id, process.output.String())
	}
}

func waitForReady(t *testing.T, process *topologyProcess) {
	t.Helper()
	client := topologyHTTPClient()
	deadline := time.Now().Add(15 * time.Second)
	for time.Now().Before(deadline) {
		select {
		case err := <-process.done:
			t.Fatalf("%s exited before becoming ready: %v\n%s", process.id, err, process.output.String())
		default:
		}
		response, err := client.Get(process.baseURL + "/readyz")
		if err == nil {
			_ = response.Body.Close()
			if response.StatusCode == http.StatusOK {
				return
			}
		}
		time.Sleep(100 * time.Millisecond)
	}
	t.Fatalf("%s did not become ready\n%s", process.id, process.output.String())
}

func topologyHTTPClient() *http.Client {
	return &http.Client{Timeout: 8 * time.Second}
}

func availablePort(t *testing.T) int {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	return listener.Addr().(*net.TCPAddr).Port
}

func issueLoungeTicket(t *testing.T, api apiClient) loungeCredential {
	t.Helper()
	response := api.do(t, http.MethodPost,
		"/v1/teams/team-hill-striders/lounge/socket-ticket", masonToken, "", nil)
	assertStatus(t, response, http.StatusCreated)
	var credential loungeCredential
	decodeJSON(t, response, &credential)
	if len(credential.Ticket) != 43 || credential.RoomID == "" {
		t.Fatalf("invalid Lounge credential: %+v", credential)
	}
	return credential
}

func joinLounge(
	t *testing.T,
	baseURL string,
	credential loungeCredential,
) (*websocket.Conn, *pb.JoinAccepted) {
	t.Helper()
	connection, response, err := dialLounge(baseURL, credential)
	if response != nil && response.Body != nil {
		defer response.Body.Close()
	}
	if err != nil {
		t.Fatalf("dial Lounge: %v", err)
	}
	if err := writeLoungeJoin(connection, credential.RoomID); err != nil {
		_ = connection.CloseNow()
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	for {
		envelope, err := readLoungeEnvelope(ctx, connection)
		if err != nil {
			_ = connection.CloseNow()
			t.Fatal(err)
		}
		if accepted := envelope.GetJoinAccepted(); accepted != nil {
			return connection, accepted
		}
		if protocolError := envelope.GetError(); protocolError != nil {
			_ = connection.CloseNow()
			t.Fatalf("Lounge join rejected: %s", protocolError.Code)
		}
	}
}

func rejectedLoungeJoin(t *testing.T, baseURL string, credential loungeCredential) string {
	t.Helper()
	connection, response, err := dialLounge(baseURL, credential)
	if response != nil && response.Body != nil {
		defer response.Body.Close()
	}
	if err != nil {
		t.Fatalf("dial rejected Lounge join: %v", err)
	}
	defer connection.CloseNow()
	if err := writeLoungeJoin(connection, credential.RoomID); err != nil {
		t.Fatal(err)
	}
	return readLoungeError(t, connection, 8*time.Second)
}

func dialLounge(
	baseURL string,
	credential loungeCredential,
) (*websocket.Conn, *http.Response, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	return websocket.Dial(ctx,
		"ws"+strings.TrimPrefix(baseURL, "http")+"/v1/realtime/rooms/"+url.PathEscape(credential.RoomID),
		&websocket.DialOptions{Subprotocols: []string{"canvas-realtime", "ticket." + credential.Ticket}})
}

func writeLoungeJoin(connection *websocket.Conn, roomID string) error {
	raw, err := proto.Marshal(&pb.RoomEnvelope{
		RoomId: roomID,
		Payload: &pb.RoomEnvelope_Join{Join: &pb.Join{
			RoomId: roomID, ProtocolVersion: 8,
			Definitions: []*pb.DefinitionVersion{
				{DefinitionId: "beach-ball", Version: 5},
				{DefinitionId: "avatar", Version: 1},
				{DefinitionId: "zoomigo-lounge-action-router", Version: 1},
			},
		}},
	})
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	return connection.Write(ctx, websocket.MessageBinary, raw)
}

func readLoungeEnvelope(ctx context.Context, connection *websocket.Conn) (*pb.RoomEnvelope, error) {
	_, raw, err := connection.Read(ctx)
	if err != nil {
		return nil, err
	}
	envelope := &pb.RoomEnvelope{}
	if err := proto.Unmarshal(raw, envelope); err != nil {
		return nil, err
	}
	return envelope, nil
}

func readLoungeError(t *testing.T, connection *websocket.Conn, timeout time.Duration) string {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	for {
		envelope, err := readLoungeEnvelope(ctx, connection)
		if err != nil {
			t.Fatalf("read Lounge error: %v", err)
		}
		if protocolError := envelope.GetError(); protocolError != nil {
			return protocolError.Code
		}
	}
}

func assertSharedTicketConsumedOnce(
	t *testing.T,
	proxy apiClient,
	left, right *topologyProcess,
) {
	t.Helper()
	credential := issueLoungeTicket(t, proxy)
	type dialResult struct {
		connection *websocket.Conn
		status     int
		err        error
	}
	results := make(chan dialResult, 2)
	var wait sync.WaitGroup
	for _, process := range []*topologyProcess{left, right} {
		wait.Add(1)
		go func() {
			defer wait.Done()
			connection, response, err := dialLounge(process.baseURL, credential)
			status := 0
			if response != nil {
				status = response.StatusCode
				if response.Body != nil {
					_ = response.Body.Close()
				}
			}
			results <- dialResult{connection: connection, status: status, err: err}
		}()
	}
	wait.Wait()
	close(results)
	upgraded, unauthorized := 0, 0
	for result := range results {
		if result.connection != nil {
			upgraded++
			_ = result.connection.CloseNow()
			continue
		}
		if result.err != nil && result.status == http.StatusUnauthorized {
			unauthorized++
		}
	}
	if upgraded != 1 || unauthorized != 1 {
		t.Fatalf("shared ticket results = upgraded:%d unauthorized:%d, want 1/1", upgraded, unauthorized)
	}
}

func currentRoomOwner(t *testing.T, db *sql.DB, roomID string) (string, uint64) {
	t.Helper()
	var owner string
	var generation uint64
	if err := db.QueryRowContext(t.Context(), `SELECT replica_id, generation
		FROM team_lounge_room_ownership WHERE room_id = ?`, roomID).Scan(&owner, &generation); err != nil {
		t.Fatal(err)
	}
	return owner, generation
}

func processPair(
	t *testing.T,
	ownerID string,
	left, right *topologyProcess,
) (*topologyProcess, *topologyProcess) {
	t.Helper()
	switch ownerID {
	case left.id:
		return left, right
	case right.id:
		return right, left
	default:
		t.Fatalf("unexpected room owner %q", ownerID)
		return nil, nil
	}
}

func waitForReleasedOwnership(t *testing.T, db *sql.DB, roomID string) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		var owner sql.NullString
		if err := db.QueryRowContext(t.Context(), `SELECT replica_id
			FROM team_lounge_room_ownership WHERE room_id = ?`, roomID).Scan(&owner); err != nil {
			t.Fatal(err)
		}
		if !owner.Valid {
			return
		}
		time.Sleep(50 * time.Millisecond)
	}
	owner, generation := currentRoomOwner(t, db, roomID)
	t.Fatalf("graceful drain retained room ownership %s/%d", owner, generation)
}
