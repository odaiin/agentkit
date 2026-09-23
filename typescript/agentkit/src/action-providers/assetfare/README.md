# AssetFare Action Provider

This directory contains the AssetFare action provider implementation, which provides read-only
actions for non-custodial cross-chain bridge and swap route quotes from the AssetFare public v2 API.

AssetFare returns quotes and, only on an explicit caller-approved call outside this provider,
unsigned actions. It never receives a private key and never signs or submits a transaction.

## Directory Structure

```
assetfare/
├── assetfareActionProvider.test.ts # Tests for the provider
├── assetfareActionProvider.ts      # Main provider with AssetFare API functionality
├── index.ts                        # Main exports
├── README.md                       # Documentation
└── schemas.ts                      # AssetFare action schemas
```

## Actions

- `get_capabilities`: Read the live route surface

  - Returns supported chains and asset endpoints, implemented directed routes, and how many are
    currently ready to prepare
  - Availability is live, not static: read it before treating a route as usable
  - Fails closed if the service does not report `server_signing: false` and `server_submission: false`

- `get_quote`: Request one fresh route quote
  - Inputs: source chain and asset, destination chain and asset, finite USD notional of at least 1 with no business maximum (live liquidity/capacity still apply)
  - Returns expected and minimum receive, the full `cost_summary` (AssetFare service fee of 1bp plus
    separate Circle, provider, and network fee components), unpriced costs, ETA, TTL, and non-atomic risk
  - The 1bp service fee is not the total cost; judge the route by the total token-path cost
  - Read-only: no wallet authentication, no unsigned action preparation, no signing, no submission

## Usage

```typescript
import { AgentKit } from "@coinbase/agentkit";
import { assetfareActionProvider } from "@coinbase/agentkit";

const agentKit = await AgentKit.from({
  walletProvider,
  actionProviders: [assetfareActionProvider()],
});
```

## Examples

### Reading capabilities

```bash
Prompt: Which cross-chain routes can AssetFare quote right now?

-------------------
{
  "success": true,
  "chains": ["arbitrum", "base", "optimism", "polygon", "robinhood", "solana"],
  "implementedRoutes": 76,
  "currentlyPrepareReadyRoutes": 76,
  "temporarilyUnavailableRoutes": [],
  "serverSigning": false,
  "serverSubmission": false,
  "feeNote": "AssetFare service fee is 1bp; Circle, provider, and network fees are additional. Each quote exposes the total token-path cost and live availability."
}
-------------------
```

### Quoting a route

```bash
Prompt: Quote moving $250 of Solana USDC to Base USDC.

-------------------
{
  "success": true,
  "ttlSeconds": 60,
  "offer": { "expected_receive_usd": 249.895639, "estimated_min_receive_usd": 249.895318 },
  "costSummary": {
    "expected_total_cost_usd": 0.104361,
    "expected_total_cost_percent": 0.0417,
    "assetfare_service_fee": { "bps": 1, "estimated_usd": 0.025 },
    "unpriced_costs": ["source_chain_network_fee"],
    "rankable_all_in": false
  },
  "risk": { "non_atomic": true, "server_signing": false, "server_submission": false }
}
-------------------
```

## Notes

- Quotes are short-lived; request a fresh one before acting.
- Cross-chain routes are non-atomic: an early step can succeed while a later one fails.
- Source-chain gas is not priced into the returned totals, so the cost summary is not an all-in
  ranking figure. Compare fresh quotes from several providers before choosing a route.
- Network configuration is not required: the provider reads a public API and is network-agnostic.

## Adding New Actions

To add new AssetFare actions:

1. Define your schema in `schemas.ts`
2. Implement your action in `assetfareActionProvider.ts`
3. Add corresponding tests in `assetfareActionProvider.test.ts`
