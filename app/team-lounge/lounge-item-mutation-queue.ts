import type {
  TeamLoungeItemMutationKind,
  TeamLoungeItemTransform,
} from "./lounge-gateway";

export interface LoungeMutationItem {
  entityID: string;
  itemRevision: number;
  transform: TeamLoungeItemTransform;
}

export interface LoungeQueuedMutation {
  item: LoungeMutationItem;
  kind: TeamLoungeItemMutationKind;
  transform: TeamLoungeItemTransform | null;
}

export type LoungeMutationExecutionResult =
  | {
      status: "accepted";
      itemRevision: number;
      transform: TeamLoungeItemTransform | null;
    }
  | {
      status: "rejected";
      itemRevision: number;
      transform: TeamLoungeItemTransform;
      error?: unknown;
    };

interface QueuedOperation {
  kind: TeamLoungeItemMutationKind;
  transform: TeamLoungeItemTransform | null;
}

interface EntityQueue {
  authoritative: LoungeMutationItem;
  desired: TeamLoungeItemTransform;
  operations: QueuedOperation[];
  running: boolean;
  readyAt: number;
  timer?: ReturnType<typeof setTimeout>;
  idleResolvers: Array<() => void>;
}

export function createLoungeItemMutationQueue({
  debounceMs = 180,
  execute,
  onOptimistic,
  onAccepted,
  onDeleted,
  onRejected,
  onPendingChange,
}: {
  debounceMs?: number;
  execute(
    request: LoungeQueuedMutation,
  ): Promise<LoungeMutationExecutionResult>;
  onOptimistic?(entityID: string, transform: TeamLoungeItemTransform): void;
  onAccepted?(
    entityID: string,
    authoritative: LoungeMutationItem,
    displayedTransform: TeamLoungeItemTransform,
    kind: TeamLoungeItemMutationKind,
  ): void;
  onDeleted?(entityID: string): void;
  onRejected?(
    entityID: string,
    authoritative: LoungeMutationItem,
    error: unknown,
  ): void;
  onPendingChange?(pending: boolean): void;
}) {
  const queues = new Map<string, EntityQueue>();
  let disposed = false;
  let pending = false;

  const cloneTransform = (transform: TeamLoungeItemTransform) => ({
    ...transform,
  });
  const notifyPending = () => {
    const next = [...queues.values()].some(
      (queue) => queue.running || queue.operations.length > 0,
    );
    if (next === pending) return;
    pending = next;
    onPendingChange?.(next);
  };
  const settleIdle = (queue: EntityQueue) => {
    if (queue.running || queue.operations.length > 0) return;
    for (const resolve of queue.idleResolvers.splice(0)) resolve();
    notifyPending();
  };
  const schedule = (entityID: string, queue: EntityQueue) => {
    if (disposed || queue.running || queue.operations.length === 0) return;
    if (queue.timer) clearTimeout(queue.timer);
    queue.timer = setTimeout(
      () => {
        queue.timer = undefined;
        void drain(entityID, queue);
      },
      Math.max(0, queue.readyAt - Date.now()),
    );
  };
  const drain = async (entityID: string, queue: EntityQueue) => {
    if (disposed || queue.running || queue.operations.length === 0) return;
    if (Date.now() < queue.readyAt) {
      schedule(entityID, queue);
      return;
    }
    const operation = queue.operations.shift();
    if (!operation) return;
    queue.running = true;
    notifyPending();
    const item = {
      ...queue.authoritative,
      transform: cloneTransform(queue.authoritative.transform),
    };
    const target = mutationTarget(item.transform, operation);
    try {
      const result = await execute({
        item,
        kind: operation.kind,
        transform: target,
      });
      if (disposed) return;
      if (result.status === "accepted") {
        if (operation.kind === "delete" || !result.transform) {
          queues.delete(entityID);
          for (const resolve of queue.idleResolvers.splice(0)) resolve();
          onDeleted?.(entityID);
        } else {
          queue.authoritative = {
            entityID,
            itemRevision: result.itemRevision,
            transform: cloneTransform(result.transform),
          };
          if (queue.operations.length === 0) {
            queue.desired = cloneTransform(result.transform);
          }
          onAccepted?.(
            entityID,
            queue.authoritative,
            cloneTransform(queue.desired),
            operation.kind,
          );
        }
      } else {
        queue.operations = [];
        queue.authoritative = {
          entityID,
          itemRevision: result.itemRevision,
          transform: cloneTransform(result.transform),
        };
        queue.desired = cloneTransform(result.transform);
        onRejected?.(entityID, queue.authoritative, result.error);
      }
    } catch (error) {
      if (!disposed) {
        queue.operations = [];
        queue.desired = cloneTransform(queue.authoritative.transform);
        onRejected?.(entityID, queue.authoritative, error);
      }
    } finally {
      queue.running = false;
      if (!disposed && queues.get(entityID) === queue) {
        if (queue.operations.length > 0) {
          schedule(entityID, queue);
        } else {
          settleIdle(queue);
        }
      }
      notifyPending();
    }
  };

  return {
    enqueue(
      item: LoungeMutationItem,
      kind: TeamLoungeItemMutationKind,
      transform: TeamLoungeItemTransform | null,
    ) {
      if (disposed) return;
      let queue = queues.get(item.entityID);
      if (!queue) {
        queue = {
          authoritative: {
            ...item,
            transform: cloneTransform(item.transform),
          },
          desired: cloneTransform(item.transform),
          operations: [],
          running: false,
          readyAt: 0,
          idleResolvers: [],
        };
        queues.set(item.entityID, queue);
      } else if (
        !queue.running &&
        item.itemRevision > queue.authoritative.itemRevision
      ) {
        queue.authoritative = {
          ...item,
          transform: cloneTransform(item.transform),
        };
      }

      if (kind === "delete") {
        queue.operations = [{ kind, transform: null }];
      } else if (transform) {
        queue.desired = applyMutation(queue.desired, kind, transform);
        onOptimistic?.(item.entityID, cloneTransform(queue.desired));
        const replacement = queue.operations.findIndex(
          (operation) => operation.kind === kind,
        );
        const operation = { kind, transform: cloneTransform(transform) };
        if (replacement >= 0) queue.operations[replacement] = operation;
        else queue.operations.push(operation);
      }

      queue.readyAt =
        Date.now() + (kind === "rotation" || kind === "scale" ? debounceMs : 0);
      notifyPending();
      schedule(item.entityID, queue);
    },
    whenIdle(entityID: string) {
      const queue = queues.get(entityID);
      if (!queue || (!queue.running && queue.operations.length === 0)) {
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => queue.idleResolvers.push(resolve));
    },
    dispose() {
      disposed = true;
      for (const queue of queues.values()) {
        if (queue.timer) clearTimeout(queue.timer);
        for (const resolve of queue.idleResolvers.splice(0)) resolve();
      }
      queues.clear();
      notifyPending();
    },
  };
}

function applyMutation(
  current: TeamLoungeItemTransform,
  kind: TeamLoungeItemMutationKind,
  target: TeamLoungeItemTransform,
) {
  switch (kind) {
    case "transform":
      return { ...current, x: target.x, y: target.y };
    case "rotation":
      return { ...current, rotation: target.rotation };
    case "scale":
      return { ...current, scale: target.scale };
    case "delete":
      return current;
  }
}

function mutationTarget(
  current: TeamLoungeItemTransform,
  operation: QueuedOperation,
) {
  return operation.transform
    ? applyMutation(current, operation.kind, operation.transform)
    : null;
}
