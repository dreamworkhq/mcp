# Dreamwork

Dreamwork is a job-search product. This plugin connects Claude to it, so you
can search job listings, get roles ranked against your resume, prepare a
tailored resume and cover letter, apply, and track replies from a
conversation.

## What the plugin contains

One MCP connector named `dreamwork`, which points at Dreamwork's hosted server,
`https://mcp.dreamworkhq.com/mcp`. The plugin has no skills, commands, hooks or
scripts. It installs nothing and runs nothing on your machine.

## What works without an account

Before you sign in, Claude can search and read every listing Dreamwork holds
(`browse_listings`, `get_listing`) and read current hiring-market figures
(`get_market_pulse`, `get_top_hiring_companies`).

Everything about your own job search needs a Dreamwork account, and a free one
is enough to start: matches ranked against your resume, saved jobs, tailored
materials, your application pipeline, recruiter mail and applying. Your plan
sets how much of each you can use in a day.

## Use it

Connect the `dreamwork` connector and sign in with your Dreamwork account. The
consent screen lists what the connection may do: read, write, apply and send
mail. Then ask in your own words, for example:

- "Find remote senior backend roles posted this week that pay over $180k."
- "Show my best new matches and prepare a tailored resume and cover letter for
  the two I pick."
- "What changed in my job search since yesterday?"

## What it sends, and what needs your say

Each tool call sends Dreamwork the arguments Claude passes: search filters,
text you ask it to save, or a resume file you ask it to upload. Results come
from Dreamwork's listing index and from your own account. The plugin talks to
`mcp.dreamworkhq.com` and no other service.

Nothing reaches an employer or a recruiter on a first call. Applying, answering
an employer's questions, replying to a recruiter, changing Autopilot and
starting checkout each return a summary of what would happen. They run only
after you agree and Claude sends the confirmation back.

## Links

- Tool reference: <https://www.dreamworkhq.com/agents/docs>
- Help: <https://www.dreamworkhq.com/help>
- Privacy: <https://www.dreamworkhq.com/privacy>
- Terms: <https://www.dreamworkhq.com/terms>
- Source: <https://github.com/dreamworkhq/mcp>
