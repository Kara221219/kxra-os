import { test } from "node:test";
import assert from "node:assert/strict";
import { parse } from "parse5";
import {
  customAppSchema,
  exampleCustomApp,
} from "../packages/custom-apps/contract";
import {
  renderCustomAppPreview,
  previewCsp,
} from "../packages/custom-apps/preview";
test("custom forms reject executable, ambiguous and oversized schema inputs", () => {
  for (const schema of [
    null,
    {},
    { ...exampleCustomApp, format: null },
    { ...exampleCustomApp, source: "process.env" },
    { ...exampleCustomApp, fields: [] },
    { ...exampleCustomApp, fields: Array(21).fill(exampleCustomApp.fields[0]) },
    { ...exampleCustomApp, title: "x".repeat(121) },
    ...["script", null, "iframe", ["text"], { toString: "text" }].map(
      (type) => ({
        ...exampleCustomApp,
        fields: [{ ...exampleCustomApp.fields[0], type }],
      }),
    ),
    ...["constructor", "prototype", "__proto__", "../secret"].map((key) => ({
      ...exampleCustomApp,
      fields: [{ ...exampleCustomApp.fields[0], key }],
    })),
    {
      ...exampleCustomApp,
      fields: [exampleCustomApp.fields[0], exampleCustomApp.fields[0]],
    },
    {
      ...exampleCustomApp,
      fields: [
        { ...exampleCustomApp.fields[0], url: "https://example.invalid" },
      ],
    },
    {
      ...exampleCustomApp,
      fields: [
        {
          key: "x",
          type: "select",
          label: "x",
          required: true,
          options: Array(1),
        },
      ],
    },
    {
      ...exampleCustomApp,
      fields: [
        {
          key: "x",
          type: "select",
          label: "x",
          required: true,
          options: ["same", "same"],
        },
      ],
    },
  ])
    assert.equal(
      customAppSchema.safeParse(schema).success,
      false,
      JSON.stringify(schema),
    );
});
test("preview renders untrusted labels as text, with no source or capability bindings", () => {
  const attack =
    '</title><script>top.location="https://example.invalid"</script><img src=x onerror=alert(1)><style>@import "x";</style>';
  const schema = {
    ...exampleCustomApp,
    title: attack.slice(0, 120),
    description: attack,
    fields: [
      {
        key: "attack",
        type: "select",
        required: true,
        label: attack.slice(0, 120),
        options: [attack.slice(0, 120)],
      },
    ],
  };
  const html = renderCustomAppPreview(schema),
    doc = parse(html);
  const tags: string[] = [],
    attrs: string[] = [];
  function visit(n: any) {
    if (n.tagName) tags.push(n.tagName);
    for (const a of n.attrs || []) attrs.push(a.name);
    for (const child of n.childNodes || []) visit(child);
  }
  visit(doc);
  for (const tag of ["script", "img", "iframe", "object", "base", "link"])
    assert.equal(tags.includes(tag), false);
  assert.equal(tags.filter((t) => t === "style").length, 1);
  assert.equal(
    attrs.some((a) => /^on|^(src|href|action|formaction)$/.test(a)),
    false,
  );
  assert.ok(previewCsp.includes("default-src 'none'"));
  assert.ok(previewCsp.includes("form-action 'none'"));
  assert.equal(html, renderCustomAppPreview(schema));
});
