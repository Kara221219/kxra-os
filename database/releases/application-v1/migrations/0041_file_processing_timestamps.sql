-- Transaction timestamps can precede a worker's wall-clock start time. Use the
-- wall clock for completion defaults so the completed_at >= started_at invariant
-- remains true for long-lived worker transactions.
alter table kxra.file_scan_runs
  alter column completed_at set default clock_timestamp();

alter table kxra.file_extractions
  alter column completed_at set default clock_timestamp();
