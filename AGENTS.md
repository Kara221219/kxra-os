# KXRA OS engineering

Work only inside this workspace; preserve KXRA-GENESIS and the separate parent-repository apps. Use the local saved Genesis brief as baseline, with current user instructions taking precedence. No production deployment, real credentials, external sends or trading.

PostgreSQL is authoritative. Every request uses a verified server identity and a transaction under the authenticated RLS role. Never accept user IDs/roles from request bodies or LLM output. Partner visibility requires active membership and shared records. No financial arithmetic in models.

Use .env.example. Local fixtures require explicit fixture mode, loopback origin, no Vercel environment and a generated session secret; never enable them with hosted auth. Keep documents current in docs/operations/progress.md and handover.md. Test negative access at database and HTTP layers. Do not mark unconnected integrations or unimplemented workflows complete.
