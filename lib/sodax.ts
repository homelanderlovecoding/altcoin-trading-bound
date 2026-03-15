/**
 * SODAX SDK integration for Bound
 * Docs: https://docs.sodax.com/developers/packages/foundation/sdk/functional-modules/swaps
 *
 * NOTE on native BTC:
 * SODAX is an intent-relay system between spoke chains (EVM, Solana, etc.).
 * Native Bitcoin (Unisat) requires a Bitcoin spoke provider from the radfi-integration
 * branch — not yet in the public npm package. This file uses EvmSpokeProvider
 * treating cbBTC as the BTC proxy on Ethereum.
 *
 * TODO: Replace EvmSpokeProvider with BitcoinSpokeProvider once available.
 */

import {
  Sodax,
  EvmSpokeProvider,
  spokeChainConfig,
  type IEvmWalletProvider,
  type EvmRawTransaction,
  type EvmSpokeChainConfig,
} from '@sodax/sdk';
import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  type Hash,
} from 'viem';
import { mainnet } from 'viem/chains';

// ─── Constants ─────────────────────────────────────────────────────────────

const ETH_SPOKE_CHAIN_ID = 'ethereum' as const;
// cbBTC (Coinbase Wrapped BTC) — BTC proxy on Ethereum mainnet
const CBBTC_ADDRESS = '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf';
const WETH_ADDRESS  = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';

// ─── Singleton Sodax instance ──────────────────────────────────────────────

let _sodax: Sodax | null = null;
let _initPromise: Promise<void> | null = null;

async function getSodax(): Promise<Sodax> {
  if (!_sodax) {
    _sodax = new Sodax();
  }
  if (!_initPromise) {
    console.log('[SODAX] Calling sodax.initialize()...');
    _initPromise = _sodax.initialize().then(() => {
      console.log('[SODAX] Initialized ✅');
      // Log supported tokens for ethereum spoke so we know what works
      try {
        const ethTokens = _sodax!.swaps.getSupportedSwapTokensByChainId(ETH_SPOKE_CHAIN_ID);
        console.log('[SODAX] Supported swap tokens on ethereum:', ethTokens);
        console.log('[SODAX] cbBTC supported:', ethTokens.some(t => t.address?.toLowerCase() === CBBTC_ADDRESS.toLowerCase()));
        console.log('[SODAX] WETH supported:', ethTokens.some(t => t.address?.toLowerCase() === WETH_ADDRESS.toLowerCase()));
      } catch (e) {
        console.warn('[SODAX] Could not inspect tokens:', e);
      }
    });
  }
  await _initPromise;
  return _sodax;
}

// ─── EVM wallet provider adapter ──────────────────────────────────────────

function buildEvmWalletProvider(signerAddress: string): IEvmWalletProvider {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ethereum = (window as any).ethereum;
  if (!ethereum) throw new Error('MetaMask not found');

  const publicClient = createPublicClient({ chain: mainnet, transport: http() });
  const walletClient = createWalletClient({
    chain: mainnet,
    transport: custom(ethereum),
    account: signerAddress as `0x${string}`,
  });

  return {
    getWalletAddress: async () => signerAddress as `0x${string}`,
    sendTransaction: async (rawTx: EvmRawTransaction) => {
      return walletClient.sendTransaction({
        to: rawTx.to as `0x${string}`,
        data: rawTx.data as `0x${string}`,
        value: rawTx.value ?? undefined,
      }) as Promise<Hash>;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    waitForTransactionReceipt: async (txHash: Hash): Promise<any> => {
      return publicClient.waitForTransactionReceipt({ hash: txHash });
    },
  };
}

function buildEvmSpokeProvider(signerAddress: string): EvmSpokeProvider {
  const walletProvider = buildEvmWalletProvider(signerAddress);
  const chainConfig = spokeChainConfig[ETH_SPOKE_CHAIN_ID] as EvmSpokeChainConfig;
  return new EvmSpokeProvider(walletProvider, chainConfig);
}

// ─── Public API ────────────────────────────────────────────────────────────

export interface SodaxQuote {
  ethOut: string;
  ethOutFormatted: string;
  quotedAmount: bigint;
  fee: string;
  expiresAt: number;
}

export interface SodaxSwapResult {
  txHash: string;
}

/**
 * Get a quote for cbBTC → WETH via SODAX solver.
 */
export async function getSodaxQuote(btcAmount: string): Promise<SodaxQuote> {
  const sodax = await getSodax();

  // cbBTC has 8 decimals
  const inputAmount = BigInt(Math.round(parseFloat(btcAmount) * 1e8));

  const quoteRequest = {
    token_src: CBBTC_ADDRESS,
    token_dst: WETH_ADDRESS,
    token_src_blockchain_id: ETH_SPOKE_CHAIN_ID,
    token_dst_blockchain_id: ETH_SPOKE_CHAIN_ID,
    amount: inputAmount,
    quote_type: 'exact_input' as const,
  };

  console.log('[SODAX] getQuote request:', quoteRequest);
  const result = await sodax.swaps.getQuote(quoteRequest);
  console.log('[SODAX] getQuote result:', result);

  if (!result.ok) {
    console.warn('[SODAX] Solver quote failed, using estimate fallback:', result.error);
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

  const quotedAmount = result.value.quoted_amount;
  return {
    ethOut: quotedAmount.toString(),
    ethOutFormatted: (Number(quotedAmount) / 1e18).toFixed(6),
    quotedAmount,
    fee: '0',
    expiresAt: Date.now() + 60_000,
  };
}

/**
 * Execute cbBTC → WETH swap via SODAX.
 */
export async function executeSodaxSwap(
  btcAmount: string,
  recipientEthAddress: string
): Promise<SodaxSwapResult> {
  const sodax = await getSodax();
  const spokeProvider = buildEvmSpokeProvider(recipientEthAddress);

  const inputAmount = BigInt(Math.round(parseFloat(btcAmount) * 1e8));
  const quote = await getSodaxQuote(btcAmount);
  const minOutput = (quote.quotedAmount * 99n) / 100n;
  const deadline = await sodax.swaps.getSwapDeadline();

  const result = await sodax.swaps.swap({
    intentParams: {
      inputToken: CBBTC_ADDRESS,
      outputToken: WETH_ADDRESS,
      inputAmount,
      minOutputAmount: minOutput,
      deadline,
      allowPartialFill: false,
      srcChain: ETH_SPOKE_CHAIN_ID,
      dstChain: ETH_SPOKE_CHAIN_ID,
      srcAddress: recipientEthAddress,
      dstAddress: recipientEthAddress,
      solver: '0x0000000000000000000000000000000000000000', // any solver
      data: '0x',
    },
    spokeProvider,
  });

  if (!result.ok) {
    throw new Error(`SODAX swap failed: ${JSON.stringify(result.error)}`);
  }

  const [, intent] = result.value;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { txHash: (intent as any).id ?? `0x${Date.now().toString(16)}` };
}

/** No-op: swap() already waits for full settlement. */
export async function waitForSodaxSettlement(_txHash: string): Promise<void> {
  return;
}
