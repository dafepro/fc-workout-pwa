import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { TeamRewardsPrototype } from "./TeamRewardsPrototype";

describe("staff team rewards prototype", () => {
  beforeEach(() => window.localStorage.clear());

  it("guides a coach from an empty state to one active reward", () => {
    render(<TeamRewardsPrototype teamId="team-1" />);

    expect(screen.getByText("Prototype data")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Create a team reward" }),
    );

    fireEvent.change(screen.getByLabelText("Prize name"), {
      target: { value: "Pizza after practice" },
    });
    fireEvent.change(screen.getByLabelText("Qualifying team days"), {
      target: { value: "6" },
    });

    expect(screen.getByText("Pizza after practice")).toBeInTheDocument();
    expect(
      screen.getByText(
        "80% of the team logs their recommended workout on 6 team days.",
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Publish reward" }));

    expect(screen.getByText("Active reward")).toBeInTheDocument();
    expect(screen.getByText("Recent team days")).toBeInTheDocument();
    expect(screen.getAllByText(/needed$/).length).toBeGreaterThan(0);
    expect(
      screen.queryByRole("button", { name: "Create a team reward" }),
    ).not.toBeInTheDocument();
  });

  it("switches to the teammate consistency template", () => {
    render(<TeamRewardsPrototype teamId="team-2" />);
    fireEvent.click(
      screen.getByRole("button", { name: "Create a team reward" }),
    );
    fireEvent.click(
      screen.getByRole("radio", { name: /Teammate consistency/ }),
    );

    expect(screen.getByLabelText("Number of teammates")).toBeInTheDocument();
    expect(screen.getByLabelText("Days per teammate")).toBeInTheDocument();
  });

  it("cancels without erasing the reward record", () => {
    render(<TeamRewardsPrototype teamId="team-3" />);
    fireEvent.click(
      screen.getByRole("button", { name: "Create a team reward" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Publish reward" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel reward" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, cancel reward" }));

    expect(screen.getByText("Cancelled reward")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create a team reward" }),
    ).toBeInTheDocument();
  });
});
