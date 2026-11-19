-- Direct administrative fixtures and future versions inherit the current state
-- vocabulary. The prior default retained the retired QUARANTINE spelling.
alter table kxra.files
  alter column lifecycle_state set default 'QUARANTINED';

alter table kxra.file_versions
  alter column lifecycle_state set default 'QUARANTINED';
