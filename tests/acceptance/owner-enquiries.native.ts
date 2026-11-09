import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  enquiryFixture,
  enquiryOrg,
  enquiryOwner,
} from "../support/owner-enquiry-fixture";
import {
  enquiryFilters,
  enquiryQueryValues,
  ownerEnquiriesSql,
} from "../../packages/workspace/owner-enquiry-contract";
test("owner inbox actual RLS, live pagination and exact route authority", async () => {
  const f = await enquiryFixture();
  const base = process.env.KXRA_ORIGIN!;
  assert.equal(new URL(base).hostname, "127.0.0.1");
  async function login(fixture: string) {
    const response = await fetch(base + "/api/auth", {
      method: "POST",
      headers: { origin: base },
      body: new URLSearchParams({ fixture }),
      redirect: "manual",
    });
    assert.equal(response.status, 303);
    return response.headers.get("set-cookie")!.split(";")[0];
  }
  async function html(route: string, cookie?: string) {
    const response = await fetch(base + route, {
      headers: cookie ? { cookie } : {},
      redirect: "manual",
    });
    return {
      status: response.status,
      text: await response.text(),
      headers: response.headers,
    };
  }
  async function read(account: string, page: string, org = enquiryOrg) {
    await f.db.query("begin read only");
    try {
      await f.db.query("set local role authenticated");
      await f.db.query(
        "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.kxra.org_id',$3,true)",
        [
          account,
          JSON.stringify({
            sub: account,
            aal: "aal2",
            auth_time: Math.floor(Date.now() / 1000),
          }),
          enquiryOrg,
        ],
      );
      return (
        await f.db.query(
          ownerEnquiriesSql,
          enquiryQueryValues(
            org,
            enquiryFilters({ status: "SPAM", type: "CONTACT", page }),
          ),
        )
      ).rows[0];
    } finally {
      await f.db.query("rollback");
    }
  }
  try {
    const cookie = await login("owner");
    const expected = (
      await f.db.query(
        "select id from kxra.public_enquiry_submissions where org_id=$1 and status='SPAM' and form_kind='CONTACT' order by received_at desc,id desc",
        [enquiryOrg],
      )
    ).rows.map((r) => r.id);
    const collected: string[] = [];
    for (let page = 1; page <= Math.ceil(expected.length / 25); page++) {
      const result = await read(enquiryOwner, String(page));
      assert.equal(Number(result.total_count), expected.length);
      collected.push(...result.rows.map((r: { id: string }) => r.id));
    }
    assert.deepEqual(collected, expected);
    assert.equal(new Set(collected).size, collected.length);
    const empty = await read(enquiryOwner, "1000000");
    assert.equal(Number(empty.total_count), expected.length);
    assert.deepEqual(empty.rows, []);
    for (const identity of [
      "20000000-0000-4000-8000-000000000002",
      "20000000-0000-4000-8000-000000000003",
      "20000000-0000-4000-8000-000000000004",
    ]) {
      const result = await read(identity, "1");
      assert.equal(result.total_count, "0");
      assert.deepEqual(result.rows, []);
    }
    assert.equal(
      (await read(enquiryOwner, "1", f.foreignOrg)).total_count,
      "0",
    );
    const forged = await html(
      `/os/enquiries?status=SPAM&type=CONTACT&org_id=${f.foreignOrg}&user_id=20000000-0000-4000-8000-000000000002&role=owner`,
      cookie,
    );
    assert.equal(forged.status, 200);
    assert.ok(!forged.text.includes(f.foreignId));
    assert.ok(forged.text.includes(f.ids[0]));
    const before = (
      await f.db.query(
        "select (select count(*) from kxra.audit_events) audit,(select jsonb_agg(row_to_json(e) order by id) from kxra.public_enquiry_submissions e) enquiries",
      )
    ).rows[0];
    for (const route of [
      "/os/enquiries?status=SPAM&type=CONTACT&page=3",
      `/os/enquiries?status=SPAM&type=CONTACT&page=3&enquiry=${f.ids[60]}`,
      "/os/enquiries?page=1000000",
    ]) {
      const result = await html(route, cookie);
      assert.equal(result.status, 200);
      assert.match(result.headers.get("cache-control") || "", /no-store/);
      assert.ok(result.text.includes("data-enquiry-document"));
    }
    const after = (
      await f.db.query(
        "select (select count(*) from kxra.audit_events) audit,(select jsonb_agg(row_to_json(e) order by id) from kxra.public_enquiry_submissions e) enquiries",
      )
    ).rows[0];
    assert.deepEqual(after, before);
    const detail = await html(`/os/enquiries?enquiry=${f.ids[60]}`, cookie);
    assert.ok(detail.text.includes("Synthetic private body " + f.ids[60]));
    for (const route of [
      "/os/enquiries/extra",
      "/os/enquiries/extra/more",
      `/os/enquiries/extra?enquiry=${f.ids[0]}`,
      `/os/enquiries?enquiry=${f.foreignId}`,
      `/os/enquiries?enquiry=${crypto.randomUUID()}`,
      "/os/enquiries?enquiry=bad",
    ]) {
      const result = await html(route, cookie);
      assert.equal(result.status, 404, route);
      assert.ok(!result.text.includes(f.marker));
      assert.ok(!result.text.includes("Synthetic private body"));
    }
    for (const route of [
      "/os/enquiries?status=bad",
      "/os/enquiries?page=2&page=3",
      "/os/enquiries?type=CONTACT&type=ENQUIRY",
    ]) {
      const result = await html(route, cookie);
      assert.ok(result.text.includes("Check the inbox filters"));
      assert.ok(!result.text.includes(f.marker));
    }
    assert.equal((await html("/os/enquiries")).status, 307);
    for (const fixture of ["partner", "viewer", "revoked"]) {
      const c = await login(fixture);
      const result = await html("/os/enquiries", c);
      assert.ok(!result.text.includes(f.marker));
      assert.ok(!result.text.includes("data-enquiry-document"));
    }
  } finally {
    await f.close();
  }
});
