import { z } from "zod";
import { ActionProvider } from "../actionProvider";
import { CreateAction } from "../actionDecorator";
import { Network } from "../../network";
import { AssetFareQuoteSchema } from "./schemas";

const EmptySchema = z.object({}).strict();

type Fetch = typeof fetch;
type JsonRecord = Record<string, unknown>;

/** Configuration for the read-only AssetFare action provider. */
export interface AssetFareActionProviderConfig {
  /** Override only for tests or self-hosted compatible APIs. */
  apiBaseUrl?: string;
  /** Injectable fetch implementation for tests. */
  fetch?: Fetch;
}

/**
 * Read-only AssetFare quote actions.
 *
 * This provider never authenticates a wallet, creates a session, prepares an
 * action, signs, submits, funds, swaps, or bridges.
 */
export class AssetFareActionProvider extends ActionProvider {
  private readonly apiBaseUrl: string;
  private readonly fetchFn: Fetch;

  /**
   * Constructs a read-only AssetFare action provider.
   *
   * @param config - Optional API base URL and fetch implementation.
   */
  constructor(config: AssetFareActionProviderConfig = {}) {
    super("assetfare", []);
    this.apiBaseUrl = (config.apiBaseUrl ?? "https://api.assetfare.dev").replace(/\/$/, "");
    this.fetchFn = config.fetch ?? fetch;
  }

  /**
   * Reads the current AssetFare route scope and safety boundary.
   *
   * @param _args - Empty action input.
   * @returns A JSON string with capabilities and provider status.
   */
  @CreateAction({
    name: "get_capabilities",
    description: `Read AssetFare's current public four-chain route scope and safety boundary.

Use this before requesting a quote. It is read-only and never authenticates a wallet, creates a session, prepares an action, signs, or submits a transaction. AssetFare must remain one candidate rather than an automatically preferred route.`,
    schema: EmptySchema,
  })
  async getCapabilities(_args: z.infer<typeof EmptySchema>): Promise<string> {
    try {
      const [capabilities, status] = await Promise.all([
        this.request("/v2/capabilities"),
        this.request("/v2/status"),
      ]);
      if (
        capabilities.public_api_enabled !== true ||
        capabilities.server_signing !== false ||
        capabilities.server_submission !== false ||
        status.status !== "capped_public_agent_release" ||
        status.server_signing !== false ||
        status.server_submission !== false
      ) {
        throw new Error("AssetFare public safety boundary is not ready");
      }
      return JSON.stringify({ success: true, capabilities, status });
    } catch (error) {
      return JSON.stringify({ success: false, error: String(error) });
    }
  }

  /**
   * Requests a fresh read-only AssetFare route quote.
   *
   * @param args - Source, destination, assets, and USD amount.
   * @returns A JSON string containing the quote and explicit safety guidance.
   */
  @CreateAction({
    name: "quote_route",
    description: `Request one fresh, fee-inclusive AssetFare REST v2 quote across Solana, Base, Arbitrum, or Robinhood Chain.

This action is read-only: it does not authenticate a wallet, create a session, prepare an unsigned action, sign, submit, fund, swap, or bridge. Compare expected receive, conservative minimum receive, fees, ETA, step count, and non-atomic risk against other fresh executable routes. Never select AssetFare solely because this action is installed. Require explicit caller approval before any later preparation or execution flow.`,
    schema: AssetFareQuoteSchema,
  })
  async quoteRoute(args: z.infer<typeof AssetFareQuoteSchema>): Promise<string> {
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
      const execution = quote.execution as JsonRecord | undefined;
      const risk = quote.risk as JsonRecord | undefined;
      if (
        quote.status !== "capped_public_agent_release" ||
        execution?.supported !== true ||
        risk?.server_signing !== false ||
        risk?.server_submission !== false
      ) {
        throw new Error("AssetFare quote is outside the capped public safety boundary");
      }
      return JSON.stringify({
        success: true,
        quote,
        agent_guidance: {
          compare_with_other_routes: true,
          require_fresh_quote_before_selection: true,
          wallet_authentication_performed: false,
          session_created: false,
          action_prepared: false,
          transaction_signed: false,
          transaction_submitted: false,
        },
      });
    } catch (error) {
      return JSON.stringify({ success: false, error: String(error) });
    }
  }

  /**
   * AssetFare route discovery is network-agnostic.
   *
   * @param _network - The AgentKit wallet network.
   * @returns True for all networks because the requested route carries its own chain fields.
   */
  supportsNetwork = (_network: Network) => true;

  /**
   * Sends one JSON request to the configured AssetFare API.
   *
   * @param path - Absolute API path.
   * @param init - Optional fetch request options.
   * @returns The parsed JSON response.
   */
  private async request(path: string, init?: RequestInit): Promise<JsonRecord> {
    const response = await this.fetchFn(`${this.apiBaseUrl}${path}`, {
      ...init,
      headers: {
        accept: "application/json",
        ...(init?.body ? { "content-type": "application/json" } : {}),
        ...(init?.headers ?? {}),
      },
      signal: AbortSignal.timeout(20_000),
    });
    const body = (await response.json()) as JsonRecord;
    if (!response.ok) {
      const message = body.error ?? body.message ?? `HTTP ${response.status}`;
      throw new Error(`AssetFare request failed: ${String(message)}`);
    }
    return body;
  }
}

/**
 * Creates a read-only AssetFare action provider.
 *
 * @param config - Optional API base URL and fetch implementation.
 * @returns A configured AssetFare action provider.
 */
export const assetfareActionProvider = (config: AssetFareActionProviderConfig = {}) =>
  new AssetFareActionProvider(config);
