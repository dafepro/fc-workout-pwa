import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { activities, initialEntries } from "../data/mockData";
import { SessionList } from "./SessionList";

describe("shared session list", () => {
  it("uses the same three-row summary and load-more behavior on every surface", () => {
    render(<SessionList entries={initialEntries} activities={activities} />);

    expect(screen.getByRole("heading", { name: "My Sessions" })).toBeVisible();
    expect(screen.getAllByRole("link")).toHaveLength(3);

    fireEvent.click(screen.getByRole("button", { name: "Load more sessions" }));
    expect(screen.getAllByRole("link")).toHaveLength(6);
  });
});
