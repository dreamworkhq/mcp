#!/usr/bin/env tsx
/**
 * Write the generated tool-catalog blocks into the three documents that
 * describe them. `test/tool-catalog.test.ts` re-renders the same blocks and
 * fails when the checked-in files differ, so this is the only way to change
 * them.
 */
import { writeFileSync } from "node:fs";
import { relative } from "node:path";

import { REPO_ROOT, renderAll } from "./tool-docs.js";

for (const { path, contents } of await renderAll()) {
  writeFileSync(path, contents, "utf-8");
  console.log(`Wrote ${relative(REPO_ROOT, path).replaceAll("\\", "/")}`);
}
