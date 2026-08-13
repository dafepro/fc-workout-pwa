import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WorkoutSelect, type WorkoutChoice } from "./WorkoutSelect";

const presets: WorkoutChoice[] = [
  {
    key: "distance_run_1mi",
    name: "Distance Run (1 mile)",
    description: "1 mile",
    icon: "◎",
    accent: "distance-run",
  },
  {
    key: "hill_sprints_8x6",
    name: "Hill Sprints (8x6)",
    description: "6 reps",
    icon: "↗",
    accent: "hill-sprints",
  },
];

function renderSelect(onSelect = vi.fn(), selectedKey = "hill_sprints_8x6") {
  render(
    <WorkoutSelect
      label="Activity"
      choices={presets}
      selectedKey={selectedKey}
      onSelect={onSelect}
      uniform
    />,
  );
  return onSelect;
}

const summary = () =>
  screen.getByRole("button", { name: /^Selected activity:/ });

// REQ-510. The console gets the athlete's picker, so the behaviour alpha 0.9
// argued through -- a bounded, temporary surface that closes on a choice --
// has to survive being made reusable.
describe("workout select", () => {
  it("shows the current choice and keeps the options closed until asked", () => {
    renderSelect();

    expect(summary()).toHaveTextContent("Hill Sprints (8x6)");
    expect(summary()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("radio")).toBeNull();
  });

  it("opens a bounded panel and closes it again on a choice", () => {
    const onSelect = renderSelect();

    fireEvent.click(summary());
    expect(summary()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("radio")).toHaveLength(2);

    fireEvent.click(
      screen.getByRole("radio", { name: /^Distance Run \(1 mile\)/ }),
    );

    expect(onSelect).toHaveBeenCalledWith("distance_run_1mi");
    expect(screen.queryByRole("radio")).toBeNull();
  });

  it("accents the summary by activity, not by the choice's own key", () => {
    renderSelect(vi.fn(), "distance_run_1mi");

    // A preset key would produce no accent at all; the CSS is keyed on the
    // activity, and several presets share one.
    expect(summary().className).toContain("selected-activity--distance-run");
  });

  it("drops the info popover for choices that carry no instructions", () => {
    renderSelect();
    fireEvent.click(summary());

    expect(screen.queryByRole("button", { name: /^How to do/ })).toBeNull();
  });

  it("renders nothing rather than guessing when the selection is unknown", () => {
    const { container } = render(
      <WorkoutSelect
        label="Activity"
        choices={presets}
        selectedKey="retired_preset"
        onSelect={vi.fn()}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
