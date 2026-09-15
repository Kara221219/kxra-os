# PROJECT-004 — AI Trading Research & Monitoring Laboratory

Classification: USER-SUPPLIED INFORMATION for the source concept; DECISION for current implementation gates.

Stage: FEASIBILITY. Status: INTERNAL R&D / PAPER ONLY. Venture and Confidence scores: NOT ASSESSED. No invented performance or market validation.

Next action: define the paper protocol and pass paper-readiness checks; no live execution.

Implemented locally: all 18 common modules plus Research, Market Calendar, Watchlist, Strategy, Readiness, Paper Account, Historical Data, Paper Experiments, Risk Ledger, Schedule, Run History, Midday Reports and After-Close Reports. Paper research payloads must set `paper_only=true`; a database trigger applies the same rule to both report modules. The P004 paper-readiness gate records protocol, risk-limit and paper-account evidence without enabling any live capability.

Hard stop: research/paper only. The schema rejects `live_execution_enabled=true`. There is no broker adapter, live credential, live toggle, live approval, order path or trade executor. The original project specification stays in the owner’s private Genesis package and is not published here.
