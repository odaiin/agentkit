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
 * Normalized chain-and-asset endpoints used by AssetFare's direct-route summary.
 */
export const AssetFareEndpointSchema = z.enum([
  "solana:SOL",
  "solana:USDC",
  "solana:USDG",
  "base:ETH",
  "base:USDC",
  "arbitrum:ETH",
  "arbitrum:USDC",
  "robinhood:ETH",
  "robinhood:USDG",
  "polygon:USDC",
  "optimism:USDC",
]);

const AssetFareDestinationEndpointSchema = z.enum([
  "solana:SOL",
  "solana:USDC",
  "solana:USDG",
  "base:ETH",
  "base:USDC",
  "arbitrum:ETH",
  "arbitrum:USDC",
  "robinhood:ETH",
  "robinhood:USDG",
]);

const AssetFareDirectRouteModeSchema = z.enum([
  "cctp_direct_composition",
  "optimism_source_cctp",
  "polygon_source_cctp",
  "robinhood_across_ingress_composition",
  "robinhood_paxos_egress_composition",
  "same_chain_direct",
  "same_chain_direct_composition",
]);

const AssetFareDirectRouteProviderSchema = z.enum([
  "across_intent_bridge",
  "circle_cctp",
  "orca_whirlpool",
  "paxos_usdg_layerzero_oft",
  "raydium_clmm",
  "uniswap_v3",
]);

const positiveBaseUnitStringSchema = z
  .string()
  .regex(/^[1-9][0-9]*$/, "must be a positive base-unit integer encoded as a decimal string");

const directSwapProviders = new Set<string>(["orca_whirlpool", "raydium_clmm", "uniswap_v3"]);

/**
 * One ordered and amount-bounded step in AssetFare's direct-route summary.
 */
export const AssetFareDirectRouteStepSchema = z
  .object({
    index: z.number().int().nonnegative(),
    action: z.enum(["swap", "bridge"]),
    provider: AssetFareDirectRouteProviderSchema,
    from: AssetFareEndpointSchema,
    to: AssetFareDestinationEndpointSchema,
    expected_input_base: positiveBaseUnitStringSchema,
    minimum_input_base: positiveBaseUnitStringSchema,
    expected_output_base: positiveBaseUnitStringSchema,
    minimum_output_base: positiveBaseUnitStringSchema,
    assetfare_fee_bps: z.union([z.literal(0), z.literal(1)]),
    direct_protocol: z.boolean(),
    external_intent_protocol: z.boolean(),
    aggregator_api_used: z.literal(false),
  })
  .strict()
  .superRefine((value, context) => {
    const externalIntent = value.provider === "across_intent_bridge";
    const expectedAction = directSwapProviders.has(value.provider) ? "swap" : "bridge";

    if (value.action !== expectedAction) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["action"],
        message: "action does not match the disclosed provider",
      });
    }
    if (value.direct_protocol !== !externalIntent) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["direct_protocol"],
        message: "direct-protocol classification does not match the disclosed provider",
      });
    }
    if (value.external_intent_protocol !== externalIntent) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["external_intent_protocol"],
        message: "external-intent classification does not match the disclosed provider",
      });
    }
    if (BigInt(value.minimum_input_base) > BigInt(value.expected_input_base)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["minimum_input_base"],
        message: "minimum input cannot exceed expected input",
      });
    }
    if (BigInt(value.minimum_output_base) > BigInt(value.expected_output_base)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["minimum_output_base"],
        message: "minimum output cannot exceed expected output",
      });
    }
  });

/**
 * Fail-closed, agent-readable path returned with every AssetFare v2 quote.
 */
export const AssetFareDirectRouteSummarySchema = z
  .object({
    version: z.literal("assetfare-direct-route-summary-v1"),
    route: z.string(),
    from: AssetFareEndpointSchema,
    to: AssetFareDestinationEndpointSchema,
    classification: z.enum(["direct_protocol_only", "external_intent"]),
    mode: AssetFareDirectRouteModeSchema,
    route_aggregator_used: z.literal(false),
    external_intent_protocol_used: z.boolean(),
    provider_internal_dex_aggregation_possible: z.boolean(),
    assetfare_fee_bps: z.literal(1),
    fee_collection_step_index: z.number().int().min(0).max(7),
    server_signing: z.literal(false),
    server_submission: z.literal(false),
    step_count: z.number().int().min(1).max(8),
    steps: z.array(AssetFareDirectRouteStepSchema).min(1).max(8),
  })
  .strict()
  .superRefine((value, context) => {
    const issue = (path: (string | number)[], message: string) =>
      context.addIssue({ code: z.ZodIssueCode.custom, path, message });
    const expectedRoute = `${value.from}->${value.to}`;
    const fromChain = value.from.split(":", 1)[0];
    const toChain = value.to.split(":", 1)[0];
    const acrossSteps = value.steps.filter(step => step.provider === "across_intent_bridge");
    const feeSteps = value.steps.filter(step => step.assetfare_fee_bps === 1);

    if (value.from === value.to) issue(["to"], "identity routes must not be quoted");
    if (value.route !== expectedRoute)
      issue(["route"], "route must match the normalized endpoints");
    if (value.step_count !== value.steps.length)
      issue(["step_count"], "step count must match the ordered path");

    value.steps.forEach((step, index) => {
      if (step.index !== index) issue(["steps", index, "index"], "step indices must be contiguous");
      if (index === 0 && step.from !== value.from)
        issue(["steps", index, "from"], "first step must begin at the quoted source");
      if (index === value.steps.length - 1 && step.to !== value.to)
        issue(["steps", index, "to"], "last step must end at the quoted destination");

      const next = value.steps[index + 1];
      if (next) {
        if (step.to !== next.from)
          issue(["steps", index + 1, "from"], "provider path must be continuous");
        if (step.expected_output_base !== next.expected_input_base)
          issue(
            ["steps", index + 1, "expected_input_base"],
            "expected base-unit bounds must be continuous",
          );
        if (step.minimum_output_base !== next.minimum_input_base)
          issue(
            ["steps", index + 1, "minimum_input_base"],
            "minimum base-unit bounds must be continuous",
          );
      }
    });

    if (
      feeSteps.length !== 1 ||
      feeSteps[0]?.index !== value.fee_collection_step_index ||
      value.steps[value.fee_collection_step_index]?.assetfare_fee_bps !== 1
    ) {
      issue(
        ["fee_collection_step_index"],
        "exactly one 1bp fee step must match the declared collection index",
      );
    }

    const usesExternalIntent = acrossSteps.length === 1;
    if (acrossSteps.length > 1)
      issue(["steps"], "the ordered path may contain at most one Across intent step");
    if (value.classification !== (usesExternalIntent ? "external_intent" : "direct_protocol_only"))
      issue(["classification"], "classification must match the ordered provider path");
    if (value.external_intent_protocol_used !== usesExternalIntent)
      issue(
        ["external_intent_protocol_used"],
        "external-intent flag must match the ordered provider path",
      );
    if (value.provider_internal_dex_aggregation_possible !== usesExternalIntent)
      issue(
        ["provider_internal_dex_aggregation_possible"],
        "provider-internal aggregation caveat must be true exactly for an Across intent path",
      );

    const expectedMode =
      fromChain === "polygon"
        ? "polygon_source_cctp"
        : fromChain === "optimism"
          ? "optimism_source_cctp"
          : fromChain === toChain
            ? value.steps.length === 1
              ? "same_chain_direct"
              : "same_chain_direct_composition"
            : toChain === "robinhood"
              ? "robinhood_across_ingress_composition"
              : fromChain === "robinhood"
                ? "robinhood_paxos_egress_composition"
                : "cctp_direct_composition";
    if (value.mode !== expectedMode) issue(["mode"], "mode must match the normalized route");
  });

/**
 * Capability metadata that advertises the mandatory per-quote summary contract.
 */
export const AssetFareDirectRouteSummaryCapabilitiesSchema = z
  .object({
    version: z.literal("assetfare-direct-route-summary-v1"),
    required_on_every_quote: z.literal(true),
    route_count: z.number().int().positive(),
    step_count: z.number().int().positive(),
    ordered_provider_path: z.literal(true),
    normalized_chain_asset_endpoints: z.literal(true),
    base_unit_amounts_are_decimal_strings: z.literal(true),
    assetfare_fee_step_bound: z.literal(true),
    classification_values: z.tuple([
      z.literal("direct_protocol_only"),
      z.literal("external_intent"),
    ]),
    route_aggregator_used_scope: z.literal("assetfare_engine_only"),
    external_intent: z
      .string()
      .refine(value => value.includes("Across") && value.includes("provider-internal"), {
        message: "must disclose the Across provider-internal liquidity caveat",
      }),
    server_signing: z.literal(false),
    server_submission: z.literal(false),
  })
  .strict();

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
