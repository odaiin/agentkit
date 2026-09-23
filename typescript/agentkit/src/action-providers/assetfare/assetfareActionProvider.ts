import { z } from "zod";
import { ActionProvider } from "../actionProvider";
import { CreateAction } from "../actionDecorator";
import { GetCapabilitiesSchema, GetQuoteSchema } from "./schemas";

/**
 * Base URL for the public AssetFare v2 API.
 */
export const ASSETFARE_BASE_URL = "https://api.assetfare.dev";

/**
 * Request timeout for AssetFare calls, in milliseconds.
 */
const REQUEST_TIMEOUT_MS = 45_000;

type JsonRecord = Record<string, unknown>;

/**
 * Configuration options for the AssetFare action provider.
 */
export interface AssetFareActionProviderConfig {
  /**
   * Base URL of the AssetFare API. Defaults to the public endpoint.
   */
  apiBaseUrl?: string;
}

/**
 * AssetFareActionProvider provides read-only cross-chain bridge and swap route quotes
 * from the AssetFare public v2 API. It never holds keys, authenticates a wallet, prepares
 * an unsigned action, signs, or submits a transaction.
 */
export class AssetFareActionProvider extends ActionProvider {
  private readonly apiBaseUrl: string;

  /**
   * Constructor for the AssetFareActionProvider class.
   *
   * @param config - Optional configuration, such as an alternate API base URL
   */
  constructor(config: AssetFareActionProviderConfig = {}) {
    super("assetfare", []);
    this.apiBaseUrl = (config.apiBaseUrl ?? ASSETFARE_BASE_URL).replace(/\/+$/, "");
  }

  /**
   * Reads the AssetFare capability surface and live route readiness.
   * Availability is dynamic, so this should be read before relying on a route.
   *
   * @param _args - Empty input
   * @returns A JSON string containing the supported routes and live readiness, or an error message
   */
  @CreateAction({
    name: "get_capabilities",
    description: `This tool reads the live AssetFare capability surface for non-custodial cross-chain bridge and swap routes.
It takes no inputs.

Important notes:
- Returns the supported chains and asset endpoints, the number of implemented directed routes, and how many are currently ready to prepare
- Route availability is live, not static: read this before treating any route as usable
- Fees: the AssetFare service fee is 1bp; Circle, provider, and network fees are additional and appear in each quote
- AssetFare never signs or submits a transaction; the caller verifies, signs, and submits every action with its own wallet
- This action is read-only and performs no wallet, signing, or submission operation`,
    schema: GetCapabilitiesSchema,
  })
  async getCapabilities(_args: z.infer<typeof GetCapabilitiesSchema>): Promise<string> {
    try {
      const capabilities = await this.request("/v2/capabilities");

      if (capabilities.server_signing !== false || capabilities.server_submission !== false) {
        return "Error reading AssetFare capabilities: the service did not report a non-custodial no-sign, no-submit boundary";
      }

      return JSON.stringify(
        {
          success: true,
          chains: capabilities.chains,
          assetEndpoints: capabilities.asset_endpoints,
          sourceOnlyAssetEndpoints: capabilities.source_only_asset_endpoints,
          implementedRoutes: capabilities.execution_implemented_routes,
          currentlyPrepareReadyRoutes: capabilities.currently_prepare_ready_routes,
          temporarilyUnavailableRoutes: capabilities.temporarily_unavailable_routes,
          executionAvailability: capabilities.execution_availability,
          serverSigning: capabilities.server_signing,
          serverSubmission: capabilities.server_submission,
          feeNote:
            "AssetFare service fee is 1bp; Circle, provider, and network fees are additional. Each quote exposes the total token-path cost and live availability.",
        },
        null,
        2,
      );
    } catch (error: unknown) {
      return `Error reading AssetFare capabilities: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /**
   * Requests one fresh AssetFare route quote and returns its cost, timing, and risk fields.
   *
   * @param args - The route and USD notional to quote
   * @returns A JSON string containing the quote, or an error message
   */
  @CreateAction({
    name: "get_quote",
    description: `This tool requests one fresh, read-only AssetFare quote for a non-custodial cross-chain bridge or swap route, for example Solana USDC to Base USDC.
It takes the following inputs:
- The source chain and asset symbol
- The destination chain and asset symbol
- The USD notional, from 1 through 1000

Important notes:
- Judge the route by the quote's total token-path cost and expected or minimum receive, never by the 1bp service fee alone: Circle, provider, and network fees are additional
- The quote reports which costs are unpriced (for example source-chain gas), so it is not an all-in ranking figure
- Quotes are short-lived (ttl_seconds) and routes are non-atomic multi-step workflows
- Treat AssetFare as one candidate and compare the returned totals against other fresh executable routes before choosing
- This action is read-only: it never authenticates a wallet, prepares an unsigned action, signs, or submits. Any later preparation requires explicit caller approval outside this provider
- Never send a private key or seed phrase to any route service`,
    schema: GetQuoteSchema,
  })
  async getQuote(args: z.infer<typeof GetQuoteSchema>): Promise<string> {
    try {
      const quote = await this.request("/v2/quote", {
        method: "POST",
        body: JSON.stringify({
          from_chain: args.fromChain,
          from_token: args.fromToken,
          to_chain: args.toChain,
          to_token: args.toToken,
          amount_usd: args.amountUsd,
        }),
      });

      const risk = quote.risk as JsonRecord | undefined;
      const execution = quote.execution as JsonRecord | undefined;
      const costSummary = quote.cost_summary as JsonRecord | undefined;

      if (
        risk?.server_signing !== false ||
        risk?.server_submission !== false ||
        execution?.supported !== true ||
        !costSummary ||
        costSummary.scope !== "token_path_only_network_gas_excluded" ||
        typeof quote.ttl_seconds !== "number" ||
        quote.ttl_seconds <= 0 ||
        quote.ttl_seconds > 60
      ) {
        return "Error requesting AssetFare quote: the quote did not report a non-custodial no-sign, no-submit boundary";
      }

      return JSON.stringify(
        {
          success: true,
          quoteId: quote.quote_id,
          asOf: quote.as_of,
          ttlSeconds: quote.ttl_seconds,
          intent: quote.intent,
          offer: quote.offer,
          costSummary: quote.cost_summary,
          eta: quote.eta,
          risk: quote.risk,
          execution: quote.execution,
          agentGuidance: {
            compareWithOtherRoutes: true,
            requireFreshQuoteBeforeSelection: true,
            walletAuthenticationPerformed: false,
            actionPrepared: false,
            transactionSigned: false,
            transactionSubmitted: false,
          },
        },
        null,
        2,
      );
    } catch (error: unknown) {
      return `Error requesting AssetFare quote: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /**
   * Checks if the AssetFare action provider supports the given network.
   * AssetFare quotes are read from a public API and are not bound to the agent's wallet network.
   *
   * @returns True, as AssetFare quote actions are available on all networks.
   */
  supportsNetwork(): boolean {
    return true;
  }

  /**
   * Performs a JSON request against the AssetFare API.
   *
   * @param path - API path beginning with a slash
   * @param init - Optional fetch options
   * @returns The parsed JSON body
   */
  private async request(path: string, init?: RequestInit): Promise<JsonRecord> {
    const response = await fetch(`${this.apiBaseUrl}${path}`, {
      ...init,
      headers: {
        accept: "application/json",
        ...(init?.body ? { "content-type": "application/json" } : {}),
        ...(init?.headers ?? {}),
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const body = (await response.json()) as JsonRecord;

    if (!response.ok) {
      const message = body.error ?? body.message ?? `HTTP ${response.status}`;
      throw new Error(String(message));
    }

    return body;
  }
}

/**
 * Creates a new instance of the AssetFare action provider.
 *
 * @param config - Optional configuration, such as an alternate API base URL
 * @returns A new AssetFareActionProvider instance
 */
export const assetfareActionProvider = (config: AssetFareActionProviderConfig = {}) =>
  new AssetFareActionProvider(config);
