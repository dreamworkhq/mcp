# Install the Dreamwork MCP server

There is no install step. Do not clone the repository, do not create a project directory, and do not build from source. Add one `dreamwork` entry to the user's existing `cline_mcp_settings.json`. Read that file first and leave every other server in place.

The file is `cline_mcp_settings.json`:

- Cline CLI: `~/.cline/data/settings/cline_mcp_settings.json`, or the path in `CLINE_MCP_SETTINGS_PATH`
- Cline in an editor: open the MCP Servers icon, then Configure, then Configure MCP Servers

The server needs Node.js 22 or newer when it runs locally. The remote setup needs no Node.js install.

## Remote

Prefer the hosted server. It is Streamable HTTP at `https://mcp.dreamworkhq.com/mcp`. Signing in is OAuth. There is nothing to install and no key to paste.

```json
{
  "mcpServers": {
    "dreamwork": {
      "type": "streamableHttp",
      "url": "https://mcp.dreamworkhq.com/mcp",
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

`type` must be `streamableHttp`. Leaving it out selects the legacy SSE transport.

With no sign-in, the server is in guest mode. These tools run: `browse_listings`, `get_listing`, `get_platform_context`, and `get_upgrade_link`. Account tools answer `401` with `WWW-Authenticate` so the client can sign in with OAuth.

A client that sets headers can send an API key instead of signing in with OAuth:

```json
{
  "mcpServers": {
    "dreamwork": {
      "type": "streamableHttp",
      "url": "https://mcp.dreamworkhq.com/mcp",
      "headers": {
        "Authorization": "Bearer sk_..."
      },
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

## Local

`npx` runs the published package. Guest mode needs no key:

```json
{
  "mcpServers": {
    "dreamwork": {
      "command": "npx",
      "args": ["-y", "@dreamworkhq/mcp@latest"],
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

`command` must be `npx` itself. Do not wrap it in a shell or an env loader such as `dotenvx run --`. On a stdio server, any banner printed to stdout corrupts the JSON-RPC stream and tool calls hang. Stdout carries only protocol frames. Logging goes to stderr.

Account tools need a key in `env`:

```json
{
  "mcpServers": {
    "dreamwork": {
      "command": "npx",
      "args": ["-y", "@dreamworkhq/mcp@latest"],
      "env": {
        "DREAMWORK_API_KEY": "sk_..."
      },
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

## Guest mode and API keys

Guest mode is free and needs no account. With no key, the server exposes only `browse_listings`, `get_listing`, `get_platform_context`, and `get_upgrade_link`. Account tools answer with a short "No API key" message.

An API key unlocks the account tools: ranked matches, tailored resumes and cover letters, applying, and tracking replies. Any Dreamwork account can create one, including the free plan. Sign in at [dreamworkhq.com](https://www.dreamworkhq.com), open Profile, then MCP. The Agents page has a Get a key button that lands in the same place. The key looks like `sk_...`. Put it in `DREAMWORK_API_KEY` for the local server, or in the `Authorization` header for the remote server, then restart the MCP client.

`JOBLESS_API_TOKEN` is still accepted as an alias. New configs should use `DREAMWORK_API_KEY`.

## Check the setup

Call `get_platform_context` or `browse_listings`. `get_platform_context` describes what this session can do. A guest session can run both.

## Stale npx cache

A cached `@dreamworkhq/mcp@1.1.4` exposes 24 tools, including `search_jobs`, `list_applications`, `apply_to_job`, and `add_listing_to_pipeline`. Current releases replaced those. If `tools/list` shows that old set, clear the npx cache and keep `@latest` in `args`:

```bash
rm -rf ~/.npm/_npx
```
