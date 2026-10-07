Dreamwork's public MCP source lives here. The client calls the hosted Dreamwork
API; it does not include the API, database, workers, or hosted OAuth service.

Connect over HTTP at `https://mcp.dreamworkhq.com/mcp`, or run the stdio client
with `npx -y @dreamworkhq/mcp`. Public job browsing works without a key.

For source development, use Node 22 and pnpm 10.23.0:

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build
pnpm test:package
```

The MCP client is in `apps/mcp`. `packages/api-contracts` and
`packages/assistant-contracts` contain its source dependencies; they are bundled
into the published CLI. `source-export.json` records the release's source commit.
See [CONTRIBUTING.md](CONTRIBUTING.md) for how changes reach a release.

---

# @dreamworkhq/mcp

MCP server for [Dreamwork](https://www.dreamworkhq.com): job-search tools for AI agents. Any MCP client (Claude Desktop, Cursor, the MCP Inspector) can use it to find roles, rank them, tailor applications, apply, and track outcomes for one person over time.

This server is a thin gateway: it calls the Dreamwork API over HTTPS and holds no database access of its own. Transport is stdio, and stdout carries only JSON-RPC frames.

## Install

There is no install step. MCP clients run it on demand with `npx`. The examples below use `npx -y @dreamworkhq/mcp`.

No key or account is needed to start. Without `DREAMWORK_API_KEY` the server
runs in free guest mode, where your agent can search and read every listing.
The `env` blocks below are optional; add a key when you want the account
tools (see [Guest mode and API keys](#guest-mode-and-api-keys)).

## Configure

### Claude Desktop

Add an entry to your `claude_desktop_config.json`
(`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "dreamwork": {
      "command": "npx",
      "args": ["-y", "@dreamworkhq/mcp"],
      "env": {
        "DREAMWORK_API_KEY": "sk_..."
      }
    }
  }
}
```

Restart Claude Desktop after editing. Put credentials in the `env` block. Do not
wrap `command` in a shell or an env-loader such as `dotenvx run -- …`: on a stdio
server, any banner the wrapper prints to stdout corrupts the JSON-RPC stream and
hangs tool calls.

### Cursor and other clients

Any stdio MCP client works. Cursor uses the same config shown above: point the
command at `npx -y @dreamworkhq/mcp` and pass `DREAMWORK_API_KEY` in the
environment. To check the setup with the Inspector:

```bash
DREAMWORK_API_KEY=sk_... npx @modelcontextprotocol/inspector npx -y @dreamworkhq/mcp
```

### Hosted endpoint

Dreamwork also serves these tools over Streamable HTTP at
`https://mcp.dreamworkhq.com/mcp`. In claude.ai, Claude Desktop, or ChatGPT,
add that URL as a custom connector and sign in to Dreamwork. There is nothing
to install and no key to paste. The consent screen asks which scopes the
connector gets.

Clients that set request headers can send an API key to the same URL
instead. In Claude Code:

```bash
claude mcp add --transport http dreamwork https://mcp.dreamworkhq.com/mcp \
  --header "Authorization: Bearer sk_..."
```

## Guest mode and API keys

Guest mode is free and needs no account. With no key set, the server starts in
guest mode and exposes the public, read-only tools: `browse_listings`,
`get_listing`, `get_platform_context`, and `get_upgrade_link`. The server tells
the agent it is in guest mode, so the agent can say what works now. Account
tools answer with a short "No API key" message that lists the steps to get one.

An API key needs a free account. Matches ranked against your resume, saved jobs,
tailored materials, the pipeline, recruiter mail, and applying need an API key.
Any Dreamwork account can generate one, including the free plan. Your plan sets
the key's rate limit and usage allowances. Sign in at
[dreamworkhq.com](https://www.dreamworkhq.com), open Profile, then MCP (or use
the Get a key button on the Agents page), then set the key as
`DREAMWORK_API_KEY` (format `sk_...`) and restart your MCP client.

When you generate a key you choose what it may do: read, write, apply, send
mail. The profile page starts with all four selected; uncheck anything your
agent should not do. A key can do less than you can, never more.

## Environment variables

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `DREAMWORK_API_KEY` | For account tools | none | API key (`sk_...`). Unlocks pipeline, resume, apply, outreach, profile, interviews. |
| `DREAMWORK_API_URL` | No | `https://api.dreamworkhq.com` | Override the API endpoint (local dev / self-host). |
| `DREAMWORK_UNREAD_NOTICES` | No | on | `off` (also `0`/`false`/`no`) stops tool results from carrying a note about unread recruiter mail. At most one check every five minutes; checking never marks mail read. |

`JOBLESS_API_TOKEN` and `JOBLESS_API_URL` are still accepted as backward-compatible
aliases for `DREAMWORK_API_KEY` and `DREAMWORK_API_URL`; prefer the `DREAMWORK_`
names for new configs.

## Telemetry

To measure usage, the server generates an anonymous random install id (a
UUID) on first run and stores it under your OS state directory
(`$XDG_STATE_HOME/dreamwork/install-id`, `~/.local/state/dreamwork/install-id` on
Linux/macOS, or `%LOCALAPPDATA%\dreamwork\install-id` on Windows). It is a random
value, never derived from your hostname, username, or any machine attribute. It
counts unique installs of guest (unauthenticated) usage. It is written at
runtime on your machine, never at build or publish time.

Opt out by setting either environment variable:

- `DREAMWORK_TELEMETRY=0` (also `false`/`no`/`off`)
- `DO_NOT_TRACK=1` (the [standard](https://consoledonottrack.com/) opt-out; also `true`/`yes`/`on`)

With telemetry disabled, no install id is generated, read, or sent.

## Tools

The typical flow: browse the public index, save roles to the pipeline, tailor
materials, apply, then track replies, interviews, and escalations. Call
`get_platform_context` first. It describes what Dreamwork can do, so the agent
picks the right workflow.

<!-- generated:mcp-tools:start -->
<!-- Generated by `pnpm --filter @dreamworkhq/mcp docs`. Edit the tool, not this table. -->

**Public (no key):**

`browse_listings`, `get_listing`, `get_platform_context`, `get_upgrade_link`

**Assistant actions:** one tool per capability in Dreamwork's assistant registry, each running through the same authorization ladder and receipt ledger the on-site assistant uses. A consequential one holds on its first call, answering with a summary and a confirmationToken; send that token back with identical arguments to go ahead.

`apply`, `cancel_apply`, `confirm_hypothesis`, `dismiss_match`, `edit_answer`, `edit_cover_letter`, `edit_resume`, `forget_hypothesis`, `format_resume`, `generate_pack`, `get_application_documents`, `get_application_readiness`, `get_application_status`, `get_autopilot_settings`, `get_autopilot_status`, `get_career_record`, `get_communication_preferences`, `get_inbox`, `get_job`, `get_pack_status`, `get_pipeline`, `get_preferences`, `get_resume_download_link`, `get_task`, `get_unread_reminders`, `get_updates_since`, `get_usage`, `import_job`, `list_matches`, `list_tasks`, `mark_applied_offsite`, `mark_messages_read`, `move_pipeline`, `parse_preferences_text`, `prepare_applications`, `remember_hypothesis`, `replace_application_document`, `reply_to_recruiter`, `restore_material`, `save_application_answers`, `save_job`, `set_autopilot`, `start_checkout`, `strengthen_application`, `undo_last`, `update_autopilot_settings`, `update_communication_preferences`, `update_preferences`

**Direct product tools:** routes with no registry action behind them.

`add_contact`, `add_jobs`, `generate_outreach`, `generate_resume`, `get_application_materials`, `get_generated_resumes`, `get_profile`, `get_stats`, `list_contacts`, `list_escalations`, `list_interviews`, `reopen_application_materials`, `resolve_escalation`, `update_application_materials`, `update_profile`, `upload_resume`

<!-- generated:mcp-tools:end -->

The server also offers five prompts, which hosts such as Claude Desktop and
Claude Code show as commands: `morning_brief` (what changed since you last
checked), `find_and_prepare` (search, pick, prepare materials),
`apply_to_prepared` (fill any missing answers, review, apply with
confirmation), `interview_prep`, and `autopilot_setup`.

Notes on a few tools:

- No tool sends mail or submits an application on its first call. `apply`,
  `reply_to_recruiter`, `set_autopilot`, `update_autopilot_settings` and
  `start_checkout` return `held` with a summary and a `confirmationToken`, and
  act only when you send that token back with identical arguments.
- 1.3.0 removed the 1.2.0 tools a registry action replaced: `search_jobs` and
  `list_applications` (use `get_pipeline`; `browse_listings` searches the
  index), `apply_to_job` (`apply`), `add_listing_to_pipeline` (`save_job`),
  `skip_job` (`dismiss_match`), and `send_outreach`. `resolve_escalation` only dismisses or hands over; replies
  and resubmissions go through `reply_to_recruiter` and `apply`.
- `update_application_materials` and `reopen_application_materials` are open to
  the Applications rollout cohort the API admits; outside it they return the
  API's own refusal.
- `get_stats` aggregates the signed-in candidate's own pipeline, so it needs a
  key like the rest.

### Key scopes

An API key carries scopes, chosen when you generate it:

| Scope | What it unlocks |
| --- | --- |
| `read` | Every read action: matches, pipeline, inbox, status, usage, receipts |
| `write` | Cheap and queued writes: save, dismiss, move, edit materials, preferences, checkout links |
| `apply` | Submitting an application, cancelling one that is still sending, and Autopilot |
| `send` | Mailing a recruiter |

A scope gates every path to the act, direct routes included.
`write` is the floor for changing anything: a key without it is refused on any
request that is not a `GET`, `HEAD`, or `OPTIONS`, so a read key cannot rewrite
a profile or move the board by calling the route directly. A key without
`apply` is refused at `apply`, and also at
`POST /jobs/:id/apply`, the turbo-apply routes and the escalation routes. A key
without `send` is refused at `reply_to_recruiter`, at
`POST /outreach/send` and at `POST /conversations/:id/reply`. A direct call
answers 403 with
`api_key_scope_required`, the scope it wants, and a message saying what to do;
an assistant action answers `action_not_authorized` with the same next step.

A key can never manage keys, rotate the session token, or delete the account.
Those answer 403 `session_required` whatever it holds.

The profile page preselects all four scopes, and a key request that names no
scopes gets read and write. A key created before scopes existed keeps everything it
could already do.

## Troubleshooting

- **Tool calls hang / time out, but the handshake succeeds.** Something is
  writing non-JSON-RPC bytes to stdout. Make sure `command` isn't wrapped in an
  env-loader or shell that prints a banner, and update to the latest version
  (`npx -y @dreamworkhq/mcp@latest`; clear the npx cache with `rm -rf ~/.npm/_npx`
  if an old build is cached). stdout must carry only protocol frames. All server
  logging goes to stderr.
- **Every account tool says "No API key".** `DREAMWORK_API_KEY` isn't
  reaching the process. Confirm it's in the `env` block of your client config.

## Development

```bash
pnpm --filter @dreamworkhq/mcp check   # typecheck
pnpm --filter @dreamworkhq/mcp build   # emit dist/
pnpm --filter @dreamworkhq/mcp test    # unit tests
```

The stdio entrypoint is [`src/stdio.ts`](apps/mcp/src/stdio.ts); tool definitions live in
[`src/mcp.ts`](apps/mcp/src/mcp.ts); the HTTP API client is [`src/client.ts`](apps/mcp/src/client.ts).

The server reads configuration from the process environment only. It does not
load a `.env` file. For local development export the vars in your shell (e.g.
`DREAMWORK_API_URL=http://127.0.0.1:3000 pnpm --filter @dreamworkhq/mcp stdio`).

Package-boundary decisions, tool-registration conventions
(`registerDreamworkTool`), error/versioning rules, and deferred review triggers
are recorded in [`ARCHITECTURE.md`](apps/mcp/ARCHITECTURE.md). The tool catalog above is
drift-checked against the registered tools by `test/tool-catalog.test.ts`.

## License

MIT

When an Apply request returns `missing_onboarding_fields` or
`missing_profile_fields`, the tool reports the missing fields and the Dreamwork
path that fixes each one. Complete those details in Dreamwork
before retrying; the failed request has not started an application.
