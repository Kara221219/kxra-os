# Local operations

Run `npm ci`, then `npm run dev` from the workspace. Open `http://127.0.0.1:3210` (do not change to localhost while using fixture mode). Startup creates an isolated PostgreSQL database and imports the five projects and classified source registers only on first initialization; subsequent startup applies new migrations and preserves edits. Files under `.runtime` are private ignored local state.

Database binaries default to Homebrew PostgreSQL 14. Set `KXRA_PG_BIN` to the directory containing initdb/pg_ctl on other machines. Local PostgreSQL is on port 55439 via this workspace's Unix socket only, with TCP disabled. Filesystem access to the cluster is equivalent to local administration; it must contain no real credentials or production data.

Use `npm run typecheck`, `npm test`, `npm run test:e2e`, and `npm run build`. HTTP/browser suites require the running preview. Install the Playwright Chromium headless shell with `npx playwright install chromium --only-shell`. Test failures are not silently skipped. HTTP/browser tests create clearly labelled synthetic records; PostgreSQL adversarial tests roll back.

The app role must never own tables or have bypass privileges. Do not use a Supabase admin/service connection as DATABASE_URL. Hosted variables are examples only in `.env.example`; do not copy hosted placeholders into the fixture run. Fixture mode refuses mixed hosted configuration.

Stop the preview with Ctrl-C. `npm run db:stop` stops only the cluster owned by this workspace. There is no automatic destructive reset. Back up `.runtime` only while stopped or using PostgreSQL's supported backup tools. Production backup/recovery has not been validated.

If a preview becomes unresponsive after a tool/session restart, inspect the exact listener before terminating it; do not kill unrelated Node or database processes. Preview output can be redirected to `.runtime/preview.log` for diagnosis.
