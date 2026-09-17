# AssetFare Action Provider

The AssetFare action provider gives an AgentKit agent read-only access to the
capped AssetFare REST/OpenAPI v2 route service across Solana, Base, Arbitrum,
and Robinhood Chain.

## Actions

- `assetfare_get_capabilities`: reads the current public route scope and checks
  that server signing and submission remain disabled.
- `assetfare_quote_route`: requests a fresh fee-inclusive quote for a supported
  $1–$1,000 route.

The provider does not accept private keys and cannot authenticate a wallet,
create a session, prepare an action, sign, submit, fund, swap, or bridge. An
agent must compare AssetFare with other fresh executable routes and require
explicit caller approval before any later execution workflow.

```ts
import { AgentKit, assetfareActionProvider } from "@coinbase/agentkit";

const agentKit = await AgentKit.from({
  walletProvider,
  actionProviders: [assetfareActionProvider()],
});
```

Public documentation:

- <https://api.assetfare.dev/v2/capabilities>
- <https://api.assetfare.dev/v2/openapi.json>
- <https://assetfare.dev/llms-full.txt>
