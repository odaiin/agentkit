import { z } from "zod";

/**
 * Advisory quote-sizing guidance published with the AssetFare integration.
 * These values do not change the API minimum or guarantee the best route.
 */
export const ASSETFARE_EVALUATION_GUIDANCE = {
  routeMinimumUsd: 1,
  reachabilitySmokeUsd: 1,
  reachabilitySmokeOnly: true,
  nativeUsdcEconomicEvaluationStartUsd: 50,
  representativeEconomicEvaluationUsd: 1000,
  solInputRepresentativeEvaluationUsd: 1000,
  solInputCaveat:
    "SOL-input routes add a source swap, so compare their full fee-inclusive route economics separately",
  evidenceAsOf: "2026-09-23",
  evidenceScope:
    "Dated Solana native USDC to Base native USDC measurements at USD 50, 250, and 1000",
  notAMinimum: true,
  notGuaranteedBest: true,
  alwaysCompareFreshAtIntendedAmount: true,
} as const;

/**
 * Chains exposed by the AssetFare public v2 route matrix.
 */
export const AssetFareChainSchema = z.enum([
  "solana",
  "base",
  "arbitrum",
  "robinhood",
  "polygon",
  "optimism",
]);

/**
 * Assets exposed by the AssetFare public v2 route matrix.
 */
export const AssetFareTokenSchema = z.enum(["SOL", "ETH", "USDC", "USDG"]);

const tokensByChain: Record<z.infer<typeof AssetFareChainSchema>, readonly string[]> = {
  solana: ["SOL", "USDC", "USDG"],
  base: ["ETH", "USDC"],
  arbitrum: ["ETH", "USDC"],
  robinhood: ["ETH", "USDG"],
  polygon: ["USDC"],
  optimism: ["USDC"],
};

/**
 * Input schema for reading AssetFare capabilities and live route readiness.
 */
export const GetCapabilitiesSchema = z
  .object({})
  .strict()
  .describe("No inputs; reads the public AssetFare capability and status surface");

/**
 * Input schema for requesting one fresh AssetFare route quote.
 */
export const GetQuoteSchema = z
  .object({
    fromChain: AssetFareChainSchema.describe("Source chain, e.g. solana"),
    fromToken: AssetFareTokenSchema.describe("Source asset symbol, e.g. USDC"),
    toChain: AssetFareChainSchema.describe("Destination chain, e.g. base"),
    toToken: AssetFareTokenSchema.describe("Destination asset symbol, e.g. USDC"),
    amountUsd: z
      .number()
      .finite()
      .min(1)
      .describe(
        "Finite USD notional to route. The API minimum is 1 with no business maximum, but USD 1 is only for reachability smoke testing. Native-USDC economic evaluation starts at USD 50, and USD 1,000 is the representative evaluation amount, not a minimum or best-route guarantee. Always compare fresh quotes at the actual intended amount; live liquidity and capacity still apply",
      ),
  })
  .strict()
  .superRefine((value, context) => {
    if (!tokensByChain[value.fromChain].includes(value.fromToken)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["fromToken"],
        message: "token is not supported on source chain",
      });
    }
    if (!tokensByChain[value.toChain].includes(value.toToken)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["toToken"],
        message: "token is not supported on destination chain",
      });
    }
    if (value.fromChain === value.toChain && value.fromToken === value.toToken) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["toToken"],
        message: "identity routes do not require a quote",
      });
    }
    if (value.toChain === "polygon" || value.toChain === "optimism") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["toChain"],
        message: "Polygon and Optimism are source-only",
      });
    }
    if (
      (value.fromChain === "polygon" || value.fromChain === "optimism") &&
      !(
        value.fromToken === "USDC" &&
        (value.toChain === "base" || value.toChain === "arbitrum") &&
        value.toToken === "USDC"
      )
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["toChain"],
        message: "source-only route must be native USDC to Base or Arbitrum USDC",
      });
    }
  })
  .describe("Instructions for requesting one fresh cross-chain route quote");
