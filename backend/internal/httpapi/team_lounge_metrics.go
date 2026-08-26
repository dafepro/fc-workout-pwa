package httpapi

import "strings"

type teamLoungeRoomMetrics struct {
	observer OperationalObserver
}

func newTeamLoungeRoomMetrics(observer OperationalObserver) teamLoungeRoomMetrics {
	return teamLoungeRoomMetrics{observer: observer}
}

func (metrics teamLoungeRoomMetrics) RoomOpened(string) {
	metrics.feature("connection", "success")
}

func (metrics teamLoungeRoomMetrics) RoomSlept(string) {
	metrics.feature("connection", "disconnected")
}

func (metrics teamLoungeRoomMetrics) ClientJoined(string) {
	if metrics.observer == nil {
		return
	}
	metrics.observer.AddCanvasConnection(1)
	metrics.observer.ObserveCanvasMessage("presence", "success")
}

func (metrics teamLoungeRoomMetrics) ClientLeft(string, string) {
	if metrics.observer == nil {
		return
	}
	metrics.observer.AddCanvasConnection(-1)
	metrics.observer.ObserveCanvasMessage("presence", "disconnected")
}

func (teamLoungeRoomMetrics) RelayBytes(string, int) {}

func (metrics teamLoungeRoomMetrics) HostLeaseChanged(string, uint64, string) {
	metrics.message("physics", "success")
}

func (metrics teamLoungeRoomMetrics) CheckpointStored(string, int) {
	metrics.message("physics", "success")
}

func (metrics teamLoungeRoomMetrics) DurableAccepted(_ string, operation string) {
	stampOperation := map[string]string{
		"spawn": "stamp_placement",
		"move":  "stamp_move",
		"scale": "stamp_scale",
	}[operation]
	if stampOperation != "" {
		metrics.feature(stampOperation, "success")
		return
	}
	metrics.message("physics", "success")
}

func (metrics teamLoungeRoomMetrics) DurableRejected(_ string, reason string) {
	if strings.HasPrefix(reason, "stamp_") {
		metrics.feature("stamp_placement", "rejected")
		return
	}
	metrics.message("physics", "rejected")
}

func (metrics teamLoungeRoomMetrics) ProtocolMismatch(string) {
	metrics.message("connection", "invalid")
}

func (metrics teamLoungeRoomMetrics) ParticipantSignal(_ string, result string) {
	outcome := "rejected"
	if result == "accepted" {
		outcome = "success"
	} else if result == "rate_limited" {
		outcome = "rate_limited"
	}
	metrics.message("reaction", outcome)
}

func (metrics teamLoungeRoomMetrics) message(kind, outcome string) {
	if metrics.observer != nil {
		metrics.observer.ObserveCanvasMessage(kind, outcome)
	}
}

func (metrics teamLoungeRoomMetrics) feature(operation, outcome string) {
	if metrics.observer != nil {
		metrics.observer.ObserveFeature("canvas", operation, outcome)
	}
}
