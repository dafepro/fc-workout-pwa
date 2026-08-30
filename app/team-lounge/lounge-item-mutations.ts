import type {
  ItemMutationOptions,
  ItemMutationOutcome,
} from "@canvas-physics/client";

import {
  requestTeamLoungeItemMutationPermit,
  type TeamLoungeItemMutationKind,
  type TeamLoungeItemTransform,
} from "./lounge-gateway";

interface MutationRuntime {
  moveItem(
    entityID: string,
    transform: TeamLoungeItemTransform,
    options: ItemMutationOptions,
  ): { settled: Promise<ItemMutationOutcome> };
  rotateItem(
    entityID: string,
    rotation: number,
    options: ItemMutationOptions,
  ): { settled: Promise<ItemMutationOutcome> };
  scaleItem(
    entityID: string,
    scale: number,
    options: ItemMutationOptions,
  ): { settled: Promise<ItemMutationOutcome> };
  deleteItem(
    entityID: string,
    options: ItemMutationOptions,
  ): { settled: Promise<ItemMutationOutcome> };
}

export async function performLoungeItemMutation({
  runtime,
  requestPermit = requestTeamLoungeItemMutationPermit,
  teamID,
  roomID,
  item,
  kind,
  transform,
  idempotencyKey,
}: {
  runtime: MutationRuntime;
  requestPermit: typeof requestTeamLoungeItemMutationPermit;
  teamID: string;
  roomID: string;
  item: {
    entityID: string;
    itemRevision: number;
    transform: TeamLoungeItemTransform;
  };
  kind: TeamLoungeItemMutationKind;
  transform: TeamLoungeItemTransform | null;
  idempotencyKey: string;
}) {
  const authorization = await requestPermit(
    teamID,
    roomID,
    item.entityID,
    item.itemRevision,
    kind,
    transform,
    idempotencyKey,
  );
  const options = {
    authorizationEvidence: new TextEncoder().encode(authorization.permit),
    applicationCorrelationId: authorization.mutationPermitID,
  };
  const target = authorization.transform;
  const receipt =
    kind === "transform" && target
      ? runtime.moveItem(item.entityID, target, options)
      : kind === "rotation" && target
        ? runtime.rotateItem(item.entityID, target.rotation, options)
        : kind === "scale" && target
          ? runtime.scaleItem(item.entityID, target.scale, options)
          : runtime.deleteItem(item.entityID, options);
  return {
    outcome: await receipt.settled,
    currentTransform: authorization.currentTransform,
    targetTransform: authorization.transform,
  };
}
