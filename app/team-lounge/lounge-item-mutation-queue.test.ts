import { describe, expect, it, vi } from "vitest";

import {
  createLoungeItemMutationQueue,
  type LoungeQueuedMutation,
} from "./lounge-item-mutation-queue";

const item = {
  entityID: "item-one",
  itemRevision: 3,
  transform: { x: 20, y: 70, rotation: 0, scale: 1 },
};

describe("Lounge item mutation queue", () => {
  it("optimistically applies every input but sends only the latest debounced angle", async () => {
    vi.useFakeTimers();
    const execute = vi.fn(async (request) => ({
      status: "accepted" as const,
      itemRevision: request.item.itemRevision + 1,
      transform: request.transform!,
    }));
    const onOptimistic = vi.fn();
    const queue = createLoungeItemMutationQueue({
      debounceMs: 120,
      execute,
      onOptimistic,
    });

    queue.enqueue(item, "rotation", { ...item.transform, rotation: 0.25 });
    queue.enqueue(item, "rotation", { ...item.transform, rotation: 0.5 });
    queue.enqueue(item, "rotation", { ...item.transform, rotation: 0.75 });

    expect(onOptimistic).toHaveBeenCalledTimes(3);
    expect(onOptimistic).toHaveBeenLastCalledWith("item-one", {
      ...item.transform,
      rotation: 0.75,
    });
    await vi.advanceTimersByTimeAsync(119);
    expect(execute).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await queue.whenIdle("item-one");

    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0]?.[0]).toMatchObject({
      kind: "rotation",
      item: { itemRevision: 3 },
      transform: { rotation: 0.75 },
    });
    queue.dispose();
    vi.useRealTimers();
  });

  it("serializes acknowledgements and collapses repeated input received in flight", async () => {
    vi.useFakeTimers();
    const completions: Array<
      (result: {
        status: "accepted";
        itemRevision: number;
        transform: typeof item.transform;
      }) => void
    > = [];
    const execute = vi.fn((request: LoungeQueuedMutation) => {
      void request;
      return new Promise<{
        status: "accepted";
        itemRevision: number;
        transform: typeof item.transform;
      }>((resolve) => completions.push(resolve));
    });
    const queue = createLoungeItemMutationQueue({ debounceMs: 100, execute });

    queue.enqueue(item, "scale", { ...item.transform, scale: 1.1 });
    await vi.advanceTimersByTimeAsync(100);
    expect(execute).toHaveBeenCalledTimes(1);

    queue.enqueue(item, "scale", { ...item.transform, scale: 1.2 });
    queue.enqueue(item, "scale", { ...item.transform, scale: 1.3 });
    await vi.advanceTimersByTimeAsync(100);
    expect(execute).toHaveBeenCalledTimes(1);

    completions[0]?.({
      status: "accepted",
      itemRevision: 4,
      transform: { ...item.transform, scale: 1.1 },
    });
    await vi.runAllTimersAsync();
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls[1]?.[0]).toMatchObject({
      item: { itemRevision: 4, transform: { scale: 1.1 } },
      transform: { scale: 1.3 },
    });

    completions[1]?.({
      status: "accepted",
      itemRevision: 5,
      transform: { ...item.transform, scale: 1.3 },
    });
    await queue.whenIdle("item-one");
    expect(execute).toHaveBeenCalledTimes(2);
    queue.dispose();
    vi.useRealTimers();
  });

  it("retains the acknowledged revision when the next gesture has stale UI props", async () => {
    vi.useFakeTimers();
    const execute = vi.fn(async (request) => ({
      status: "accepted" as const,
      itemRevision: request.item.itemRevision + 1,
      transform: request.transform!,
    }));
    const queue = createLoungeItemMutationQueue({ debounceMs: 100, execute });

    queue.enqueue(item, "scale", { ...item.transform, scale: 1.1 });
    await vi.advanceTimersByTimeAsync(100);
    await queue.whenIdle(item.entityID);
    queue.enqueue(item, "rotation", { ...item.transform, rotation: 0.25 });
    await vi.advanceTimersByTimeAsync(100);
    await queue.whenIdle(item.entityID);

    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls[1]?.[0]).toMatchObject({
      item: { itemRevision: 4, transform: { scale: 1.1 } },
      transform: { rotation: 0.25, scale: 1.1 },
    });
    queue.dispose();
    vi.useRealTimers();
  });
});
