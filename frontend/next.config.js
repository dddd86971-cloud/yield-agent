/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    "@rainbow-me/rainbowkit",
    "@wagmi/core",
    "@wagmi/connectors",
    "wagmi",
    "@metamask/utils",
    "@metamask/rpc-errors",
    "@gemini-wallet/core",
  ],
  webpack: (config) => {
    config.resolve.fallback = { fs: false, net: false, tls: false };
    config.externals.push("pino-pretty", "lokijs", "encoding");
    return config;
  },
};

module.exports = nextConfig;
