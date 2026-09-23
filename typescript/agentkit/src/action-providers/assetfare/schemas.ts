import { z } from "zod";

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
      .min(1)
      .max(1000)
      .describe("USD notional to route, from 1 through 1000 inclusive"),
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
