# Contributing

Open an issue here with the client, transport, package version, and steps to
reproduce. Keep API keys, resumes, and other personal data out of issues.

This repository receives reviewed source exports from Dreamwork's development
repository. Maintainers apply fixes there and export them with an MCP release.
Public pull requests are welcome as proposed patches; merging a patch here
alone does not publish it to npm or deploy the Dreamwork API. npm receives a
release only when a maintainer's release tag arrives with an export.

Use Node 22 and pnpm 10.23.0. Run `pnpm install --frozen-lockfile`, then
`pnpm check`, `pnpm test`, `pnpm build`, and `pnpm test:package`. The last command
installs the actual npm tarball in a clean directory and exercises the MCP
handshake and tool catalog. It requires access to the public npm registry.

`pnpm docs` regenerates the tool catalog from the MCP server. The checked-in
`apps/web/src/app/agents/docs/docsData.ts` is a documentation snapshot used by the
catalog check; this repository does not contain or run the Dreamwork web app.

The root `server.json` is the `io.github.dreamworkhq/dreamwork` registry entry.
It lists the `@dreamworkhq/mcp` npm package and the hosted OAuth endpoint.
`apps/mcp/server.json` is the same manifest without the hosted endpoint; the
package tests read it. A release tag in this repository runs
`.github/workflows/publish-registry.yml`, which builds the package from this
source, publishes it to npm with provenance through npm trusted publishing,
and then publishes the root `server.json` to the MCP Registry. Maintainers
create release tags; the workflow does not publish to npm for a pull request
or a branch.
