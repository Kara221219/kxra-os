import assert from "node:assert/strict";
import test from "node:test";
import {
  invitationActionUrl,
  invitationFragmentPath,
  invitationTokenFromUrl,
} from "../packages/authz/invitation-link";

const token = "aBcdEFghIJklMNopQRstUVwxYZ0123456789_-ab";

test("invitation email links use a mobile-privacy-compatible path token", () => {
  const action = new URL(invitationActionUrl("https://os.example.test", token));

  assert.equal(action.origin, "https://os.example.test");
  assert.equal(action.pathname, `/join/${token}`);
  assert.equal(action.hash, "");
  assert.equal(action.search, "");
});

test("invitation exchange accepts path links and both legacy link forms", () => {
  assert.equal(
    invitationTokenFromUrl(`https://os.example.test/join/${token}`),
    token,
  );
  assert.equal(
    invitationTokenFromUrl(`https://os.example.test/join?token=${token}`),
    token,
  );
  assert.equal(
    invitationTokenFromUrl(`https://os.example.test/join#token=${token}`),
    token,
  );
});

test("invitation email links reject malformed bearer values", () => {
  assert.throws(
    () => invitationActionUrl("https://os.example.test", "too-short"),
    /INVITATION_TOKEN_INVALID/,
  );
});

test("canonical invitation redirects use a fixed fragment destination without reflecting invalid values", () => {
  const valid = new URL(
    invitationFragmentPath(token),
    "https://os.example.test",
  );
  assert.equal(valid.origin, "https://os.example.test");
  assert.equal(valid.pathname, "/join");
  assert.equal(valid.search, "");
  assert.equal(invitationTokenFromUrl(valid.href), token);
  for (const invalid of [
    null,
    undefined,
    [token],
    "too-short",
    "a".repeat(101),
    "https://evil.invalid",
    "//evil.invalid",
    "a".repeat(32) + "\n",
  ])
    assert.equal(
      invitationFragmentPath(invalid),
      "/join/account?state=invalid",
    );
});

test("path normalization is a private side-effect-free redirect, with no cookie creation", async () => {
  const { GET } = await import("../apps/os/app/join/[token]/route");
  for (const value of [token, "too-short"]) {
    const response = await GET(
      new Request(
        "https://os.example.test/join/ignored?next=https://evil.invalid",
      ),
      { params: Promise.resolve({ token: value }) },
    );
    assert.equal(response.status, 307);
    assert.equal(
      response.headers.get("location"),
      invitationFragmentPath(value),
    );
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    assert.equal(response.headers.get("set-cookie"), null);
  }
});
