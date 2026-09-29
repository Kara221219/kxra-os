import assert from "node:assert/strict";
import test from "node:test";
import {
  invitationActionUrl,
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
