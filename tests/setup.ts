import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Testing Library registers this itself only when `globals` is on, and it is
// not. Without it every render stays in the document for the next test, which
// turned "there is one staff link" into a race the suite lost intermittently.
afterEach(cleanup);

// jsdom ships no PointerEvent, so events fired at pointer handlers arrive
// stripped of clientX/pointerId. Back it with MouseEvent, which carries them.
const pointerHost = window as unknown as { PointerEvent?: unknown };

if (!pointerHost.PointerEvent) {
  class JsdomPointerEvent extends MouseEvent {
    readonly pointerId: number;
    readonly pointerType: string;

    constructor(
      type: string,
      init: MouseEventInit & { pointerId?: number; pointerType?: string } = {},
    ) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
      this.pointerType = init.pointerType ?? "";
    }
  }

  pointerHost.PointerEvent = JsdomPointerEvent;
}
