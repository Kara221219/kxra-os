import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
test("production bridge guard rejects every authenticated-service entry even with fixture-shaped flags and no configured database", () => {
  const script = `import assert from 'node:assert/strict';
 import {bridgeCatalog,bridgeView,createBridgeRequest,bridgeMutation} from './apps/os/lib/team-bridge.ts';
 for(const work of [()=>bridgeCatalog(null,'invalid'),()=>bridgeView(null,'invalid','invalid'),()=>createBridgeRequest(null,'invalid',{}),()=>bridgeMutation(null,'invalid','invalid','dispatch',{})]){
  await assert.rejects(work,error=>error.status===503&&/not activated for hosted use/.test(error.message));
 }
 console.log('PRODUCTION BRIDGE GUARD PASS');`;
  const output = execFileSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", script],
    {
      cwd: path.resolve(import.meta.dirname, ".."),
      encoding: "utf8",
      timeout: 30000,
      env: {
        PATH: process.env.PATH,
        HOME: os.homedir(),
        NODE_ENV: "production",
        KXRA_AUTH_MODE: "fixture",
        KXRA_ORIGIN: "http://127.0.0.1:3291",
        KXRA_RUNTIME: "/tmp/kxra-no-production-store",
        KXRA_LOCAL_SECRET: crypto.randomBytes(48).toString("hex"),
      },
    },
  );
  assert.match(output, /PRODUCTION BRIDGE GUARD PASS/);
});
