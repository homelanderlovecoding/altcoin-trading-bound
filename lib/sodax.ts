/**
 * SODAX SDK wrapper
 * TODO: Replace stubs with real @sodax/sdk once integrated.
 * Reference: https://github.com/icon-project/sodax-frontend/tree/feat/radfi-integration
 */

export interface SodaxQuote {
  ethOut: string; // ETH amount in wei
  ethOutFormatted: string; // Human-readable ETH
  fee: string;
  expiresAt: number;
}

export interface SodaxSwapResult {
  txHash: string;
}

/**
 * Get a quote for BTC → ETH swap via SODAX.
 * @param btcAmount - Amount in BTC (e.g. "0.01")
 */
export async function getSodaxQuote(btcAmount: string): Promise<SodaxQuote> {
  // TODO: Replace with real SODAX SDK call
  // import { SodaxSDK } from '@sodax/sdk'
  // const sdk = new SodaxSDK({ ... })
  // return sdk.getQuote({ from: 'BTC', to: 'ETH', amount: btcAmount })

  // Stub: simulate ~15 ETH per BTC at current rough rates
  const btc = parseFloat(btcAmount);
  const ethOut = (btc * 15).toFixed(6);
  const ethOutWei = BigInt(Math.floor(btc * 15 * 1e18)).toString();

  return {
    ethOut: ethOutWei,
    ethOutFormatted: ethOut,
    fee: '0.001',
    expiresAt: Date.now() + 60_000,
  };
}

/**
 * Execute the BTC → ETH swap via SODAX.
 * SODAX SDK handles the full BTC wallet signing flow (Unisat).
 * @param btcAmount - Amount in BTC
 * @param recipientEthAddress - User's EVM address to receive ETH
 */
export async function executeSodaxSwap(
  btcAmount: string,
  recipientEthAddress: string
): Promise<SodaxSwapResult> {
  // TODO: Replace with real SODAX SDK call
  // const sdk = new SodaxSDK({ ... })
  // return sdk.executeSwap({ from: 'BTC', to: 'ETH', amount: btcAmount, recipient: recipientEthAddress })

  console.log(`[SODAX STUB] Executing BTC → ETH: ${btcAmount} BTC → ${recipientEthAddress}`);

  // Simulate a delay for the BTC signing flow
  await new Promise((r) => setTimeout(r, 2000));

  return {
    txHash: '0xSTUB_SODAX_TX_' + Date.now(),
  };
}

/**
 * Poll until SODAX confirms settlement (BTC finality + ETH delivery).
 * @param txHash - Transaction hash from executeSodaxSwap
 */
export async function waitForSodaxSettlement(txHash: string): Promise<void> {
  // TODO: Replace with real SODAX SDK polling
  // const sdk = new SodaxSDK({ ... })
  // await sdk.waitForSettlement(txHash)

  console.log(`[SODAX STUB] Waiting for settlement of ${txHash}...`);

  // Simulate ~3s settlement for stub
  await new Promise((r) => setTimeout(r, 3000));

  console.log(`[SODAX STUB] Settlement confirmed for ${txHash}`);
}
