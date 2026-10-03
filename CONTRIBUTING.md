# Contributing

Open an issue here with the client, transport, package version, and steps to
reproduce. Keep agent keys, resumes, and other personal data out of issues.

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

The root `server.json` describes the hosted OAuth endpoint for the
`io.github.dreamworkhq/dreamwork` registry entry. The stdio package retains
`io.github.ponder-surveys/dreamwork` for compatibility. npm publishing remains
in Dreamwork's development repository using its existing trusted publisher.
