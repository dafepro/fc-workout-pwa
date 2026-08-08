import { describe, expect, it } from "vitest";
import { GATE_COOKIE, GATE_PATH, guardStaffConsole } from "./staff-gate";

const config = { key: "otter-heron-bison", secure: true };

function get(path: string, cookie?: string) {
  return new Request(`https://zoomigo.example/${path.replace(/^\//, "")}`, {
    headers: cookie ? { cookie } : undefined,
  });
}

async function admittedCookie(): Promise<string> {
  const body = new FormData();
  body.set("phrase", config.key);
  const response = await guardStaffConsole(
    new Request(`https://zoomigo.example${GATE_PATH}`, {
      method: "POST",
      body,
    }),
    config,
  );
  const setCookie = response!.headers.get("set-cookie")!;
  return setCookie.split(";")[0];
}

describe("staff console access gate", () => {
  it("lets every player route past untouched", async () => {
    for (const path of ["/", "/log", "/team", "/leaders", "/me", "/login"]) {
      expect(await guardStaffConsole(get(path), config)).toBeNull();
    }
  });

  it("sends an unadmitted console request to the gate instead of the app", async () => {
    const response = await guardStaffConsole(get("/staff/admin"), config);
    expect(response?.status).toBe(302);
    expect(response?.headers.get("location")).toContain(GATE_PATH);
  });

  it("fails closed when no key is configured", async () => {
    const response = await guardStaffConsole(get("/staff"), {
      key: undefined,
      secure: true,
    });
    expect(response?.status).toBe(404);
  });

  it("admits the phrase however it was typed, and refuses anything else", async () => {
    for (const typed of [
      "otter-heron-bison",
      "Otter Heron Bison",
      " otter_heron_bison ",
    ]) {
      const body = new FormData();
      body.set("phrase", typed);
      const response = await guardStaffConsole(
        new Request(`https://zoomigo.example${GATE_PATH}`, {
          method: "POST",
          body,
        }),
        config,
      );
      expect(response?.status).toBe(303);
      expect(response?.headers.get("set-cookie")).toContain("Path=/staff");
      expect(response?.headers.get("set-cookie")).toContain("HttpOnly");
    }

    const wrong = new FormData();
    wrong.set("phrase", "otter-heron-badger");
    const refused = await guardStaffConsole(
      new Request(`https://zoomigo.example${GATE_PATH}`, {
        method: "POST",
        body: wrong,
      }),
      config,
    );
    expect(refused?.status).toBe(401);
    expect(refused?.headers.get("set-cookie")).toBeNull();
  });

  it("lets an admitted device through to the application", async () => {
    const cookie = await admittedCookie();
    expect(cookie.startsWith(`${GATE_COOKIE}=`)).toBe(true);
    expect(
      await guardStaffConsole(get("/staff/admin", cookie), config),
    ).toBeNull();
  });

  it("stops admitting a device once the phrase changes", async () => {
    const cookie = await admittedCookie();
    const response = await guardStaffConsole(get("/staff", cookie), {
      ...config,
      key: "otter-heron-badger",
    });
    expect(response?.status).toBe(302);
  });
});
