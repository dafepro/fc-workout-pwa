import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CanvasDevToolbox } from "./CanvasDevToolbox";

afterEach(cleanup);

describe("CanvasDevToolbox", () => {
  it("saves a bounded number of extra playground stamps", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <CanvasDevToolbox
        settings={{
          backgroundAssetId: "soccer-field",
          backgroundColor: "#89C981",
          textColor: "#FFFFFF",
          textSize: 112,
          textStyle: "block",
          stampChoices: ["soccer", "balloon", "rocket", "bolt", "star"],
          developerStampLimit: 3,
          revision: 1,
        }}
        onSave={onSave}
      />,
    );

    fireEvent.change(
      screen.getByRole("spinbutton", { name: "Extra playground stamps" }),
      { target: { value: "8" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Apply to live canvas" }),
    );

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ developerStampLimit: 8 }),
    );
  });
});
