import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

const PRIVATE_KEY = process.env.PRIVATE_KEY || "0x0000000000000000000000000000000000000000000000000000000000000001";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },
  networks: {
    hardhat: {
      forking: {
        url: process.env.XLAYER_RPC_URL || "https://rpc.xlayer.tech",
        enabled: false,
      },
    },
    xlayer: {
      // RPC is env-driven so we can switch to OKX's own endpoint
      // (https://xlayerrpc.okx.com) when okx.com's public RPC is healthier.
      // Default to the canonical public RPC.
      url: process.env.XLAYER_RPC_URL || "https://rpc.xlayer.tech",
      chainId: 196,
      accounts: [PRIVATE_KEY],
      gasPrice: 50000000, // 0.05 gwei
      // Hardhat's default HTTP timeout (40 s) is too tight for X Layer's
      // public RPCs during peak hours — bump to 120 s so deploy + permission
      // config txs don't bail mid-flow.
      timeout: 120_000,
    },
    xlayerTestnet: {
      url: process.env.XLAYER_TESTNET_RPC_URL || "https://testrpc.xlayer.tech",
      chainId: 1952,
      accounts: [PRIVATE_KEY],
      gasPrice: 50000000,
      timeout: 120_000,
    },
  },
  etherscan: {
    apiKey: {
      xlayer: process.env.OKLINK_API_KEY || "",
      xlayerTestnet: process.env.OKLINK_API_KEY || "",
    },
    customChains: [
      {
        network: "xlayer",
        chainId: 196,
        urls: {
          apiURL: "https://www.oklink.com/api/v5/explorer/contract/verify-source-code",
          browserURL: "https://www.oklink.com/xlayer",
        },
      },
      {
        network: "xlayerTestnet",
        chainId: 1952,
        urls: {
          apiURL: "https://www.oklink.com/api/v5/explorer/contract/verify-source-code",
          browserURL: "https://www.oklink.com/xlayer-test",
        },
      },
    ],
  },
};

export default config;
