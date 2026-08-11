import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultAvatar } from "../../avatar/config";
import AvatarStudioPage from "./page";

const { push, saveAvatar } = vi.hoisted(() => ({
  push: vi.fn(),
  saveAvatar: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("../../state/auth-context", () => ({
  useAuth: () => ({ avatarConfig: defaultAvatar(), saveAvatar }),
}));

afterEach(() => {
  cleanup();
  push.mockClear();
  saveAvatar.mockClear();
});

describe("AvatarStudioPage", () => {
  it("returns to the profile with a toast flag after saving", async () => {
    render(<AvatarStudioPage />);
    fireEvent.click(screen.getByRole("radio", { name: "Tall person" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(saveAvatar).toHaveBeenCalledTimes(1));
    expect(push).toHaveBeenCalledWith("/me?avatar=saved");
  });
});
