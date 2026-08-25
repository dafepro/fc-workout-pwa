//go:build e2e

package e2e_test

import (
	"net/http"
	"testing"
)

type prizeBoxClaimResponse struct {
	Box struct {
		ID string `json:"id"`
	} `json:"box"`
}

type prizeBoxOpenResponse struct {
	Claim struct {
		ID   string `json:"id"`
		Item struct {
			ID string `json:"id"`
		} `json:"item"`
	} `json:"claim"`
}

func TestPrizeBoxClaimAndOpenReplayAcrossThePublicAPI(t *testing.T) {
	api := newAPIClient(t)
	api.reset(t)

	claimedResponse := api.do(t, http.MethodPost, "/v1/me/prize-boxes/claim-daily", masonToken, "prize-claim-replay", nil)
	assertStatus(t, claimedResponse, http.StatusCreated)
	var claimed prizeBoxClaimResponse
	decodeJSON(t, claimedResponse, &claimed)
	if claimed.Box.ID == "" {
		t.Fatal("claim response omitted the sealed box ID")
	}

	claimReplayResponse := api.do(t, http.MethodPost, "/v1/me/prize-boxes/claim-daily", masonToken, "prize-claim-replay", nil)
	assertStatus(t, claimReplayResponse, http.StatusOK)
	var claimReplay prizeBoxClaimResponse
	decodeJSON(t, claimReplayResponse, &claimReplay)
	if claimReplay.Box.ID != claimed.Box.ID {
		t.Fatalf("claim replay box = %q, want %q", claimReplay.Box.ID, claimed.Box.ID)
	}

	openedResponse := api.do(t, http.MethodPost, "/v1/me/prize-boxes/"+claimed.Box.ID+"/open", masonToken, "prize-open-replay", nil)
	assertStatus(t, openedResponse, http.StatusCreated)
	var opened prizeBoxOpenResponse
	decodeJSON(t, openedResponse, &opened)
	if opened.Claim.ID == "" || opened.Claim.Item.ID == "" {
		t.Fatalf("open response omitted the durable claim: %+v", opened)
	}

	openReplayResponse := api.do(t, http.MethodPost, "/v1/me/prize-boxes/"+claimed.Box.ID+"/open", masonToken, "prize-open-replay", nil)
	assertStatus(t, openReplayResponse, http.StatusOK)
	var openReplay prizeBoxOpenResponse
	decodeJSON(t, openReplayResponse, &openReplay)
	if openReplay.Claim.ID != opened.Claim.ID || openReplay.Claim.Item.ID != opened.Claim.Item.ID {
		t.Fatalf("open replay = %+v, want %+v", openReplay.Claim, opened.Claim)
	}

	overview := api.do(t, http.MethodGet, "/v1/me/prize-boxes", masonToken, "", nil)
	assertStatus(t, overview, http.StatusOK)
	var state struct {
		ReadyCount  int `json:"readyCount"`
		OpenedTotal int `json:"openedTotal"`
	}
	decodeJSON(t, overview, &state)
	if state.ReadyCount != 0 || state.OpenedTotal != 1 {
		t.Fatalf("replays duplicated box state: %+v", state)
	}
}
