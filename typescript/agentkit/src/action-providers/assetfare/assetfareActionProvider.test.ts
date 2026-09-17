import { AssetFareActionProvider } from "./assetfareActionProvider";
import { AssetFareQuoteSchema } from "./schemas";

const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("AssetFareActionProvider", () => {
  it("validates capped non-identity quote inputs", () => {
    expect(
      AssetFareQuoteSchema.safeParse({
        fromChain: "solana",
        fromToken: "SOL",
        toChain: "base",
        toToken: "USDC",
        amountUsd: 1,
      }).success,
    ).toBe(true);
    expect(
      AssetFareQuoteSchema.safeParse({
        fromChain: "solana",
        fromToken: "SOL",
        toChain: "base",
        toToken: "USDC",
        amountUsd: 0.99,
      }).success,
    ).toBe(false);
    expect(
      AssetFareQuoteSchema.safeParse({
        fromChain: "base",
        fromToken: "USDC",
        toChain: "base",
        toToken: "USDC",
        amountUsd: 300,
      }).success,
    ).toBe(false);
  });

  it("reads capabilities only when the public non-custodial boundary is active", async () => {
    const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/v2/capabilities")) {
        return response({
          public_api_enabled: true,
          server_signing: false,
          server_submission: false,
          directed_conversion_routes: 72,
        });
      }
      if (url.endsWith("/v2/status")) {
        return response({
          status: "capped_public_agent_release",
          server_signing: false,
          server_submission: false,
        });
      }
      return response({ error: "not_found" }, 404);
    });
    const provider = new AssetFareActionProvider({
      apiBaseUrl: "https://unit.test",
      fetch: fetchMock as typeof fetch,
    });
    const result = JSON.parse(await provider.getCapabilities({}));
    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("posts only the five public quote fields and creates no execution state", async () => {
    const fetchMock = jest.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
      response({
        status: "capped_public_agent_release",
        offer: {
          expected_receive_amount: 299,
          estimated_min_receive_amount: 294,
          output_symbol: "USDC",
        },
        risk: { non_atomic: true, server_signing: false, server_submission: false },
        execution: { supported: true },
        request_body: init?.body,
      }),
    );
    const provider = new AssetFareActionProvider({
      apiBaseUrl: "https://unit.test",
      fetch: fetchMock as typeof fetch,
    });
    const result = JSON.parse(
      await provider.quoteRoute({
        fromChain: "solana",
        fromToken: "SOL",
        toChain: "base",
        toToken: "USDC",
        amountUsd: 300,
      }),
    );
    const request = fetchMock.mock.calls[0];
    expect(String(request[0])).toBe("https://unit.test/v2/quote");
    expect(JSON.parse(String(request[1]?.body))).toEqual({
      from_chain: "solana",
      from_token: "SOL",
      to_chain: "base",
      to_token: "USDC",
      amount_usd: 300,
    });
    expect(result.success).toBe(true);
    expect(result.agent_guidance).toMatchObject({
      wallet_authentication_performed: false,
      session_created: false,
      action_prepared: false,
      transaction_signed: false,
      transaction_submitted: false,
    });
  });

  it("fails closed when the quote safety boundary changes", async () => {
    const provider = new AssetFareActionProvider({
      fetch: (async () =>
        response({
          status: "capped_public_agent_release",
          risk: { server_signing: true, server_submission: false },
          execution: { supported: true },
        })) as typeof fetch,
    });
    const result = JSON.parse(
      await provider.quoteRoute({
        fromChain: "solana",
        fromToken: "SOL",
        toChain: "base",
        toToken: "ETH",
        amountUsd: 300,
      }),
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain("outside the capped public safety boundary");
  });
});
