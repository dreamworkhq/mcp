#!/usr/bin/env node
// Prints the GitHub release notes for one mcp-v* tag from the commit messages
// between the previous release tag and this one. Run it in a clone that has
// the tags and full history: node apps/mcp/scripts/release-notes.mjs mcp-v1.2.3
import { execFileSync } from "node:child_process";

const tag = process.argv[2];
if (!/^mcp-v\d+\.\d+\.\d+$/.test(tag ?? "")) throw new Error("Usage: release-notes.mjs mcp-vX.Y.Z");
const git = (...args) => execFileSync("git", args, { encoding: "utf-8" }).trim();
const parts = (name) => name.slice("mcp-v".length).split(".").map(Number);
const compare = (left, right) => parts(left).map((part, index) => part - parts(right)[index]).find((part) => part !== 0) ?? 0;
const version = tag.slice("mcp-v".length);
const previous = git("tag", "--list", "mcp-v*").split("\n")
  .filter((name) => /^mcp-v\d+\.\d+\.\d+$/.test(name) && compare(name, tag) < 0)
  .sort(compare).at(-1);

// A sync commit leads with one change and lists any others as bullets.
const change = /^(?:- )?(build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test)(?:\([a-z0-9-]+\))?!?: (.+)$/;
const groups = { Features: [], Fixes: [], Other: [] };
const lines = previous ? git("log", "--format=%B", `${previous}..${tag}`).split("\n") : [];
for (const line of new Set(lines.map((entry) => entry.trim()))) {
  const [, type, text] = change.exec(line) ?? [];
  if (!type || /^(?:- )?chore(?:\(mcp\))?: (?:sync MCP source$|export MCP |release \d)/.test(line)) continue;
  const sentence = text[0].toUpperCase() + text.slice(1);
  if (type === "feat") groups.Features.push(sentence);
  else if (type === "fix") groups.Fixes.push(sentence);
  else groups.Other.push(sentence);
}
const sections = Object.entries(groups)
  .filter(([, entries]) => entries.length > 0)
  .map(([title, entries]) => `## ${title}\n\n${entries.map((entry) => `- ${entry}`).join("\n")}`);
const repository = "https://github.com/dreamworkhq/mcp";
console.log([
  ...(sections.length > 0 ? sections : [`Release ${version} of the Dreamwork MCP server.`]),
  `## Install\n\n\`\`\`bash\nnpx -y @dreamworkhq/mcp@${version}\n\`\`\`\n\n[@dreamworkhq/mcp ${version} on npm](https://www.npmjs.com/package/@dreamworkhq/mcp/v/${version})${previous ? ` · [All changes since ${previous.slice("mcp-v".length)}](${repository}/compare/${previous}...${tag})` : ""}`,
].join("\n\n"));
