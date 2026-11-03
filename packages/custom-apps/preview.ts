import { customAppSchema } from "./contract";

export const previewCsp =
  "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; connect-src 'none'; img-src 'none'; font-src 'none'; media-src 'none'; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
function escape(value: string) {
  return value.replace(
    /[&<>"']/g,
    (v) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        v
      ]!,
  );
}
/** Trusted renderer only: no source, expressions, URLs, handlers or capability bindings. */
export function renderCustomAppPreview(input: unknown) {
  const app = customAppSchema.parse(input);
  const fields = app.fields
    .map((f) => {
      const id = `field-${f.key}`,
        required = f.required ? " required" : "";
      const control =
        f.type === "textarea"
          ? `<textarea id="${id}" maxlength="4000"${required}></textarea>`
          : f.type === "select"
            ? `<select id="${id}"${required}><option value="">Select…</option>${f.options.map((v) => `<option>${escape(v)}</option>`).join("")}</select>`
            : `<input id="${id}" type="${f.type}"${f.type === "text" ? ' maxlength="1000"' : ""}${required}>`;
      return `<p><label for="${id}">${escape(f.label)}${f.required ? " (required)" : ""}</label><br>${control}</p>`;
    })
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${escape(previewCsp)}"><meta name="referrer" content="no-referrer"><title>${escape(app.title)}</title><style>body{font:16px system-ui;margin:24px;color:#162331;background:#fff}input,textarea,select{font:inherit;max-width:100%;padding:8px}textarea{width:90%;height:90px}label{font-weight:600}</style></head><body><h1>${escape(app.title)}</h1><p>${escape(app.description)}</p><p>Isolated local preview. Entries are not saved or sent.</p><form autocomplete="off">${fields}<button type="reset">Reset preview entries</button></form></body></html>`;
}
