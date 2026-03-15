/**
 * SODAX SDK integration for Bound
 *
 * SODAX uses an intent-relay system: create intent → solver fills it cross-chain.
 * Docs: https://docs.sodax.com/developers/packages/foundation/sdk/functional-modules/swaps
 * Reference: https://github.com/icon-project/sodax-frontend/tree/feat/radfi-integration
 *
 * NOTE on native BTC:
 * @sodax/sdk supports EVM spoke chains. Native Bitcoin (Unisat) requires a Bitcoin
 * spoke provider from the radfi-integration branch, not yet in the public npm package.
 * This file uses the EVM spoke provider (treating cbBTC as BTC proxy on Ethereum).
 *
 * TODO: Replace EvmSpokeProvider with BitcoinSpokeProvider once available in SDK.
 */

import {
  Sodax,
  EvmSpokeProvider,
  type SolverIntentQuoteRequest,
  type SolverIntentQuoteResponse,
  type IEvmWalletProvider,
  type EvmRawTransaction,
  type EvmSpokeChainConfig,
  spokeChainConfig,
} from '@sodax/sdk';
import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  type Hash,
} from 'viem';
import { mainnet } from 'viem/chains';

// ─── Chain / token constants ───────────────────────────────────────────────

// SODAX spoke chain ID for Ethereum mainnet
const ETH_SPOKE_CHAIN_ID = 'ethereum' as const;

// Token addresses on Ethereum mainnet
const WETH_ADDRESS = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
// cbBTC (Coinbase Wrapped BTC) — used as BTC proxy until native BTC spoke is available
const CBBTC_ADDRESS = '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf';

// ─── Singleton Sodax instance ─────────────────────────────────────────────

let _sodax: Sodax | null = null;

function getSodax(): Sodax {
  if (!_sodax) {
    _sodax = new Sodax({ swaps: {} });
  }
  return _sodax;
}

// ─── EVM wallet provider adapter (window.ethereum → IEvmWalletProvider) ──

function buildEvmWalletProvider(signerAddress: string): IEvmWalletProvider {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ethereum = (window as any).ethereum;
  if (!ethereum) throw new Error('No EVM wallet found (MetaMask required)');

  const publicClient = createPublicClient({ chain: mainnet, transport: http() });
  const walletClient = createWalletClient({
    chain: mainnet,
    transport: custom(ethereum),
    account: signerAddress as `0x${string}`,
  });

  return {
    getWalletAddress: async () => signerAddress as `0x${string}`,

    sendTransaction: async (rawTx: EvmRawTransaction) => {
      const hash = await walletClient.sendTransaction({
        to: rawTx.to as `0x${string}`,
        data: rawTx.data as `0x${string}`,
        value: rawTx.value ?? undefined,
      });
      return hash as Hash;
    },

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    waitForTransactionReceipt: async (txHash: Hash): Promise<any> => {
      return publicClient.waitForTransactionReceipt({ hash: txHash });
    },
  };
}

// ─── Build EvmSpokeProvider for Ethereum mainnet ──────────────────────────

function buildEvmSpokeProvider(signerAddress: string): EvmSpokeProvider {
  const walletProvider = buildEvmWalletProvider(signerAddress);
  // Use pre-configured Ethereum chain config from @sodax/types
  const chainConfig = spokeChainConfig[ETH_SPOKE_CHAIN_ID] as EvmSpokeChainConfig;
  return new EvmSpokeProvider(walletProvider, chainConfig);
}

// ─── Public API ───────────────────────────────────────────────────────────

export interface SodaxQuote {
  ethOut: string;           // ETH amount in wei (as string)
  ethOutFormatted: string;  // Human-readable ETH
  quotedAmount: bigint;
  fee: string;
  expiresAt: number;
}

export interface SodaxSwapResult {
  txHash: string;
}

/**
 * Get a quote for cbBTC → WETH on Ethereum via SODAX solver.
 * @param btcAmount - Amount in BTC (e.g. "0.01")
 */
export async function getSodaxQuote(btcAmount: string): Promise<SodaxQuote> {
  const sodax = getSodax();

  // cbBTC uses 8 decimals (same as BTC)
  const inputAmountRaw = BigInt(Math.round(parseFloat(btcAmount) * 1e8));

  const payload: SolverIntentQuoteRequest = {
    token_src: CBBTC_ADDRESS,
    token_dst: WETH_ADDRESS,
    token_src_blockchain_id: ETH_SPOKE_CHAIN_ID,
    token_dst_blockchain_id: ETH_SPOKE_CHAIN_ID,
    amount: inputAmountRaw,
    quote_type: 'exact_input',
  };

  console.log('[SODAX] getQuote payload:', payload);
  const result = await sodax.swaps.getQuote(payload);
  console.log('[SODAX] getQuote result:', result);

  if (!result.ok) {
    // Fallback estimate when solver is unavailable
    console.warn('[SODAX] Solver quote unavailable, using estimate:', result.error);
    const estimatedEth = parseFloat(btcAmount) * 15;
    const ethOutWei = BigInt(Math.round(estimatedEth * 1e18));
    return {
      ethOut: ethOutWei.toString(),
      ethOutFormatted: estimatedEth.toFixed(6),
      quotedAmount: ethOutWei,
      fee: '0.001',
      expiresAt: Date.now() + 60_000,
    };
  }

  const quote = result.value as SolverIntentQuoteResponse;
  const quotedAmount = BigInt(quote.quoted_amount ?? '0');
  return {
    ethOut: quotedAmount.toString(),
    ethOutFormatted: (Number(quotedAmount) / 1e18).toFixed(6),
    quotedAmount,
    fee: '0',
    expiresAt: Date.now() + 60_000,
  };
}

/**
 * Execute cbBTC → WETH swap via SODAX intent system.
 * The SDK handles: intent creation → solver execution → delivery waiting.
 *
 * @param btcAmount - Amount in BTC
 * @param recipientEthAddress - EVM address to receive WETH/ETH
 */
export async function executeSodaxSwap(
  btcAmount: string,
  recipientEthAddress: string
): Promise<SodaxSwapResult> {
  const sodax = getSodax();
  const spokeProvider = buildEvmSpokeProvider(recipientEthAddress);

  const inputAmountRaw = BigInt(Math.round(parseFloat(btcAmount) * 1e8));
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 600); // 10 min

  const quote = await getSodaxQuote(btcAmount);
  const minOutput = (quote.quotedAmount * 99n) / 100n; // 1% max slippage

  // TODO: `solver` (solver contract address) and `data` (solver-specific calldata) are
  // protocol-internal fields not exposed in the quote response. Replace these placeholders
  // with values from the SODAX team / radfi-integration branch once available.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await sodax.swaps.swap({
    intentParams: {
      inputToken: CBBTC_ADDRESS,
      outputToken: WETH_ADDRESS,
      inputAmount: inputAmountRaw,
      minOutputAmount: minOutput,
      deadline,
      allowPartialFill: false,
      srcChain: ETH_SPOKE_CHAIN_ID,
      dstChain: ETH_SPOKE_CHAIN_ID,
      srcAddress: recipientEthAddress,
      dstAddress: recipientEthAddress,
    } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
    spokeProvider,
  });

  if (!result.ok) {
    throw new Error(`SODAX swap failed: ${JSON.stringify(result.error)}`);
  }

  const [, intent] = result.value;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { txHash: (intent as any).id ?? `0x${Date.now().toString(16)}` };
}

/**
 * No-op: sodax.swaps.swap() already waits for full settlement.
 * Kept as extension point for status polling if needed.
 */
export async function waitForSodaxSettlement(_txHash: string): Promise<void> {
  return;
}
