# ADR 0006 — Database-defined project workspaces and specialist evidence boundaries

Date: 16 September 2026. Status: accepted for Final Milestone 3 local implementation.

## Context

The generic project page could display shared records and the operating loop, but it did not satisfy the frozen project contract. Every venture needs the same 18 common modules, a different specialist module set, explicit empty/failure/denied states and project-specific hard stops. Module visibility and specialist transitions must follow verified identity and PostgreSQL policy; route parameters and model output cannot select authority.

## Decision

Store project module definitions in PostgreSQL and read them only after authorizing the exact project under RLS. Use direct module routes and a typed source loader rather than a client-composed workspace. Keep existing authoritative stores for records, experiments, decisions, risks, tasks, files, finance, approvals and activity. Add typed sidecars only where the specialist contract needs stronger structure:

- versioned workspace entries with payload discriminators and exact record-version evidence;
- Project 002 vehicle compatibility and safety state;
- Project 003 property asset origin, rights and geometry state;
- Project 001 evidence-bound revisit recommendations;
- Project 005 buyer-problem opportunities that stop at local prototype authority.

Mutation APIs authorize the route project, resolve nested IDs through a fixed query map and require the row to belong to that project. Security-definer functions derive identity and organisation from database claims, enforce current project write access and append audit events. Direct table mutation remains unavailable to browser roles.

Treat unknown state honestly. Vehicle fitment/safety begins `UNKNOWN`; property rights/geometry begins unreviewed; Venture and Confidence scores remain null; gated modules remain visible but expose no mutation controls. A Project 001 recommendation or gate packet needs five distinct current evidence records. Project 004 records and reports remain paper-only. Project 005 has no creation or publication state, route, job or executor.

## Consequences

All five project workspaces are inspectable through stable direct URLs and share one authorization model. Partners see only assigned projects and explicit denied states for owner-only data. New specialist tables increase the authorization matrix to 44 RLS tables and the exposed-function boundary to 61 functions.

The module registry is operational metadata, so changes require an additive migration and corresponding SQL, HTTP and browser acceptance updates. The design does not implement file ingestion, model synthesis, provider jobs, publication, live trading or approved numeric scoring. Those remain later milestones.
