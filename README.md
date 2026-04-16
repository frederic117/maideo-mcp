# @maideo/mcp

Official MCP (Model Context Protocol) server for the Maideo Agent API.

Lets any MCP-compatible AI agent (Claude Desktop, Claude Code, ChatGPT desktop, Continue.dev, Cursor, etc.) book professional home cleaning services (ménage à domicile) anywhere in France, end-to-end, without human intervention.

## What it does

- Checks coverage by postal code
- Returns a firm price quote
- Creates a booking in Maideo's back-office (visible to the ops team)
- Enrolls the end user with URSSAF for the 50% immediate tax credit advance (no card payment needed — SEPA direct debit after each intervention)
- Polls booking status

## Tools exposed

| Tool | Purpose |
|------|---------|
| `search_coverage` | Check if Maideo serves a zip code |
| `get_quote` | Get a firm 72h-valid price quote |
| `create_booking` | Create the booking (returns a 72h `bookingToken`) |
| `enroll_avance_immediate` | Submit URSSAF enrollment (IBAN + identity) |
| `get_booking_status` | Poll status (order, worker, URSSAF) |

## Install

```bash
npm install -g @maideo/mcp
# or use npx without installing:
npx @maideo/mcp
```

## Configure Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "maideo": {
      "command": "npx",
      "args": ["-y", "@maideo/mcp"],
      "env": {
        "MAIDEO_AGENT_NAME": "claude-desktop"
      }
    }
  }
}
```

Restart Claude Desktop. You can now ask Claude:

> "Can you book me a weekly 3-hour cleaning at 12 rue de Rivoli, 75001 Paris, starting next Monday?"

Claude will chain the 5 tools automatically.

## Configure Claude Code

```bash
claude mcp add maideo npx -- -y @maideo/mcp
```

## Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `MAIDEO_API_BASE` | `https://api.maideo.fr/public/agent` | API base URL (override for staging/dev) |
| `MAIDEO_AGENT_NAME` | `maideo-mcp-client` | Identifier sent via `X-Agent-Name` header (used for rate limiting and analytics) |

## Anti-fraud hold

All bookings created via this MCP server are held for 48h before worker dispatch. The Maideo ops team may phone/SMS the end user to verify. **Do not submit bookings with fake data in production.** Your `MAIDEO_AGENT_NAME` may be blocklisted.

You must also collect explicit consent from the end user before calling `create_booking`. Pass `agentConsent: true` as a binding attestation.

## How payment works (there is no payment step)

Maideo uses the URSSAF **avance immédiate de crédit d'impôt** (immediate tax credit advance), a French government program for home services.

1. End user enrolls via `enroll_avance_immediate` — provides identity, birth place, address, IBAN
2. Worker does the cleaning
3. Maideo declares the hours to URSSAF
4. URSSAF pays Maideo directly for 50% of the amount (the tax credit portion)
5. URSSAF collects the remaining 50% from the end user via SEPA direct debit

**No card, no Stripe, no upfront payment, no signed PDF.** The IBAN + identity are enough.

## Links

- [Maideo website](https://www.maideo.fr)
- [OpenAPI spec](https://www.maideo.fr/openapi.json)
- [Agents policy](https://www.maideo.fr/agents.txt)
- [LLMs manifest](https://www.maideo.fr/llms.txt)

## License

MIT
