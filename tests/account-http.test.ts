import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";

const base = "http://127.0.0.1:3210";
const projects = {
  p1: "30000000-0000-4000-8000-000000000001",
  p2: "30000000-0000-4000-8000-000000000002",
  p3: "30000000-0000-4000-8000-000000000003",
};
const agreements = [
  "80000000-0000-4000-8000-000000000001",
  "80000000-0000-4000-8000-000000000002",
];

type CookieJar = Map<string, string>;
type FakeMessage = {
  operationKey: string;
  recipient: string;
  template: string;
  text: string;
  state: string;
};

function rememberCookies(jar: CookieJar, response: Response) {
  const headers = response.headers as Headers & {
    getSetCookie?: () => string[];
  };
  const values =
    headers.getSetCookie?.() ||
    (response.headers.get("set-cookie")
      ? [response.headers.get("set-cookie") as string]
      : []);
  for (const header of values) {
    const pair = header.split(";", 1)[0];
    const separator = pair.indexOf("=");
    if (separator < 1) continue;
    const name = pair.slice(0, separator);
    const value = pair.slice(separator + 1);
    if (!value || /max-age=0/i.test(header)) jar.delete(name);
    else jar.set(name, value);
  }
}

async function browserFetch(
  jar: CookieJar,
  pathOrUrl: string,
  init: RequestInit = {},
) {
  const headers = new Headers(init.headers);
  if (jar.size)
    headers.set(
      "cookie",
      [...jar].map(([name, value]) => `${name}=${value}`).join("; "),
    );
  if ((init.method || "GET") !== "GET" && !headers.has("origin"))
    headers.set("origin", base);
  const response = await fetch(
    pathOrUrl.startsWith("http") ? pathOrUrl : base + pathOrUrl,
    {
      ...init,
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
    },
  );
  rememberCookies(jar, response);
  return response;
}

async function postJson(jar: CookieJar, path: string, data: unknown) {
  return browserFetch(jar, path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
  });
}

async function patchJson(jar: CookieJar, path: string, data: unknown) {
  return browserFetch(jar, path, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
  });
}

async function fixtureLogin(fixture: string) {
  const jar: CookieJar = new Map();
  const response = await browserFetch(jar, "/api/auth", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ fixture }),
  });
  assert.equal(response.status, 303);
  assert.equal(new URL(response.headers.get("location")!).pathname, "/os");
  return jar;
}

async function providerLogin(
  email: string,
  password: string,
  jar: CookieJar = new Map(),
) {
  const response = await browserFetch(jar, "/api/auth", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ email, password }),
  });
  assert.equal(response.status, 303);
  return { jar, location: new URL(response.headers.get("location")!) };
}

function fakeMessages() {
  return (
    JSON.parse(fs.readFileSync(".runtime/fake-email.json", "utf8")) as {
      messages: FakeMessage[];
    }
  ).messages;
}

function fakeMessage(input: {
  recipient: string;
  template: string;
  operationKey?: string;
}) {
  const message = [...fakeMessages()]
    .reverse()
    .find(
      (candidate) =>
        candidate.recipient === input.recipient &&
        candidate.template === input.template &&
        (!input.operationKey || candidate.operationKey === input.operationKey),
    );
  assert.ok(message);
  return message;
}

function actionUrl(message: FakeMessage) {
  const action = message.text.match(/Continue securely: (https?:\/\/\S+)/)?.[1];
  assert.ok(action);
  return action;
}

function invitationToken(url: string) {
  const parsed = new URL(url);
  const token = new URLSearchParams(parsed.hash.slice(1)).get("token");
  assert.ok(token);
  return token;
}

function exchangeInvitation(jar: CookieJar, url: string) {
  return postJson(jar, "/api/join/exchange", {
    token: invitationToken(url),
  });
}

async function ownerApi(
  owner: CookieJar,
  path: string,
  data?: unknown,
  method = "POST",
) {
  return data === undefined
    ? browserFetch(owner, `/api/${path}`)
    : browserFetch(owner, `/api/${path}`, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      });
}

async function approveAndExecute(owner: CookieJar, request: unknown) {
  const created = await ownerApi(owner, "approvals", request);
  assert.equal(created.status, 201, await created.clone().text());
  const approval = await created.json();
  const decided = await ownerApi(owner, `approvals/${approval.id}`, {
    hash: approval.payload_hash,
    approve: true,
  });
  assert.equal(decided.status, 200, await decided.clone().text());
  const executed = await ownerApi(
    owner,
    `approvals/${approval.id}/execute`,
    {},
  );
  assert.equal(executed.status, 200, await executed.clone().text());
  return approval;
}

async function createInvitation(owner: CookieJar, email: string) {
  const response = await ownerApi(owner, "invitations", {
    email,
    grants: [
      { project_id: projects.p2, role: "contributor" },
      { project_id: projects.p3, role: "viewer" },
    ],
    note: "Synthetic two-project account acceptance fixture",
    expires_hours: 24,
  });
  assert.equal(response.status, 201, await response.clone().text());
  const invitation = await response.json();
  assert.equal("token" in invitation, false);
  assert.equal(invitation.state, "SENT");
  assert.equal(invitation.project_count, 2);
  return invitation as { id: string; state: string; project_count: number };
}

async function onboardPartner() {
  const owner = await fixtureLogin("owner");
  const marker = crypto.randomUUID().slice(0, 8);
  const email = `account-${marker}@fixture.invalid`;
  const password = "SyntheticStartPass123";
  const invitation = await createInvitation(owner, email);
  const invitationMessage = fakeMessage({
    recipient: email,
    template: "PARTNER_INVITATION",
    operationKey: `invitation:${invitation.id}:v1`,
  });
  assert.equal(invitationMessage.state, "SENT");
  assert.match(invitationMessage.text, /PROJECT-002/);
  assert.match(invitationMessage.text, /PROJECT-003/);
  assert.equal(invitationMessage.text.includes(password), false);
  const invitationUrl = actionUrl(invitationMessage);
  const rawInvitationToken = invitationToken(invitationUrl);

  const wrong = await fixtureLogin("partner");
  assert.equal((await exchangeInvitation(wrong, invitationUrl)).status, 200);
  assert.equal(
    (
      await postJson(wrong, "/api/join/register", {
        password,
        confirmation: password,
      })
    ).status,
    409,
  );

  const jar: CookieJar = new Map();
  const exchanged = await exchangeInvitation(jar, invitationUrl);
  assert.equal(exchanged.status, 200);
  assert.equal((await exchanged.json()).next, "/join/account");
  assert.ok(jar.has("kxra_join_intent"));
  for (let reload = 0; reload < 2; reload++)
    assert.equal((await browserFetch(jar, "/join/account")).status, 200);

  assert.equal(
    (
      await postJson(jar, "/api/join/register", {
        email: "forged@fixture.invalid",
        password,
        confirmation: password,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await postJson(jar, "/api/join/register", {
        password: "short",
        confirmation: "short",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await postJson(jar, "/api/join/register", {
        password,
        confirmation: "DifferentSyntheticPass456",
      })
    ).status,
    400,
  );
  const registered = await postJson(jar, "/api/join/register", {
    password,
    confirmation: password,
  });
  assert.equal(registered.status, 201, await registered.clone().text());
  assert.equal(
    JSON.stringify(await registered.json()).includes(rawInvitationToken),
    false,
  );

  const verificationMessage = fakeMessage({
    recipient: email,
    template: "EMAIL_VERIFICATION",
  });
  const verificationUrl = actionUrl(verificationMessage);
  jar.delete("kxra_local_session");
  const unverifiedReturn = await providerLogin(email, password, jar);
  assert.equal(unverifiedReturn.location.pathname, "/join/account");
  const verified = await browserFetch(jar, verificationUrl);
  assert.equal(verified.status, 303);
  assert.equal(
    new URL(verified.headers.get("location")!).pathname,
    "/join/finish",
  );
  jar.delete("kxra_local_session");
  const verifiedReturn = await providerLogin(email, password, jar);
  assert.equal(verifiedReturn.location.pathname, "/join/finish");
  const finished = await browserFetch(jar, "/join/finish");
  assert.equal(finished.status, 303);
  assert.equal(
    new URL(finished.headers.get("location")!).pathname,
    "/onboarding",
  );
  assert.equal(jar.has("kxra_join_intent"), false);

  assert.equal((await browserFetch(jar, "/api/projects")).status, 428);
  const startPage = await (await browserFetch(jar, "/onboarding")).text();
  assert.ok(
    startPage.includes('aria-current="step"><a href="/onboarding?step=1"'),
  );
  assert.match(startPage, /US Vehicle Seat Covers/);
  assert.match(startPage, /AI Property Fly-Through/);
  assert.doesNotMatch(startPage, /AI Trading Research &amp; Monitoring/);
  assert.match(startPage, /UNAPPROVED|unapproved/i);

  assert.equal(
    (
      await postJson(jar, "/api/onboarding/step", {
        step: 2,
        data: {
          first_name: "Out",
          last_name: "Of order",
          job_title: "",
          company: "",
          phone: "",
        },
      })
    ).status,
    409,
  );
  const steps: unknown[] = [
    { acknowledged: true },
    {
      first_name: `Partner ${marker}`,
      last_name: "Fixture",
      job_title: "Research partner",
      company: "Synthetic company",
      phone: "+44 7700 900123",
    },
    { security_acknowledged: true },
    { access_acknowledged: true },
    { working_acknowledged: true },
    { whatsapp_choice: "SKIP" },
    {
      timezone: "Europe/London",
      email_notifications: true,
      whatsapp_notifications: false,
      display_density: "comfortable",
    },
    { agreement_ids: agreements, placeholder_acknowledged: true },
    { complete: true },
  ];
  for (let index = 0; index < 4; index++) {
    if (index === 1)
      assert.equal(
        (
          await postJson(jar, "/api/onboarding/step", {
            step: 2,
            data: { ...(steps[1] as object), first_name: "" },
          })
        ).status,
        400,
      );
    const response = await postJson(jar, "/api/onboarding/step", {
      step: index + 1,
      data: steps[index],
    });
    assert.equal(response.status, 200, await response.clone().text());
  }
  const accessPage = await (
    await browserFetch(jar, "/onboarding?step=4")
  ).text();
  assert.match(accessPage, /contributor/);
  assert.match(accessPage, /viewer/);
  assert.doesNotMatch(accessPage, /PROJECT-001/);

  const logout = await browserFetch(jar, "/api/auth", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ logout: "1" }),
  });
  assert.equal(logout.status, 303);
  const resumed = await providerLogin(email, password, jar);
  assert.equal(resumed.location.pathname, "/onboarding");
  assert.ok(
    (await (await browserFetch(jar, "/onboarding")).text()).includes(
      'aria-current="step"><a href="/onboarding?step=5"',
    ),
  );

  for (let index = 4; index < 7; index++) {
    const response = await postJson(jar, "/api/onboarding/step", {
      step: index + 1,
      data: steps[index],
    });
    assert.equal(response.status, 200, await response.clone().text());
  }
  assert.equal(
    (
      await postJson(jar, "/api/onboarding/step", {
        step: 8,
        data: {
          agreement_ids: [agreements[0]],
          placeholder_acknowledged: true,
        },
      })
    ).status,
    409,
  );
  for (let index = 7; index < 9; index++) {
    const response = await postJson(jar, "/api/onboarding/step", {
      step: index + 1,
      data: steps[index],
    });
    assert.equal(response.status, 200, await response.clone().text());
  }

  const visibleProjects = await browserFetch(jar, "/api/projects");
  assert.equal(visibleProjects.status, 200);
  assert.deepEqual(
    (await visibleProjects.json()).map((project: { id: string }) => project.id),
    [projects.p2, projects.p3],
  );
  assert.equal(
    (await browserFetch(jar, `/api/projects/${projects.p1}`)).status,
    404,
  );
  const accountResponse = await browserFetch(jar, "/api/account");
  assert.equal(accountResponse.status, 200);
  const account = await accountResponse.json();
  assert.equal(account.profile.account_state, "ACTIVE");
  assert.ok(account.profile.onboarding_completed_at);
  assert.deepEqual(
    account.assignments.map(
      (assignment: { project_id: string; role: string }) => [
        assignment.project_id,
        assignment.role,
      ],
    ),
    [
      [projects.p2, "contributor"],
      [projects.p3, "viewer"],
    ],
  );
  assert.match(
    await (await browserFetch(jar, "/os?tour=1")).text(),
    /Your project workspace/,
  );

  const replay = await browserFetch(new Map(), invitationUrl);
  assert.equal(replay.status, 200);
  assert.equal(
    (await exchangeInvitation(new Map(), invitationUrl)).status,
    409,
  );
  assert.equal(
    fs
      .readFileSync(".runtime/fake-auth.json", "utf8")
      .includes(rawInvitationToken),
    false,
  );
  const identityState = JSON.parse(
    fs.readFileSync(".runtime/fake-auth.json", "utf8"),
  ) as { users: Record<string, { id: string }> };
  return {
    owner,
    jar,
    email,
    password,
    userId: identityState.users[email].id,
  };
}

test("AT-19/20 invitation return path and mandatory nine-step onboarding", async () => {
  await onboardPartner();
});

test("AT-19 resend, replacement and revocation invalidate old links", async () => {
  const owner = await fixtureLogin("owner");
  const email = `delivery-${crypto.randomUUID().slice(0, 8)}@fixture.invalid`;
  const first = await createInvitation(owner, email);
  const oldUrl = actionUrl(
    fakeMessage({
      recipient: email,
      template: "PARTNER_INVITATION",
      operationKey: `invitation:${first.id}:v1`,
    }),
  );
  const resent = await ownerApi(owner, `invitations/${first.id}/resend`, {});
  assert.equal(resent.status, 200, await resent.clone().text());
  const resentBody = await resent.json();
  assert.equal(resentBody.version, 2);
  const newUrl = actionUrl(
    fakeMessage({
      recipient: email,
      template: "INVITATION_REMINDER",
      operationKey: `invitation:${first.id}:delivery:2`,
    }),
  );
  assert.notEqual(newUrl, oldUrl);
  assert.equal((await exchangeInvitation(new Map(), oldUrl)).status, 409);
  assert.equal((await exchangeInvitation(new Map(), newUrl)).status, 200);
  const revoked = await ownerApi(owner, `invitations/${first.id}/revoke`, {});
  assert.equal(revoked.status, 200, await revoked.clone().text());
  assert.equal((await exchangeInvitation(new Map(), newUrl)).status, 409);

  const replacedEmail = `replacement-${crypto.randomUUID().slice(0, 8)}@fixture.invalid`;
  const replaced = await createInvitation(owner, replacedEmail);
  const replacedUrl = actionUrl(
    fakeMessage({
      recipient: replacedEmail,
      template: "PARTNER_INVITATION",
      operationKey: `invitation:${replaced.id}:v1`,
    }),
  );
  const replacement = await createInvitation(owner, replacedEmail);
  assert.notEqual(replacement.id, replaced.id);
  assert.equal((await exchangeInvitation(new Map(), replacedUrl)).status, 409);
  const listed = await (await ownerApi(owner, "invitations")).json();
  assert.equal(
    listed.find((entry: { id: string }) => entry.id === replaced.id).state,
    "REVOKED",
  );
});

test("AT-21 partner controls and owner account authority take immediate effect", async () => {
  const journey = await onboardPartner();
  const updatedProfile = {
    first_name: "Updated",
    last_name: "Partner",
    job_title: "Validation lead",
    company: "Synthetic account fixture",
    phone: "+44 7700 900456",
  };
  assert.equal(
    (await patchJson(journey.jar, "/api/account/profile", updatedProfile))
      .status,
    200,
  );
  assert.equal(
    (
      await patchJson(journey.jar, "/api/account/preferences", {
        timezone: "America/New_York",
        email_notifications: false,
        whatsapp_notifications: false,
        display_density: "compact",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await patchJson(journey.jar, "/api/account/profile", {
        ...updatedProfile,
        role: "owner",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await patchJson(journey.jar, "/api/account/preferences", {
        timezone: "Europe/London",
        email_notifications: true,
        whatsapp_notifications: true,
        display_density: "comfortable",
      })
    ).status,
    409,
  );
  const account = await (
    await browserFetch(journey.jar, "/api/account")
  ).json();
  assert.equal(account.profile.first_name, "Updated");
  assert.equal(account.preferences.timezone, "America/New_York");
  assert.equal(account.identity.role, "partner");

  assert.equal(
    (
      await postJson(journey.jar, "/api/account/password", {
        current_password: "WrongSyntheticPass123",
        new_password: "ChangedSyntheticPass456",
        confirmation: "ChangedSyntheticPass456",
      })
    ).status,
    400,
  );
  let password = "ChangedSyntheticPass456";
  assert.equal(
    (
      await postJson(journey.jar, "/api/account/password", {
        current_password: journey.password,
        new_password: password,
        confirmation: password,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await providerLogin(journey.email, journey.password)
    ).location.searchParams.get("error"),
    "1",
  );
  assert.equal(
    (await providerLogin(journey.email, password)).location.pathname,
    "/os",
  );

  assert.equal(
    (await postJson(journey.jar, "/api/account/mfa", { action: "begin" }))
      .status,
    200,
  );
  assert.equal(
    (
      await postJson(journey.jar, "/api/account/mfa", {
        action: "complete",
        proof: "wrong",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await postJson(journey.jar, "/api/account/mfa", {
        action: "complete",
        proof: "KXRA-LOCAL-MFA",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await postJson(journey.jar, "/api/account/mfa", {
        action: "challenge",
        proof: "KXRA-LOCAL-MFA",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await postJson(journey.jar, "/api/account/mfa", {
        action: "begin_recovery",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await postJson(journey.jar, "/api/account/mfa", {
        action: "recover",
        proof: "wrong",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await postJson(journey.jar, "/api/account/mfa", {
        action: "recover",
        proof: "KXRA-LOCAL-RECOVERY",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await postJson(journey.jar, "/api/account/mfa", {
        action: "remove",
        proof: "KXRA-LOCAL-MFA",
      })
    ).status,
    200,
  );

  const unknownReset = await postJson(new Map(), "/api/password-reset", {
    action: "request",
    email: `missing-${crypto.randomUUID().slice(0, 8)}@fixture.invalid`,
  });
  const knownReset = await postJson(new Map(), "/api/password-reset", {
    action: "request",
    email: journey.email,
  });
  assert.equal(unknownReset.status, 202);
  assert.equal(knownReset.status, 202);
  assert.deepEqual(await knownReset.json(), await unknownReset.json());
  const resetUrl = actionUrl(
    fakeMessage({ recipient: journey.email, template: "PASSWORD_RESET" }),
  );
  const resetToken = new URL(resetUrl).searchParams.get("token");
  assert.ok(resetToken);
  assert.equal(
    (
      await postJson(journey.jar, "/api/password-reset", {
        action: "confirm",
        token: resetToken,
        password: "ResetSyntheticPass789",
        confirmation: "MismatchSyntheticPass789",
      })
    ).status,
    400,
  );
  password = "ResetSyntheticPass789";
  assert.equal(
    (
      await postJson(journey.jar, "/api/password-reset", {
        action: "confirm",
        token: resetToken,
        password,
        confirmation: password,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await postJson(journey.jar, "/api/password-reset", {
        action: "confirm",
        token: resetToken,
        password,
        confirmation: password,
      })
    ).status,
    409,
  );

  await approveAndExecute(journey.owner, {
    action: "membership.change",
    project_id: projects.p3,
    payload: {
      user_id: journey.userId,
      role: "contributor",
      active: true,
      expires_at: null,
    },
  });
  let assignments = (
    await (await browserFetch(journey.jar, "/api/account")).json()
  ).assignments;
  assert.equal(
    assignments.find(
      (entry: { project_id: string }) => entry.project_id === projects.p3,
    ).role,
    "contributor",
  );
  await approveAndExecute(journey.owner, {
    action: "membership.change",
    project_id: projects.p2,
    payload: {
      user_id: journey.userId,
      role: "contributor",
      active: false,
      expires_at: null,
    },
  });
  assert.deepEqual(
    (await (await browserFetch(journey.jar, "/api/projects")).json()).map(
      (entry: { id: string }) => entry.id,
    ),
    [projects.p3],
  );

  assert.equal(
    (
      await ownerApi(journey.owner, `partners/${journey.userId}/sessions`, {
        reason: "AT-21 forced sign-out fixture",
      })
    ).status,
    200,
  );
  assert.equal((await browserFetch(journey.jar, "/api/account")).status, 401);
  journey.jar = (await providerLogin(journey.email, password)).jar;
  assert.equal(
    (await postJson(journey.jar, "/api/account/sessions", {})).status,
    200,
  );
  assert.equal((await browserFetch(journey.jar, "/api/account")).status, 401);
  journey.jar = (await providerLogin(journey.email, password)).jar;
  assert.equal(
    (
      await ownerApi(
        journey.owner,
        `partners/${journey.userId}/whatsapp/unpair`,
        {},
      )
    ).status,
    200,
  );

  await approveAndExecute(journey.owner, {
    action: "account.lifecycle",
    project_id: null,
    payload: {
      user_id: journey.userId,
      desired_state: "SUSPENDED",
      reason: "AT-21 suspension fixture",
    },
  });
  assert.equal((await browserFetch(journey.jar, "/api/projects")).status, 403);
  let partnerRows = await (await ownerApi(journey.owner, "partners")).json();
  assert.equal(
    partnerRows.find((entry: { id: string }) => entry.id === journey.userId)
      .account_state,
    "SUSPENDED",
  );
  await approveAndExecute(journey.owner, {
    action: "account.lifecycle",
    project_id: null,
    payload: {
      user_id: journey.userId,
      desired_state: "ACTIVE",
      reason: "AT-21 reactivation fixture",
    },
  });
  journey.jar = (await providerLogin(journey.email, password)).jar;
  assert.equal((await browserFetch(journey.jar, "/api/projects")).status, 200);

  await approveAndExecute(journey.owner, {
    action: "account.lifecycle",
    project_id: null,
    payload: {
      user_id: journey.userId,
      desired_state: "REVOKED",
      reason: "AT-21 terminal revocation fixture",
    },
  });
  assert.equal((await browserFetch(journey.jar, "/api/account")).status, 403);
  assert.equal(
    (await providerLogin(journey.email, password)).location.searchParams.get(
      "error",
    ),
    "1",
  );
  partnerRows = await (await ownerApi(journey.owner, "partners")).json();
  const revoked = partnerRows.find(
    (entry: { id: string }) => entry.id === journey.userId,
  );
  assert.equal(revoked.account_state, "REVOKED");
  assert.equal(revoked.active, false);
});
