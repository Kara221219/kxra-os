import { test } from "node:test";
import assert from "node:assert/strict";
import configuration from "../apps/os/next.config.mjs";

for (const dev of [false, true]) {
  for (const isServer of [false, true]) {
    test(`OS module IDs: dev=${dev}, server=${isServer}`, () => {
      const minimizer = { apply() {} };
      const optimization = {
        moduleIds: "deterministic",
        chunkIds: "deterministic",
        minimize: !dev,
        minimizer: [minimizer],
        splitChunks: { chunks: "all" },
      };
      const config = {
        optimization,
        plugins: [{ apply() {} }],
        output: { publicPath: "/_next/" },
        mode: dev ? "development" : "production",
      };
      const expected = {
        ...config,
        optimization: {
          ...optimization,
          moduleIds: !dev && !isServer ? "size" : "deterministic",
        },
      };
      const result = configuration.webpack(config, { dev, isServer });
      assert.equal(result, config);
      assert.equal(result.optimization, optimization);
      assert.equal(result.optimization.minimizer[0], minimizer);
      assert.deepEqual(result, expected);
    });
  }
}
