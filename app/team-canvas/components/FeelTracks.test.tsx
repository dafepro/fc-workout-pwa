import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FeelTracks } from "./FeelTracks";

afterEach(cleanup);

describe("FeelTracks", () => {
  it("uses two direct native tracks with friendly current values", () => {
    const onEffortChange = vi.fn();
    const onTirednessChange = vi.fn();
    const { container } = render(
      <FeelTracks
        effort={4}
        tiredness={3}
        onEffortChange={onEffortChange}
        onTirednessChange={onTirednessChange}
      />,
    );

    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getByRole("slider", { name: "Effort" })).toHaveValue("4");
    expect(screen.getByRole("slider", { name: "Tiredness" })).toHaveValue("3");
    expect(screen.getByText("😅 Hard")).toBeInTheDocument();
    expect(screen.getByText("🙂 A little tired")).toBeInTheDocument();
    expect(container.querySelectorAll(".tc-feel-track__zoomi")).toHaveLength(0);

    fireEvent.change(screen.getByRole("slider", { name: "Effort" }), {
      target: { value: "5" },
    });
    fireEvent.change(screen.getByRole("slider", { name: "Tiredness" }), {
      target: { value: "6" },
    });

    expect(onEffortChange).toHaveBeenCalledWith(5);
    expect(onTirednessChange).toHaveBeenCalledWith(6);
  });
});
