# Contributing

Open an issue here with the client, transport, package version, and steps to
reproduce. Keep API keys, resumes, and other personal data out of issues.

This repository receives reviewed source exports from Dreamwork's development
repository. Maintainers apply fixes there and export them with an MCP release.
Public pull requests are welcome as proposed patches; merging a patch here
alone does not publish it to npm or deploy the Dreamwork API.

Use Node 22 and pnpm 10.23.0. Run `pnpm install --frozen-lockfile`, then
`pnpm check`, `pnpm test`, `pnpm build`, and `pnpm test:package`. The last command
installs the actual npm tarball in a clean directory and exercises the MCP
handshake and tool catalog. It requires access to the public npm registry.

`pnpm docs` regenerates the tool catalog from the MCP server. The checked-in
`apps/web/src/app/agents/docs/docsData.ts` is a documentation snapshot used by the
catalog check; this repository does not contain or run the Dreamwork web app.

The root `server.json` is the `io.github.dreamworkhq/dreamwork` registry entry.
It lists the `@dreamworkhq/mcp` npm package and the hosted OAuth endpoint, and
this repository's release tag publishes it to the MCP Registry.
`apps/mcp/server.json` is the same manifest without the hosted endpoint; the
package tests read it. npm publishing remains in Dreamwork's development
repository using its existing trusted publisher.
