package httpapi

import "testing"

type loungeMetricsObserver struct {
	connections float64
	messages    [][2]string
}

func (observer *loungeMetricsObserver) AddCanvasConnection(delta float64) {
	observer.connections += delta
}

func (observer *loungeMetricsObserver) ObserveCanvasMessage(kind, outcome string) {
	observer.messages = append(observer.messages, [2]string{kind, outcome})
}

func (*loungeMetricsObserver) ObserveFeature(string, string, string) {}

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

	if observer.connections != 0 ||
		!observer.sawMessage("reaction", "success") ||
		!observer.sawMessage("reaction", "rejected") {
		t.Fatalf("lounge metrics = %+v", observer)
	}
}
