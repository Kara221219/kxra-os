import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import crypto from "node:crypto";
import {
  assertOwnerOverviewSourceTransition,
  ownerOverviewTransitionAnchors,
} from "../scripts/owner-overview-source-transition.mjs";
import path from "node:path";
import {
  assertCustomerFirstUseSourceTransition,
  customerFirstUseTransitionAnchors,
} from "../scripts/customer-first-use-source-transition.mjs";
const root = path.resolve(import.meta.dirname, "..");
const recordPath =
  "packages/release/customer-first-use-source-transition-v1.json";
const predecessorPath =
  "packages/release/owner-overview-source-transition-v1.json";
const rows = Object.entries(customerFirstUseTransitionAnchors);

for (const [file, prior] of rows)
  test(`${file}: exact first-use bytes and the reviewed predecessor are mandatory`, () => {
    const bytes = fs.readFileSync(path.join(root, file));
    assert.equal(
      assertCustomerFirstUseSourceTransition(file, prior, root, bytes),
      true,
    );
    const changed = Buffer.from(bytes);
    changed[0] ^= 1;
    for (const bad of [
      changed,
      bytes.subarray(0, -1),
      Buffer.concat([bytes, Buffer.from("\n// added\n")]),
      Buffer.alloc(0),
    ])
      assert.throws(
        () => assertCustomerFirstUseSourceTransition(file, prior, root, bad),
        /UNREVIEWED_CUSTOMER_FIRST_USE_SOURCE/,
      );
    for (const bad of ["0".repeat(64), "", prior.toUpperCase()])
      assert.throws(
        () => assertCustomerFirstUseSourceTransition(file, bad, root, bytes),
        /CUSTOMER_FIRST_USE_HISTORICAL_HASH_CHANGED/,
      );
    for (const [other] of rows)
      if (other !== file)
        assert.throws(
          () =>
            assertCustomerFirstUseSourceTransition(
              file,
              prior,
              root,
              fs.readFileSync(path.join(root, other)),
            ),
          /UNREVIEWED_CUSTOMER_FIRST_USE_SOURCE/,
        );
  });

test("first-use successor is restricted to the two reviewed UI files", () => {
  assert.deepEqual(
    rows.map(([file]) => file).sort(),
    [
      "apps/os/app/os/[[...segments]]/page.tsx",
      "apps/os/components/TeamWorkspace.tsx",
    ].sort(),
  );
  for (const file of [
    "apps/os/lib/auth.ts",
    "scripts/session-attestation-payload.mjs",
    "__proto__",
    "../apps/os/components/TeamWorkspace.tsx",
    "apps/os/components/TeamWorkspace.tsx/",
  ])
    assert.equal(
      assertCustomerFirstUseSourceTransition(
        file,
        "0".repeat(64),
        root,
        Buffer.from("untrusted"),
      ),
      false,
    );
});

test("mapping and original owner manifest mutation cannot authorize alternate successors", () => {
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), "kxra-first-use-source-"),
  );
  try {
    fs.mkdirSync(path.join(temporary, "packages/release"), { recursive: true });
    const original = fs.readFileSync(path.join(root, recordPath));
    const predecessor = fs.readFileSync(path.join(root, predecessorPath));
    fs.writeFileSync(path.join(temporary, predecessorPath), predecessor);
    const [file, prior] = rows[0];
    const bytes = fs.readFileSync(path.join(root, file));
    const mutations = [
      (v: any) => {
        v.authorization = true;
      },
      (v: any) => {
        v.fullReleaseEligible = true;
      },
      (v: any) => {
        v.defaultEnabled = true;
      },
      (v: any) => {
        v.customerPolicyChanged = true;
      },
      (v: any) => {
        v.numberedMigrationsChanged = true;
      },
      (v: any) => {
        v.baseCommit = "0".repeat(40);
      },
      (v: any) => {
        v.transitions[0].sha256 = "0".repeat(64);
      },
      (v: any) => {
        v.transitions[0].priorSha256 = "0".repeat(64);
      },
      (v: any) => {
        v.transitions[0].path = "apps/os/lib/auth.ts";
      },
      (v: any) => {
        v.transitions.push(v.transitions[0]);
      },
      (v: any) => {
        v.transitions.pop();
      },
      (v: any) => {
        v.transitions.reverse();
      },
      (v: any) => {
        v.extra = "unreviewed";
      },
    ];
    for (const mutate of mutations) {
      const record = JSON.parse(original.toString());
      mutate(record);
      fs.writeFileSync(
        path.join(temporary, recordPath),
        JSON.stringify(record),
      );
      assert.throws(
        () =>
          assertCustomerFirstUseSourceTransition(file, prior, temporary, bytes),
        /CUSTOMER_FIRST_USE_MAPPING_CHANGED/,
      );
    }
    fs.writeFileSync(path.join(temporary, recordPath), original);
    assert.equal(
      assertCustomerFirstUseSourceTransition(file, prior, temporary, bytes),
      true,
    );
    fs.writeFileSync(
      path.join(temporary, predecessorPath),
      Buffer.concat([predecessor, Buffer.from("\n")]),
    );
    assert.throws(
      () =>
        assertCustomerFirstUseSourceTransition(file, prior, temporary, bytes),
      /CUSTOMER_FIRST_USE_PREDECESSOR_CHANGED/,
    );
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test("the composed original owner verifier cannot bypass successor pins with a changed predecessor manifest", () => {
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), "kxra-first-use-composed-"),
  );
  try {
    fs.mkdirSync(path.join(temporary, "packages/release"), { recursive: true });
    fs.copyFileSync(
      path.join(root, recordPath),
      path.join(temporary, recordPath),
    );
    const original = fs.readFileSync(path.join(root, predecessorPath));
    for (const [file] of rows) {
      const bytes = fs.readFileSync(path.join(root, file));
      const historical =
        ownerOverviewTransitionAnchors[
          file as keyof typeof ownerOverviewTransitionAnchors
        ];
      const altered = Buffer.concat([
        bytes,
        Buffer.from("\n// unreviewed UI\n"),
      ]);
      for (const supplied of [bytes, altered]) {
        const record = JSON.parse(original.toString());
        record.transitions.find(
          (item: { path: string }) => item.path === file,
        ).sha256 = crypto.createHash("sha256").update(supplied).digest("hex");
        fs.writeFileSync(
          path.join(temporary, predecessorPath),
          JSON.stringify(record),
        );
        assert.throws(
          () =>
            assertOwnerOverviewSourceTransition(
              file,
              historical,
              temporary,
              supplied,
            ),
          /OWNER_UI_PREDECESSOR_MANIFEST_CHANGED/,
        );
      }
      fs.writeFileSync(path.join(temporary, predecessorPath), original);
      assert.equal(
        assertOwnerOverviewSourceTransition(file, historical, temporary, bytes),
        true,
      );
      assert.throws(
        () =>
          assertOwnerOverviewSourceTransition(
            file,
            historical,
            temporary,
            altered,
          ),
        /UNREVIEWED_CUSTOMER_FIRST_USE_SOURCE/,
      );
    }
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
