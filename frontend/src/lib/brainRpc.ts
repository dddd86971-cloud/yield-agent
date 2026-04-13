/**
 * Direct on-chain brain data fetcher.
 *
 * Reads Uniswap V3 pool state directly from X Layer RPC — works on
 * Vercel without any backend. Used as a fallback when /api/brains/snapshot
 * is unreachable (i.e. backend is localhost-only).
 */

import { createPublicClient, http, parseAbi, formatUnits } from "viem";

const XLAYER_RPC = "https://rpc.xlayer.tech";
const POOL_ADDRESS = "0x63d62734847E55A266FCa4219A9aD0a02D5F6e02" as const; // USDT/OKB 0.3%
const Q96 = 2n ** 96n;

const poolAbi = parseAbi([
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
  "function liquidity() view returns (uint128)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function fee() view returns (uint24)",
]);

const erc20Abi = parseAbi([
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function balanceOf(address) view returns (uint256)",
]);

export interface BrainSnapshot {
  timestamp: number;
  market: {
    currentPrice: number;
    priceChange1h: number;
    volatility: number;
    marketState: string;
  };
  pool: {
    token0Symbol: string;
    token1Symbol: string;
    feeAPR: number;
    tvl: number;
    currentTick: number;
  };
  risk: null;
}

export async function fetchBrainDataFromRpc(): Promise<BrainSnapshot> {
  const client = createPublicClient({
    chain: {
      id: 196,
      name: "X Layer",
      nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
      rpcUrls: { default: { http: [XLAYER_RPC] } },
    },
    transport: http(XLAYER_RPC),
  });

  // Batch all reads in parallel
  const [slot0, liquidity, token0Addr, token1Addr, fee] = await Promise.all([
    client.readContract({ address: POOL_ADDRESS, abi: poolAbi, functionName: "slot0" }),
    client.readContract({ address: POOL_ADDRESS, abi: poolAbi, functionName: "liquidity" }),
    client.readContract({ address: POOL_ADDRESS, abi: poolAbi, functionName: "token0" }),
    client.readContract({ address: POOL_ADDRESS, abi: poolAbi, functionName: "token1" }),
    client.readContract({ address: POOL_ADDRESS, abi: poolAbi, functionName: "fee" }),
  ]);

  const sqrtPriceX96 = slot0[0] as bigint;
  const tick = Number(slot0[1]);

  // Get token info
  const [decimals0, decimals1, symbol0, symbol1, balance0, balance1] = await Promise.all([
    client.readContract({ address: token0Addr as `0x${string}`, abi: erc20Abi, functionName: "decimals" }),
    client.readContract({ address: token1Addr as `0x${string}`, abi: erc20Abi, functionName: "decimals" }),
    client.readContract({ address: token0Addr as `0x${string}`, abi: erc20Abi, functionName: "symbol" }),
    client.readContract({ address: token1Addr as `0x${string}`, abi: erc20Abi, functionName: "symbol" }),
    client.readContract({ address: token0Addr as `0x${string}`, abi: erc20Abi, functionName: "balanceOf", args: [POOL_ADDRESS] }),
    client.readContract({ address: token1Addr as `0x${string}`, abi: erc20Abi, functionName: "balanceOf", args: [POOL_ADDRESS] }),
  ]);

  // Price = (sqrtPriceX96 / 2^96)^2 * 10^(decimals0 - decimals1)
  const sqrtPrice = Number(sqrtPriceX96) / Number(Q96);
  const rawPrice = sqrtPrice * sqrtPrice;
  const currentPrice = rawPrice * 10 ** (Number(decimals0) - Number(decimals1));

  // TVL estimate: sum token balances in USD terms
  const tvl0Usd = Number(formatUnits(balance0 as bigint, Number(decimals0)));
  const tvl1Usd = Number(formatUnits(balance1 as bigint, Number(decimals1)));
  // token0 is typically the stablecoin (USDT), token1 is WOKB
  // tvl0 is in USDT terms, tvl1 needs price conversion
  const tvl = tvl0Usd + tvl1Usd * currentPrice;

  // Fee APR estimate: fee tier * liquidity utilization proxy
  // Simple estimate: (fee/1e6) * 365 * average daily volume / TVL
  // We use a conservative estimate based on fee tier
  const feeBps = Number(fee) / 10000; // e.g. 3000 -> 0.3%
  // Rough APR estimate based on typical V3 pool utilization
  const feeAPR = feeBps * 365 * 0.3; // conservative 30% daily utilization

  return {
    timestamp: Date.now(),
    market: {
      currentPrice,
      priceChange1h: 0,
      volatility: 0,
      marketState: "ranging",
    },
    pool: {
      token0Symbol: symbol0 as string,
      token1Symbol: symbol1 as string,
      feeAPR,
      tvl,
      currentTick: tick,
    },
    risk: null,
  };
}
