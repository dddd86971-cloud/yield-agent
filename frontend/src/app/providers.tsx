"use client";

import "@rainbow-me/rainbowkit/styles.css";
import {
  RainbowKitProvider,
  darkTheme,
  getDefaultConfig,
} from "@rainbow-me/rainbowkit";
import { WagmiProvider, createConfig, http } from "wagmi";
import { defineChain } from "viem";
import { injected } from "wagmi/connectors";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode } from "react";
import { AgentStateProvider } from "@/lib/hooks";

// X Layer mainnet definition
export const xLayer = defineChain({
  id: 196,
  name: "X Layer",
  nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.xlayer.tech"] },
  },
  blockExplorers: {
    default: { name: "OKLink", url: "https://www.oklink.com/xlayer" },
  },
});

// Use wagmi native connectors — NO WalletConnect (requires paid project ID
// and crashes with "Connection interrupted while trying to subscribe").
// injected() auto-detects OKX Wallet, MetaMask, and any browser wallet.
const wagmiConfig = createConfig({
  chains: [xLayer],
  connectors: [injected()],
  transports: { [xLayer.id]: http() },
  ssr: true,
});

const queryClient = new QueryClient();

export function Providers({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: "#00ffa3",
            accentColorForeground: "#0a0a0f",
            borderRadius: "large",
          })}
        >
          <AgentStateProvider>{children}</AgentStateProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
