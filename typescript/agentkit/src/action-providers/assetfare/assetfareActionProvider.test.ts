import { assetfareActionProvider } from "./assetfareActionProvider";
import { GetQuoteSchema } from "./schemas";

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
  };

  const quote = {
    quote_id: "00000000-0000-4000-8000-000000000001",
    as_of: "2026-01-01T00:00:00Z",
    ttl_seconds: 60,
    intent: { from: "solana:USDC", to: "base:USDC", amount_usd: 250 },
    offer: { expected_receive_usd: 249.895639, estimated_min_receive_usd: 249.895318 },
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
    risk: { non_atomic: true, server_signing: false, server_submission: false },
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

      expect(result).toContain("no-sign, no-submit boundary");
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
