import { createConfig, getQuote, executeRoute, getRoutes } from '@lifi/sdk';

// Initialize LiFi SDK
createConfig({
  integrator: 'bound-mvp',
});

export interface LifiToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
  chainId: number;
}

export interface LifiQuoteResult {
  route: Awaited<ReturnType<typeof getRoutes>>['routes'][0];
  expectedOutput: string; // in token's smallest unit
  expectedOutputFormatted: string;
  toToken: LifiToken;
}

const ETH_ADDRESS = '0x0000000000000000000000000000000000000000';
const ETH_CHAIN_ID = 1;

/**
 * Fetch available tokens on Ethereum from LiFi.
 */
export async function fetchLifiTokens(): Promise<LifiToken[]> {
  const res = await fetch('https://li.quest/v1/tokens?chains=1');
  const data = await res.json();
  return (data.tokens?.['1'] ?? []) as LifiToken[];
}

/**
 * Get a LiFi quote for ETH → target token on mainnet.
 */
export async function getLifiQuote(
  toTokenAddress: string,
  ethAmountWei: string,
  fromAddress: string
): Promise<LifiQuoteResult> {
  const result = await getRoutes({
    fromChainId: ETH_CHAIN_ID,
    toChainId: ETH_CHAIN_ID,
    fromTokenAddress: ETH_ADDRESS,
    toTokenAddress,
    fromAmount: ethAmountWei,
    fromAddress,
    options: {
      slippage: 0.005, // 0.5%
      order: 'RECOMMENDED',
    },
  });

  if (!result.routes.length) {
    throw new Error('No routes available for this swap');
  }

  const route = result.routes[0];
  const toToken = route.toToken as LifiToken;
  const expectedOutput = route.toAmountMin;
  const expectedOutputFormatted = (
    Number(expectedOutput) /
    10 ** toToken.decimals
  ).toFixed(6);

  return { route, expectedOutput, expectedOutputFormatted, toToken };
}

/**
 * Execute a LiFi route. Requires a connected EVM signer.
 */
export async function executeLifiRoute(
  route: LifiQuoteResult['route'],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  signer: any
): Promise<void> {
  await executeRoute(route, {
    updateRouteHook: (updatedRoute) => {
      console.log('[LiFi] Route updated:', updatedRoute.id);
    },
  });
}

/**
 * Estimate gas for a route — returns true if it won't revert.
 */
export async function estimateGasForRoute(
  route: LifiQuoteResult['route']
): Promise<boolean> {
  try {
    // Check if first step has a transaction request we can estimate
    const step = route.steps[0];
    if (!step?.transactionRequest) return false;

    const { to, data, value } = step.transactionRequest;
    if (!to || !data) return false;

    // Use fetch to eth_estimateGas via public RPC
    const res = await fetch('https://eth.llamarpc.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_estimateGas',
        params: [{ to, data, value: value ?? '0x0' }],
        id: 1,
      }),
    });

    const json = await res.json();
    return !json.error;
  } catch {
    return false;
  }
}
