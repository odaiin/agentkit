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
  - Returns the validated `directRouteSummary` capability contract, which declares that every v2
    quote must carry an ordered, normalized, amount-bounded provider path
  - Availability is live, not static: read it before treating a route as usable
  - Fails closed if the service does not report the mandatory summary contract or
    `server_signing: false` and `server_submission: false`

- `get_quote`: Request one fresh route quote
  - Inputs: source chain and asset, destination chain and asset, finite USD notional of at least 1 with no business maximum (live liquidity/capacity still apply)
  - Returns expected and minimum receive, the full `cost_summary` (AssetFare service fee of 1bp plus
    separate Circle, provider, and network fee components), unpriced costs, ETA, TTL, and non-atomic risk
  - Returns `directRouteSummary`, validated from the API's `direct_route_summary`: the exact ordered
    providers and `chain:asset` endpoints, expected/minimum base-unit bounds as decimal strings, and
    the one step that collects the AssetFare 1bp fee
  - Fails closed if the summary is missing, has extra or malformed fields, breaks path or amount
    continuity, misstates a provider/action/fee, or disagrees with the requested intent or the
    quote's route, risk, fee, or raw provider steps
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

The API minimum is USD 1, but USD 1 is only for reachability smoke testing, not economic evaluation.
For native-USDC routes, economic evaluation starts at USD 50. Use USD 1,000 as the primary
representative amount, including for SOL-input routes whose extra source swap must be assessed
separately. These advisory values come from dated 2026-09-23 evidence; they are not minimums or a
guarantee that AssetFare is best. Always compare fresh quotes at the actual intended amount.

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
  "directRouteSummary": {
    "version": "assetfare-direct-route-summary-v1",
    "required_on_every_quote": true,
    "route_count": 76,
    "ordered_provider_path": true,
    "normalized_chain_asset_endpoints": true,
    "assetfare_fee_step_bound": true,
    "classification_values": ["direct_protocol_only", "external_intent"],
    "route_aggregator_used_scope": "assetfare_engine_only"
  },
  "feeNote": "AssetFare service fee is 1bp; Circle, provider, and network fees are additional. Each quote exposes the total token-path cost and live availability."
}
-------------------
```

### Quoting a route

```bash
Prompt: Quote moving $1,000 of Solana native USDC to Base native USDC.
```

The live response is intentionally not reproduced here: quote amounts, availability, and TTL change.
Inspect its full `costSummary`, unpriced costs, risk fields, and `directRouteSummary.steps`, then
compare it with other fresh executable quotes for the intended amount. The summary's
`direct_protocol_only` classification means every listed step uses a disclosed direct protocol.
`external_intent` means the path includes Across for Robinhood ingress; in that case
`provider_internal_dex_aggregation_possible` is true because Across may source or aggregate
liquidity internally. `route_aggregator_used: false` is limited to AssetFare's own route engine and
must not be presented as a claim about a provider's internal routing.

## Notes

- Quotes are short-lived; request a fresh one before acting.
- Cross-chain routes are non-atomic: an early step can succeed while a later one fails.
- Treat a quote rejected by the summary validator as unusable; never present partial fields or
  reconstruct a missing path.
- Source-chain gas is not priced into the returned totals, so the cost summary is not an all-in
  ranking figure. Compare fresh quotes from several providers before choosing a route.
- Network configuration is not required: the provider reads a public API and is network-agnostic.

## Adding New Actions

To add new AssetFare actions:

1. Define your schema in `schemas.ts`
2. Implement your action in `assetfareActionProvider.ts`
3. Add corresponding tests in `assetfareActionProvider.test.ts`
