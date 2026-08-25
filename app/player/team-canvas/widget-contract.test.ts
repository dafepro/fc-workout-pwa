import { describe, expect, it } from "vitest";
import {
  supportsTeamCanvasWidgetContract,
  TEAM_CANVAS_WIDGET_CONTRACT_VERSION,
} from "./widget-contract";
import { initialTeamCanvasState } from "../../team-canvas/model";

describe("Team Canvas widget contract", () => {
  it("accepts only the frozen v1 host boundary", () => {
    const action = () => undefined;
    const contract = {
      version: TEAM_CANVAS_WIDGET_CONTRACT_VERSION,
      identity: { teamID: "team-one", playerID: "player-one", avatar: null },
      access: { state: "ready", error: null },
      room: {
        localState: initialTeamCanvasState(),
        projection: null,
        localSettings: {
          backgroundAssetId: "soccer-field",
          backgroundColor: "#FFFFFF",
          textColor: "#112233",
          textSize: 112,
          textStyle: "block",
          stampChoices: [],
          developerStampLimit: 0,
          revision: 1,
        },
        selectedPieceID: null,
      },
      inventory: { availableCount: 0, choices: [], unlock: action },
      actions: {
        moveAvatar: action,
        placeStamp: action,
        togglePiece: action,
        editPiece: action,
        deletePiece: action,
        clearPiece: action,
        saveSettings: action,
      },
      lifecycle: { connection: "connected", reducedMotion: false },
      telemetry: {
        reconnects: 0,
        inputToRenderMs: null,
        correctionDistance: 0,
        hostEpoch: 1,
        droppedFrames: 0,
        checkpointAgeMs: null,
      },
    };
    expect(supportsTeamCanvasWidgetContract(contract)).toBe(true);
    expect(
      supportsTeamCanvasWidgetContract({
        ...contract,
        actions: { ...contract.actions, deletePiece: undefined },
      }),
    ).toBe(false);
  });
});
