import assert from "node:assert/strict";
import test from "node:test";
import {
  invitationActionUrl,
  invitationTokenFromUrl,
} from "../packages/authz/invitation-link";

test("invitation email links use a mail-compatible query token", () => {
  const action = new URL(
    invitationActionUrl("https://os.example.test", "one-time-secret"),
  );

  assert.equal(action.origin, "https://os.example.test");
  assert.equal(action.pathname, "/join");
  assert.equal(action.hash, "");
  assert.equal(action.searchParams.get("token"), "one-time-secret");
});

test("invitation exchange accepts new links and existing fragment links", () => {
  assert.equal(
    invitationTokenFromUrl(
      "https://os.example.test/join?token=new-one-time-secret",
    ),
    "new-one-time-secret",
  );
  assert.equal(
    invitationTokenFromUrl(
      "https://os.example.test/join#token=legacy-one-time-secret",
    ),
    "legacy-one-time-secret",
  );
});
