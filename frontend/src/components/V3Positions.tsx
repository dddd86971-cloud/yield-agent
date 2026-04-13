"use client";

import { useEffect, useState } from "react";
import { api, V3PositionsResponse, V3PoolState } from "@/lib/api";

const POOL_ADDRESS = "0x63d62734847E55A266FCa4219A9aD0a02D5F6e02";

/** Format tick → approximate price (USDT per WOKB) */
function tickToPrice(tick: number): number {
  // price = 1.0001^tick * 10^(dec0 - dec1) = 1.0001^tick * 10^(6-18)
  return Math.pow(1.0001, tick) * 1e-12;
}

/** Inverse: WOKB per USDT */
function priceToWokbPerUsdt(price: number): number {
  return price > 0 ? 1 / price : 0;
}

export function V3Positions() {
  const [data, setData] = useState<V3PositionsResponse | null>(null);
  const [pool, setPool] = useState<V3PoolState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const [posData, poolData] = await Promise.all([
          api.v3Positions(),
          api.v3Pool(POOL_ADDRESS),
        ]);
        if (active) {
          setData(posData);
          setPool(poolData);
          setError(null);
        }
      } catch (err: any) {
        if (active) setError(err.message);
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    const interval = setInterval(load, 30_000); // refresh every 30s
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  if (loading) {
    return (
      <div className="rounded-xl bg-white/5 border border-white/10 p-6 animate-pulse">
        <div className="h-5 bg-white/10 rounded w-1/3 mb-4" />
        <div className="h-20 bg-white/10 rounded" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl bg-white/5 border border-white/10 p-6">
        <h3 className="text-lg font-semibold text-white mb-2">V3 LP Positions</h3>
        <p className="text-white/40 text-sm">Unable to load: {error}</p>
      </div>
    );
  }

  const currentTick = pool?.currentTick ?? 0;
  const currentPrice = tickToPrice(currentTick);

  return (
    <div className="rounded-xl bg-white/5 border border-white/10 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">
          V3 LP Positions
          <span className="ml-2 text-xs font-mono text-accent bg-accent/10 px-2 py-0.5 rounded">
            REAL ON-CHAIN
          </span>
        </h3>
        <a
          href={`https://www.oklink.com/xlayer/address/${data?.agentAddress}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-accent hover:underline"
        >
          Agent: {data?.agentAddress?.slice(0, 8)}...
        </a>
      </div>

      {/* Pool Info */}
      {pool && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-white/5 rounded-lg p-3 text-center">
            <p className="text-[11px] text-white/40 uppercase">Pool</p>
            <p className="text-sm font-semibold text-white">USDT/WOKB 0.3%</p>
          </div>
          <div className="bg-white/5 rounded-lg p-3 text-center">
            <p className="text-[11px] text-white/40 uppercase">Current Tick</p>
            <p className="text-sm font-mono text-white">{currentTick}</p>
          </div>
          <div className="bg-white/5 rounded-lg p-3 text-center">
            <p className="text-[11px] text-white/40 uppercase">Price</p>
            <p className="text-sm font-mono text-white">
              {priceToWokbPerUsdt(currentPrice).toFixed(2)} USDT/OKB
            </p>
          </div>
        </div>
      )}

      {/* Positions — hide fully drained (liquidity=0, no fees) NFTs */}
      {(() => {
        const activePositions = data?.positions.filter(
          (p) => p.liquidity !== "0" || p.tokensOwed0 !== "0" || p.tokensOwed1 !== "0"
        ) ?? [];
        const closedCount = (data?.totalPositions ?? 0) - activePositions.length;

        if (activePositions.length === 0) {
          return (
            <div className="text-center py-6 text-white/30 text-sm">
              No active V3 LP positions. Deploy a strategy to mint one.
              {closedCount > 0 && (
                <span className="block mt-1 text-white/20 text-xs">
                  ({closedCount} closed position{closedCount > 1 ? "s" : ""} hidden)
                </span>
              )}
            </div>
          );
        }

        return (
          <div className="space-y-3">
            {activePositions.map((pos) => {
            const lowerPrice = priceToWokbPerUsdt(tickToPrice(pos.tickLower));
            const upperPrice = priceToWokbPerUsdt(tickToPrice(pos.tickUpper));
            const spotPrice = priceToWokbPerUsdt(currentPrice);

            const inRange = currentTick >= pos.tickLower && currentTick < pos.tickUpper;
            const rangeWidth = pos.tickUpper - pos.tickLower;

            // Visual range bar
            const vizMin = pos.tickLower - rangeWidth * 0.3;
            const vizMax = pos.tickUpper + rangeWidth * 0.3;
            const vizTotal = vizMax - vizMin;
            const barLeftPct = ((pos.tickLower - vizMin) / vizTotal) * 100;
            const barWidthPct = (rangeWidth / vizTotal) * 100;
            const spotPct = ((currentTick - vizMin) / vizTotal) * 100;

            return (
              <div
                key={pos.tokenId}
                className={`border rounded-lg p-4 ${
                  inRange
                    ? "border-green-500/30 bg-green-500/5"
                    : "border-orange-500/30 bg-orange-500/5"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-semibold">NFT #{pos.tokenId}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                        inRange
                          ? "bg-green-500/20 text-green-400"
                          : "bg-orange-500/20 text-orange-400"
                      }`}
                    >
                      {inRange ? "IN RANGE" : "OUT OF RANGE"}
                    </span>
                  </div>
                  <a
                    href={`https://www.oklink.com/xlayer/address/${data?.npmAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-accent hover:underline"
                  >
                    View on OKLink
                  </a>
                </div>

                {/* Range visualization */}
                <div className="relative h-6 bg-white/5 rounded-full mb-3 overflow-hidden">
                  {/* Range bar */}
                  <div
                    className={`absolute top-0 h-full rounded-full ${
                      inRange ? "bg-green-500/30" : "bg-orange-500/30"
                    }`}
                    style={{
                      left: `${barLeftPct}%`,
                      width: `${barWidthPct}%`,
                    }}
                  />
                  {/* Current price marker */}
                  <div
                    className="absolute top-0 h-full w-0.5 bg-white"
                    style={{ left: `${Math.min(Math.max(spotPct, 2), 98)}%` }}
                  />
                </div>

                {/* Stats */}
                <div className="grid grid-cols-4 gap-2 text-xs">
                  <div>
                    <span className="text-white/40">Lower</span>
                    <p className="text-white font-mono">{lowerPrice.toFixed(2)}</p>
                  </div>
                  <div>
                    <span className="text-white/40">Upper</span>
                    <p className="text-white font-mono">{upperPrice.toFixed(2)}</p>
                  </div>
                  <div>
                    <span className="text-white/40">Liquidity</span>
                    <p className="text-white font-mono">
                      {Number(BigInt(pos.liquidity) / 1_000_000n).toLocaleString()}M
                    </p>
                  </div>
                  <div>
                    <span className="text-white/40">Fees Owed</span>
                    <p className="text-white font-mono">
                      {pos.tokensOwed0 !== "0" || pos.tokensOwed1 !== "0"
                        ? `${pos.tokensOwed0}/${pos.tokensOwed1}`
                        : "Accruing..."}
                    </p>
                  </div>
                </div>
              </div>
            );
            })}
            {closedCount > 0 && (
              <div className="text-center text-white/20 text-xs mt-2">
                {closedCount} closed position{closedCount > 1 ? "s" : ""} hidden
              </div>
            )}
          </div>
        );
      })()}

      {/* NPM contract info */}
      <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-[10px] text-white/30">
        <span>NPM: {data?.npmAddress?.slice(0, 10)}...{data?.npmAddress?.slice(-8)}</span>
        <span>Total Supply: 951+ positions on X Layer</span>
      </div>
    </div>
  );
}
