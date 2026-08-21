import { afterEach, describe, expect, it, vi } from "vitest";
import { createLatestInputQueue } from "./live-input";

afterEach(() => vi.useRealTimers());

describe("latest live input queue", () => {
  it("coalesces rapid movement without starving a continuous drag", async () => {
    vi.useFakeTimers();
    const sent: number[] = [];
    const queue = createLatestInputQueue<number>(80, async (value) => {
      sent.push(value);
    });

    queue.push(1);
    queue.push(2);
    await vi.advanceTimersByTimeAsync(80);
    queue.push(3);
    queue.push(4);
    await vi.advanceTimersByTimeAsync(80);

    expect(sent).toEqual([2, 4]);
    queue.stop();
  });

  it("never overlaps requests and sends the newest queued value afterward", async () => {
    vi.useFakeTimers();
    let release!: () => void;
    const sent: number[] = [];
    const queue = createLatestInputQueue<number>(40, async (value) => {
      sent.push(value);
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    });

    queue.push(1);
    await vi.advanceTimersByTimeAsync(40);
    queue.push(2);
    queue.push(3);
    await vi.advanceTimersByTimeAsync(80);
    expect(sent).toEqual([1]);
    release();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(40);
    expect(sent).toEqual([1, 3]);
    queue.stop();
  });
});
