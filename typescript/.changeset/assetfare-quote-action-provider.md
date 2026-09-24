---
"@coinbase/agentkit": patch
---

Added an AssetFare action provider with read-only non-custodial cross-chain bridge and swap route quotes (capabilities and quote actions) across six chains. Quotes fail closed on the REST 2.4 continuation_v3 binding and expose only a sanitized unranked descriptor; the provider never creates approval_v3, collects wallets, prepares, opens a session, signs, or submits.
