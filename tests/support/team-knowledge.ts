import assert from "node:assert/strict";
import crypto from "node:crypto";
import { localModeConfiguration } from "../../packages/authz/local-guard";
import { processFileJobs } from "../../packages/storage/worker";
import { testOrigin as base } from "./runtime";
export const knowledgeProject = "30000000-0000-4000-8000-000000000002";
export async function knowledgeLogin(fixture = "partner") {
  assert.ok(
    localModeConfiguration(process.env),
    "Knowledge fixtures require the guarded local fixture runtime",
  );
  const response = await fetch(base + "/api/auth", {
    method: "POST",
    headers: { origin: base },
    body: new URLSearchParams({ fixture }),
    redirect: "manual",
  });
  assert.equal(response.status, 303);
  return response.headers
    .getSetCookie()
    .map((value) => value.split(";", 1)[0])
    .join("; ");
}
export function knowledgeRequest(
  path: string,
  cookie?: string,
  body?: unknown,
) {
  return fetch(base + "/api/team-space" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      origin: base,
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
export async function knowledgeOk(
  path: string,
  cookie: string,
  body?: unknown,
) {
  const response = await knowledgeRequest(path, cookie, body);
  assert.ok(
    response.ok,
    `${path}: ${response.status} ${await response.clone().text()}`,
  );
  return response.json();
}
export async function knowledgeUpload(
  cookie: string,
  filename: string,
  content: string,
  project = knowledgeProject,
  visibility = "project_shared",
  process = true,
) {
  const form = new FormData();
  form.set("project_id", project);
  form.set("visibility", visibility);
  form.set("file", new File([content], filename, { type: "text/plain" }));
  const response = await fetch(base + "/api/files", {
    method: "POST",
    headers: { cookie, origin: base },
    body: form,
  });
  assert.equal(response.status, 201, await response.clone().text());
  const file = await response.json();
  if (process)
    await processFileJobs({
      workerReference: "room-knowledge-fixture-" + crypto.randomUUID(),
    });
  return file as { id: string; record_id: string };
}
export async function knowledgeFixture(attach = true, fixture = "partner") {
  const cookie = await knowledgeLogin(fixture);
  const suffix = crypto.randomUUID(),
    filename = `Room evidence ${suffix}.txt`,
    marker = `roomknowledgemarker${suffix.replaceAll("-", "")}`;
  const room = await knowledgeOk("", cookie, {
    project_id: knowledgeProject,
    name: "Knowledge room " + suffix,
    guidelines: "Use explicit evidence.",
    access: "PRIVATE",
  });
  const file = await knowledgeUpload(
    cookie,
    filename,
    `${marker} Synthetic dispatch checklist: review evidence, identify the owner, and obtain human approval.`,
  );
  const knowledge = await knowledgeOk(`/${room.id}/knowledge`, cookie);
  const version = knowledge.available_files.find(
    (row: { file_id: string }) => row.file_id === file.id,
  );
  assert.ok(version);
  if (attach)
    await knowledgeOk(`/${room.id}/files`, cookie, {
      file_version_id: version.file_version_id,
      active: true,
    });
  const connection = await knowledgeOk("/connections", cookie, {
    name: "Knowledge fixture " + suffix,
    provider: "FIXTURE",
    model: "fixture-draft",
    key: "local-fixture",
  });
  const agent = await knowledgeOk(`/${room.id}/agents`, cookie, {
    connection_id: connection.id,
    name: "Knowledge analyst " + suffix,
    instructions: "Draft a scoped checklist.",
  });
  const message = await knowledgeOk(`/${room.id}/messages`, cookie, {
    request_id: crypto.randomUUID(),
    body: "Prepare a draft from the selected evidence.",
  });
  const chunks = attach
    ? await knowledgeOk(`/${room.id}/search?q=${marker}`, cookie)
    : [];
  return {
    cookie,
    room: room.id,
    file,
    version: version.file_version_id,
    filename,
    marker,
    agent: agent.id,
    agentName: "Knowledge analyst " + suffix,
    message: message.id,
    chunks,
  };
}
