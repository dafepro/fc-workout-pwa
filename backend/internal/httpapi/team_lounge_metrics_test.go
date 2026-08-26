package httpapi

import (
	"slices"
	"testing"
)

type loungeMetricsObserver struct {
	connections float64
	messages    [][2]string
	features    [][3]string
}

func (observer *loungeMetricsObserver) AddCanvasConnection(delta float64) {
	observer.connections += delta
}

func (observer *loungeMetricsObserver) ObserveCanvasMessage(kind, outcome string) {
	observer.messages = append(observer.messages, [2]string{kind, outcome})
}

func (observer *loungeMetricsObserver) ObserveFeature(feature, operation, outcome string) {
	observer.features = append(observer.features, [3]string{feature, operation, outcome})
}

func (observer *loungeMetricsObserver) sawMessage(kind, outcome string) bool {
	for _, message := range observer.messages {
		if message == [2]string{kind, outcome} {
			return true
		}
	}
	return false
}

func TestTeamLoungeMetricsMapSDKEventsToBoundedOperations(t *testing.T) {
	observer := &loungeMetricsObserver{}
	metrics := newTeamLoungeRoomMetrics(observer)
	metrics.ClientJoined("private-room-id")
	metrics.ParticipantSignal("private-room-id", "accepted")
	metrics.ParticipantSignal("private-room-id", "kind_rejected")
	metrics.ClientLeft("private-room-id", "closed")
	metrics.DurableAccepted("private-room-id", "spawn")
	metrics.DurableAccepted("private-room-id", "move")
	metrics.DurableAccepted("private-room-id", "scale")
	metrics.DurableRejected("private-room-id", "stamp_unavailable")

	if observer.connections != 0 ||
		!observer.sawMessage("reaction", "success") ||
		!observer.sawMessage("reaction", "rejected") ||
		!slices.Contains(observer.features, [3]string{"canvas", "stamp_placement", "success"}) ||
		!slices.Contains(observer.features, [3]string{"canvas", "stamp_move", "success"}) ||
		!slices.Contains(observer.features, [3]string{"canvas", "stamp_scale", "success"}) ||
		!slices.Contains(observer.features, [3]string{"canvas", "stamp_placement", "rejected"}) {
		t.Fatalf("lounge metrics = %+v", observer)
	}
}
