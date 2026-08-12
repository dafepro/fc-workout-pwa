import { expect, test } from "@playwright/test";

// F-S8 in a real browser. The unit tests assert the page reads the fragment and
// refuses the query, but only a browser can show what the move was for: that the
// token is in no request line and no Referer. jsdom answers questions about the
// component; this answers the one about the wire.
//
// No valid token is needed for any of it. Everything here happens before the
// token is offered to the backend, so an arbitrary value exercises the same code
// the real link does. Enrollment past the password step needs a mintable
// invitation and a TOTP code, which the browser suite has no fixture for yet;
// `backend/e2e/staff_console_test.go` covers that half over HTTP.

const TOKEN = "e2e-setup-token-that-must-not-be-sent";

test("the setup token stays out of every request and out of the URL", async ({
  page,
}) => {
  const requests: string[] = [];
  const referers: string[] = [];
  page.on("request", (request) => {
    requests.push(request.url());
    const referer = request.headers()["referer"];
    if (referer) referers.push(referer);
  });

  await page.goto(`/staff/setup#setup=${TOKEN}`);

  // The fragment was read: the first step is asking for the temporary password.
  await expect(page.getByLabel("Temporary password")).toBeVisible();

  // Stripped from the URL the moment it was read, so a back button and a shared
  // screen show nothing.
  expect(page.url()).not.toContain(TOKEN);
  expect(new URL(page.url()).hash).toBe("");

  // The part a unit test cannot see: nothing on the wire ever carried it. A
  // browser does not send a fragment, so this holds for the document request
  // and for every asset and XHR the page went on to make.
  expect(requests.length).toBeGreaterThan(0);
  expect(requests.filter((url) => url.includes(TOKEN))).toEqual([]);
  expect(referers.filter((referer) => referer.includes(TOKEN))).toEqual([]);
});

// The query is the old shape. Reading it as a fallback would keep minting the
// exposure the fragment removes, so a link in that form is refused outright and
// has to be reissued with `reset-staff-credential`.
test("a token in the query is refused rather than honoured", async ({
  page,
}) => {
  await page.goto(`/staff/setup?setup=${TOKEN}`);

  await expect(page.getByRole("alert")).toContainText(
    "This page needs the one-time setup link.",
  );
  await expect(page.getByLabel("Temporary password")).toHaveCount(0);
});

// REQ-403: the narrowest phone is the likeliest device for a link handed over in
// person, and this page is the first thing a new coach ever sees.
test("staff setup fits a 320 pixel phone", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto(`/staff/setup#setup=${TOKEN}`);
  await expect(page.getByLabel("Temporary password")).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  expect(overflow).toBe(false);
});
