// Server-provided UI copy keeps the customer form's client bundle within the OS budget.
export const customAppRecordCopy = {
  intro:
    "Records are saved in this local workspace. Preview entries are separate and never saved. Drafts are discarded on reload; reload never submits a form.",
  unavailable: "App unavailable",
  refreshFailed:
    "Save confirmed. Records could not refresh; reload records to see the saved result.",
  rejected: ". Reload records before retrying changed data.",
  unknown:
    "Save outcome is unknown. Check result or retry this exact save before starting another record.",
  changed:
    "App publication changed. This draft cannot be saved. Reload records and choose a new form or an editable record. Historical records keep their original schema.",
  unpublished:
    "The room creator must publish a local version before records can be saved.",
  historical: "Historical schema retained; read-only under this publication.",
  unconfirmed: "Unconfirmed save retained in this page.",
  reload: "Reload records",
  newRecord: "New record",
  retry: "Retry exact save",
  check: "Check save result",
  save: "Save record",
  saved: "Saved records",
  empty: "No saved records.",
  older: "Load older records",
};
export type CustomAppRecordCopy = typeof customAppRecordCopy;
