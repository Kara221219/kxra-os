# Dependency and static-analysis policy

KXRA installs only the committed npm lockfile with `npm ci`. The local dependency gate checks every external lockfile package for an exact version, npm registry HTTPS source, integrity hash and reviewed SPDX license expression. Packages with install scripts fail unless their exact path and version are reviewed in the gate.

The current reviewed license expressions are 0BSD, MIT, ISC, BSD-3-Clause, Apache-2.0, CC-BY-4.0 and the explicit LGPL combinations introduced by Next.js optional Sharp/libvips packages. This is an engineering allowlist, not a legal opinion. A new expression requires source and distribution review before updating the gate.

The only reviewed install-script packages are exact locked versions of esbuild and optional fsevents. Any version change must be reviewed before changing the allowlist.

CI runs both production-only and complete `npm audit` checks. A separate SHA-pinned CodeQL v4 workflow analyzes JavaScript/TypeScript with GitHub's `security-extended` query suite on branch pushes, pull requests and a weekly schedule. CodeQL findings and workflow failures are release blockers until reviewed and resolved or explicitly excluded with evidence.

Generated build output, credentials, private Genesis source and runtime artifacts remain outside the repository and are not dependency inputs.
