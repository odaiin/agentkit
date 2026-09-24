import { assetfareActionProvider } from "./assetfareActionProvider";
import { AssetFareDirectRouteSummarySchema, GetQuoteSchema } from "./schemas";

describe("AssetFareActionProvider", () => {
  const fetchMock = jest.fn();
  global.fetch = fetchMock;

  const provider = assetfareActionProvider();

  const capabilities = {
    chains: ["arbitrum", "base", "optimism", "polygon", "robinhood", "solana"],
    asset_endpoints: [{ chain: "solana", token: "USDC" }],
    source_only_asset_endpoints: [{ chain: "polygon", token: "USDC" }],
    execution_implemented_routes: 76,
    currently_prepare_ready_routes: 76,
    temporarily_unavailable_routes: [],
    execution_availability: { status: "available", guarantees_future_availability: false },
    server_signing: false,
    server_submission: false,
    direct_route_summary: {
      version: "assetfare-direct-route-summary-v1",
      required_on_every_quote: true,
      route_count: 76,
      step_count: 168,
      ordered_provider_path: true,
      normalized_chain_asset_endpoints: true,
      base_unit_amounts_are_decimal_strings: true,
      assetfare_fee_step_bound: true,
      classification_values: ["direct_protocol_only", "external_intent"],
      route_aggregator_used_scope: "assetfare_engine_only",
      external_intent:
        "Across only for Robinhood ingress; provider-internal liquidity sourcing or aggregation remains possible",
      server_signing: false,
      server_submission: false,
    },
  };

  const directRouteSummary = {
    version: "assetfare-direct-route-summary-v1",
    route: "solana:USDC->base:USDC",
    from: "solana:USDC",
    to: "base:USDC",
    classification: "direct_protocol_only",
    mode: "cctp_direct_composition",
    route_aggregator_used: false,
    external_intent_protocol_used: false,
    provider_internal_dex_aggregation_possible: false,
    assetfare_fee_bps: 1,
    fee_collection_step_index: 0,
    server_signing: false,
    server_submission: false,
    step_count: 1,
    steps: [
      {
        index: 0,
        action: "bridge",
        provider: "circle_cctp",
        from: "solana:USDC",
        to: "base:USDC",
        expected_input_base: "250000000",
        minimum_input_base: "250000000",
        expected_output_base: "249895639",
        minimum_output_base: "249895318",
        assetfare_fee_bps: 1,
        direct_protocol: true,
        external_intent_protocol: false,
        aggregator_api_used: false,
      },
    ],
  };

  const quote = {
    quote_id: "00000000-0000-4000-8000-000000000001",
    as_of: "2026-01-01T00:00:00Z",
    ttl_seconds: 60,
    intent: { from: "solana:USDC", to: "base:USDC", amount_usd: 250 },
    offer: {
      expected_receive_usd: 249.895639,
      estimated_min_receive_usd: 249.895318,
      assetfare_fee_bps: 1,
      fee_collection_steps: [0],
    },
    cost_summary: {
      scope: "token_path_only_network_gas_excluded",
      input_value_usd: 250,
      expected_total_cost_usd: 0.104361,
      expected_total_cost_percent: 0.0417,
      assetfare_service_fee: { bps: 1, estimated_usd: 0.025 },
      unpriced_costs: ["source_chain_network_fee"],
      rankable_all_in: false,
    },
    eta: { estimated_time_range_seconds: [8, 20] },
    route: {
      route: "solana:USDC->base:USDC",
      mode: "cctp_direct_composition",
      steps: [
        {
          index: 0,
          kind: "direct_bridge",
          provider: "circle_cctp",
          route_fee_bps: 1,
        },
      ],
      aggregator_api_used: false,
      external_intent_protocol_used: false,
      server_signing: false,
      server_submission: false,
    },
    direct_route_summary: directRouteSummary,
    risk: {
      non_atomic: true,
      external_intent_protocol_used: false,
      provider_internal_dex_aggregation_possible: false,
      server_signing: false,
      server_submission: false,
    },
    execution: { supported: true, current_prepare_readiness: "available" },
  };

  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe("getCapabilities", () => {
    it("should return the live route surface when the API call succeeds", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => capabilities });

      const result = await provider.getCapabilities({});
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.implementedRoutes).toEqual(76);
      expect(parsed.currentlyPrepareReadyRoutes).toEqual(76);
      expect(parsed.serverSigning).toBe(false);
      expect(parsed.serverSubmission).toBe(false);
      expect(parsed.directRouteSummary).toMatchObject({
        version: "assetfare-direct-route-summary-v1",
        required_on_every_quote: true,
        route_count: 76,
        ordered_provider_path: true,
      });
      expect(parsed.evaluationGuidance).toMatchObject({
        routeMinimumUsd: 1,
        reachabilitySmokeUsd: 1,
        reachabilitySmokeOnly: true,
        nativeUsdcEconomicEvaluationStartUsd: 50,
        representativeEconomicEvaluationUsd: 1000,
        evidenceAsOf: "2026-09-23",
        notAMinimum: true,
        notGuaranteedBest: true,
        alwaysCompareFreshAtIntendedAmount: true,
      });
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.assetfare.dev/v2/capabilities",
        expect.objectContaining({
          headers: expect.objectContaining({ accept: "application/json" }),
        }),
      );
    });

    it("should fail closed when the service does not report a no-sign boundary", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ ...capabilities, server_signing: true }),
      });

      const result = await provider.getCapabilities({});

      expect(result).toContain("no-sign, no-submit boundary");
    });

    it("should fail closed when the mandatory summary contract is missing or incomplete", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ ...capabilities, direct_route_summary: undefined }),
      });

      const result = await provider.getCapabilities({});

      expect(result).toContain("mandatory direct_route_summary contract");
    });

    it("should handle API errors gracefully", async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });

      const result = await provider.getCapabilities({});

      expect(result).toContain("Error reading AssetFare capabilities");
      expect(result).toContain("HTTP 503");
    });

    it("should handle network errors", async () => {
      fetchMock.mockRejectedValue(new Error("Network error"));

      const result = await provider.getCapabilities({});

      expect(result).toContain("Error reading AssetFare capabilities");
      expect(result).toContain("Network error");
    });
  });

  describe("getQuote", () => {
    const args = {
      fromChain: "solana" as const,
      fromToken: "USDC" as const,
      toChain: "base" as const,
      toToken: "USDC" as const,
      amountUsd: 250,
    };

    it("should reject unsupported token/chain and source-only directions before network work", () => {
      expect(
        GetQuoteSchema.safeParse({ ...args, fromChain: "base", fromToken: "SOL" }).success,
      ).toBe(false);
      expect(GetQuoteSchema.safeParse({ ...args, amountUsd: 1000.01 }).success).toBe(true);
      expect(GetQuoteSchema.safeParse({ ...args, amountUsd: 1_000_000 }).success).toBe(true);
      expect(
        GetQuoteSchema.safeParse({ ...args, amountUsd: Number.POSITIVE_INFINITY }).success,
      ).toBe(false);
      expect(
        GetQuoteSchema.safeParse({
          ...args,
          fromChain: "optimism",
          fromToken: "USDC",
          toChain: "base",
          toToken: "USDC",
        }).success,
      ).toBe(true);
      expect(
        GetQuoteSchema.safeParse({
          ...args,
          fromChain: "base",
          fromToken: "USDC",
          toChain: "polygon",
          toToken: "USDC",
        }).success,
      ).toBe(false);
    });

    it("should return the quote with its full cost summary", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => quote });

      const result = await provider.getQuote(args);
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.quoteId).toEqual(quote.quote_id);
      expect(parsed.costSummary.expected_total_cost_usd).toEqual(0.104361);
      expect(parsed.costSummary.rankable_all_in).toBe(false);
      expect(parsed.ttlSeconds).toEqual(60);
      expect(parsed.directRouteSummary).toEqual(directRouteSummary);
      expect(parsed.directRouteSummary.steps[0]).toMatchObject({
        provider: "circle_cctp",
        from: "solana:USDC",
        to: "base:USDC",
        assetfare_fee_bps: 1,
      });
      expect(parsed.agentGuidance.evaluationGuidance).toMatchObject({
        routeMinimumUsd: 1,
        reachabilitySmokeOnly: true,
        nativeUsdcEconomicEvaluationStartUsd: 50,
        representativeEconomicEvaluationUsd: 1000,
        evidenceAsOf: "2026-09-23",
        notAMinimum: true,
        notGuaranteedBest: true,
        alwaysCompareFreshAtIntendedAmount: true,
      });
      expect(parsed.agentGuidance.transactionSigned).toBe(false);
      expect(parsed.agentGuidance.transactionSubmitted).toBe(false);
    });

    it("should post the route intent in the API's snake_case shape", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => quote });

      await provider.getQuote(args);

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toEqual("https://api.assetfare.dev/v2/quote");
      expect(init.method).toEqual("POST");
      expect(JSON.parse(init.body)).toEqual({
        from_chain: "solana",
        from_token: "USDC",
        to_chain: "base",
        to_token: "USDC",
        amount_usd: 250,
      });
    });

    it("should fail closed when the quote does not report a no-submit boundary", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ ...quote, risk: { ...quote.risk, server_submission: true } }),
      });

      const result = await provider.getQuote(args);

      expect(result).toContain("intent-bound direct_route_summary");
    });

    it("should fail closed when direct_route_summary is missing", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ ...quote, direct_route_summary: undefined }),
      });

      const result = await provider.getQuote(args);

      expect(result).toContain("intent-bound direct_route_summary");
    });

    it("should fail closed when direct_route_summary is not bound to the requested intent", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          ...quote,
          direct_route_summary: {
            ...directRouteSummary,
            from: "solana:SOL",
            route: "solana:SOL->base:USDC",
            steps: [
              {
                ...directRouteSummary.steps[0],
                from: "solana:SOL",
              },
            ],
          },
        }),
      });

      const result = await provider.getQuote(args);

      expect(result).toContain("intent-bound direct_route_summary");
    });

    it("should fail closed on summary extras, fee mismatches, and raw-provider mismatches", async () => {
      const hostileQuotes = [
        {
          ...quote,
          direct_route_summary: { ...directRouteSummary, private_key: "forbidden" },
        },
        {
          ...quote,
          direct_route_summary: { ...directRouteSummary, fee_collection_step_index: 1 },
        },
        {
          ...quote,
          route: {
            ...quote.route,
            steps: [{ ...quote.route.steps[0], provider: "across_intent_bridge" }],
          },
        },
      ];

      for (const hostileQuote of hostileQuotes) {
        fetchMock.mockResolvedValueOnce({ ok: true, json: async () => hostileQuote });
        const result = await provider.getQuote(args);
        expect(result).toContain("intent-bound direct_route_summary");
      }
    });

    it("should require the Across caveat exactly when an external-intent step is present", () => {
      const externalSummary = {
        ...directRouteSummary,
        route: "base:USDC->robinhood:USDG",
        from: "base:USDC",
        to: "robinhood:USDG",
        classification: "external_intent",
        mode: "robinhood_across_ingress_composition",
        external_intent_protocol_used: true,
        provider_internal_dex_aggregation_possible: true,
        steps: [
          {
            ...directRouteSummary.steps[0],
            provider: "across_intent_bridge",
            from: "base:USDC",
            to: "robinhood:USDG",
            direct_protocol: false,
            external_intent_protocol: true,
          },
        ],
      };

      expect(AssetFareDirectRouteSummarySchema.safeParse(externalSummary).success).toBe(true);
      expect(
        AssetFareDirectRouteSummarySchema.safeParse({
          ...externalSummary,
          provider_internal_dex_aggregation_possible: false,
        }).success,
      ).toBe(false);
    });

    it("should surface API error messages", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: "route_not_supported" }),
      });

      const result = await provider.getQuote(args);

      expect(result).toContain("Error requesting AssetFare quote");
      expect(result).toContain("route_not_supported");
    });
  });

  describe("supportsNetwork", () => {
    it("should return true for any network", () => {
      expect(provider.supportsNetwork()).toBe(true);
    });
  });
});
