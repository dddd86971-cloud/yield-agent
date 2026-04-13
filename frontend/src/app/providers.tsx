"use client";

import "@rainbow-me/rainbowkit/styles.css";
import {
  RainbowKitProvider,
  darkTheme,
  connectorsForWallets,
} from "@rainbow-me/rainbowkit";
import {
  okxWallet,
  metaMaskWallet,
  walletConnectWallet,
  coinbaseWallet,
  injectedWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { WagmiProvider, createConfig, http } from "wagmi";
import { defineChain } from "viem";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode } from "react";

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

const projectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID || "yieldagent_demo";

const connectors = connectorsForWallets(
  [
    {
      groupName: "Recommended",
      wallets: [okxWallet, metaMaskWallet, walletConnectWallet],
    },
    {
      groupName: "More",
      wallets: [coinbaseWallet, injectedWallet],
    },
  ],
  { appName: "YieldAgent", projectId }
);

const wagmiConfig = createConfig({
  chains: [xLayer],
  connectors,
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
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
