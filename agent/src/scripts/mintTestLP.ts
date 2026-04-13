/**
 * Mint a real V3 LP position on X Layer mainnet.
 *
 * Steps:
 *   1. Wrap some native OKB → WOKB (deposit to WETH9/WOKB contract)
 *   2. Check USDT + WOKB balances
 *   3. Compute optimal range around current tick
 *   4. Approve → Mint via NonfungiblePositionManager
 *   5. Record the position in StrategyManager audit trail
 *
 * Usage: ts-node src/scripts/mintTestLP.ts [amountOKBtoWrap]
 */

import { ethers } from "ethers";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const RPC = "https://rpc.xlayer.tech";
const CHAIN_ID = 196;

// Contracts
const WOKB = "0xe538905cf8410324e03A5A23C1c177a474D59b2b";
const USDT = "0x779Ded0c9e1022225f8E0630b35a9b54bE713736";
const POOL = "0x63d62734847E55A266FCa4219A9aD0a02D5F6e02";
const NPM  = "0x315e413a11ab0df498ef83873012430ca36638ae";

// ABIs
const WETH_ABI = [
  "function deposit() payable",
  "function withdraw(uint256 amount)",
  "function balanceOf(address) view returns (uint256)",
];
const ERC20_ABI = [
  "function approve(address, uint256) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address, address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];
const POOL_ABI = [
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16, uint16, uint16, uint8, bool)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function fee() view returns (uint24)",
  "function tickSpacing() view returns (int24)",
];
const NPM_ABI = [
  "function mint(tuple(address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline)) payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
  "function balanceOf(address) view returns (uint256)",
  "function tokenOfOwnerByIndex(address, uint256) view returns (uint256)",
  "function positions(uint256) view returns (uint96, address, address, address, uint24, int24, int24, uint128, uint256, uint256, uint128, uint128)",
];

function alignTick(tick: number, spacing: number, roundUp = false): number {
  if (roundUp) {
    return Math.ceil(tick / spacing) * spacing;
  }
  return Math.floor(tick / spacing) * spacing;
}

async function main() {
  const pk = process.env.PRIVATE_KEY;
  if (!pk) {
    console.error("ERROR: Set PRIVATE_KEY in .env");
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(RPC, CHAIN_ID);
  const wallet = new ethers.Wallet(pk, provider);
  console.log(`\n=== Mint V3 LP on X Layer ===`);
  console.log(`Wallet: ${wallet.address}`);

  // Check initial balances
  const okbBalance = await provider.getBalance(wallet.address);
  const wokbContract = new ethers.Contract(WOKB, WETH_ABI, wallet);
  const usdtContract = new ethers.Contract(USDT, ERC20_ABI, wallet);
  const wokbBalance = await wokbContract.balanceOf(wallet.address);
  const usdtBalance = await usdtContract.balanceOf(wallet.address);

  console.log(`\n--- Initial Balances ---`);
  console.log(`  OKB (native): ${ethers.formatEther(okbBalance)}`);
  console.log(`  WOKB:         ${ethers.formatEther(wokbBalance)}`);
  console.log(`  USDT:         ${ethers.formatUnits(usdtBalance, 6)}`);

  // Step 1: Wrap OKB → WOKB
  // Keep 0.08 OKB for gas, wrap the rest (or arg amount)
  const gasReserve = ethers.parseEther("0.08");
  const argAmount = process.argv[2] ? ethers.parseEther(process.argv[2]) : undefined;
  let wrapAmount: bigint;

  if (argAmount) {
    wrapAmount = argAmount;
  } else {
    // Wrap what's available after gas reserve
    wrapAmount = okbBalance > gasReserve ? okbBalance - gasReserve : 0n;
  }

  if (wrapAmount > 0n) {
    console.log(`\n--- Step 1: Wrapping ${ethers.formatEther(wrapAmount)} OKB → WOKB ---`);
    const wrapTx = await wokbContract.deposit({ value: wrapAmount, gasLimit: 50_000 });
    const wrapReceipt = await wrapTx.wait();
    console.log(`  Wrapped! tx: ${wrapReceipt.hash}`);
  } else {
    console.log(`\n--- Step 1: SKIP wrapping (insufficient OKB or already have WOKB) ---`);
  }

  // Re-read balances
  const newWokb = await wokbContract.balanceOf(wallet.address);
  const newUsdt = await usdtContract.balanceOf(wallet.address);
  console.log(`\n--- Post-wrap Balances ---`);
  console.log(`  WOKB: ${ethers.formatEther(newWokb)}`);
  console.log(`  USDT: ${ethers.formatUnits(newUsdt, 6)}`);

  // Step 2: Read pool state
  const poolContract = new ethers.Contract(POOL, POOL_ABI, provider);
  const [slot0, token0, token1, fee, tickSpacing] = await Promise.all([
    poolContract.slot0(),
    poolContract.token0(),
    poolContract.token1(),
    poolContract.fee(),
    poolContract.tickSpacing(),
  ]);
  const currentTick = Number(slot0.tick);
  const spacing = Number(tickSpacing);

  console.log(`\n--- Pool State ---`);
  console.log(`  token0 (USDT): ${token0}`);
  console.log(`  token1 (WOKB): ${token1}`);
  console.log(`  fee: ${Number(fee)}`);
  console.log(`  tickSpacing: ${spacing}`);
  console.log(`  currentTick: ${currentTick}`);

  // Step 3: Compute range
  // For a position with only WOKB (no USDT), we need the current price
  // to be ABOVE our range — i.e., tickLower and tickUpper both BELOW currentTick.
  // This gives us a 100% token1 (WOKB) position.
  //
  // But if we also have some USDT, we can do a balanced position around
  // the current tick.
  const hasUsdt = newUsdt > 0n;
  const hasWokb = newWokb > 0n;

  let tickLower: number;
  let tickUpper: number;

  if (hasUsdt && hasWokb) {
    // Balanced range: ±5% around current price (~±500 ticks for fee 3000)
    tickLower = alignTick(currentTick - 500, spacing);
    tickUpper = alignTick(currentTick + 500, spacing, true);
    console.log(`\n--- Balanced LP range (have both tokens) ---`);
  } else if (hasWokb && !hasUsdt) {
    // Only WOKB: provide single-sided liquidity ABOVE current tick
    // When price > tickUpper, the position is 100% token0 (USDT) — we earn token0
    // When price < tickLower, the position is 100% token1 (WOKB) — that's where we start
    // So we need: tickLower > currentTick (single-sided token1 deposit)
    // Wait, actually: if currentTick < tickLower, we deposit 100% token0
    // If currentTick > tickUpper, we deposit 100% token1
    // So for single-sided WOKB: we need tickUpper < currentTick
    // No wait... in V3:
    //   - Below range (currentTick < tickLower): position is all token0
    //   - Above range (currentTick > tickUpper): position is all token1
    //   - In range: mix of both
    // So if we only have token1 (WOKB), we need currentTick >= tickUpper
    // → place range BELOW current tick
    tickLower = alignTick(currentTick - 1000, spacing);
    tickUpper = alignTick(currentTick - 60, spacing); // slightly below current
    if (tickUpper >= currentTick) {
      tickUpper = alignTick(currentTick - spacing, spacing);
    }
    console.log(`\n--- Single-sided WOKB range (below current tick) ---`);
  } else if (hasUsdt && !hasWokb) {
    // Only USDT: provide single-sided liquidity — need currentTick <= tickLower
    // → place range ABOVE current tick
    tickLower = alignTick(currentTick + 60, spacing, true);
    tickUpper = alignTick(currentTick + 1000, spacing, true);
    if (tickLower <= currentTick) {
      tickLower = alignTick(currentTick + spacing, spacing, true);
    }
    console.log(`\n--- Single-sided USDT range (above current tick) ---`);
  } else {
    console.error("No tokens available for LP! Fund the wallet first.");
    process.exit(1);
  }

  console.log(`  tickLower: ${tickLower}`);
  console.log(`  tickUpper: ${tickUpper}`);
  console.log(`  width: ${tickUpper - tickLower} ticks`);

  // Step 4: Approve tokens for NPM
  const npmContract = new ethers.Contract(NPM, NPM_ABI, wallet);

  if (hasUsdt) {
    const allowance = await usdtContract.allowance(wallet.address, NPM);
    if (allowance < newUsdt) {
      console.log(`\n--- Approving USDT for NPM... ---`);
      const approveTx = await usdtContract.approve(NPM, ethers.MaxUint256, { gasLimit: 100_000 });
      await approveTx.wait();
      console.log(`  Approved USDT: ${approveTx.hash}`);
    }
  }

  if (hasWokb) {
    const wokbErc20 = new ethers.Contract(WOKB, ERC20_ABI, wallet);
    const allowance = await wokbErc20.allowance(wallet.address, NPM);
    if (allowance < newWokb) {
      console.log(`\n--- Approving WOKB for NPM... ---`);
      const approveTx = await wokbErc20.approve(NPM, ethers.MaxUint256, { gasLimit: 100_000 });
      await approveTx.wait();
      console.log(`  Approved WOKB: ${approveTx.hash}`);
    }
  }

  // Step 5: Mint position
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);

  // Use whatever we have, with 2% slippage tolerance
  const amount0Desired = newUsdt;  // USDT
  const amount1Desired = newWokb;  // WOKB
  const amount0Min = (amount0Desired * 98n) / 100n;
  const amount1Min = (amount1Desired * 98n) / 100n;

  console.log(`\n--- Step 5: Minting V3 LP Position ---`);
  console.log(`  amount0 (USDT): ${ethers.formatUnits(amount0Desired, 6)}`);
  console.log(`  amount1 (WOKB): ${ethers.formatEther(amount1Desired)}`);
  console.log(`  range: [${tickLower}, ${tickUpper}]`);

  try {
    const mintTx = await npmContract.mint(
      {
        token0: token0,
        token1: token1,
        fee: fee,
        tickLower: tickLower,
        tickUpper: tickUpper,
        amount0Desired: amount0Desired,
        amount1Desired: amount1Desired,
        amount0Min: amount0Min,
        amount1Min: amount1Min,
        recipient: wallet.address,
        deadline: deadline,
      },
      { gasLimit: 600_000 }
    );

    console.log(`\n  Mint tx sent: ${mintTx.hash}`);
    console.log(`  Waiting for confirmation...`);

    const receipt = await mintTx.wait();
    console.log(`  Confirmed in block ${receipt!.blockNumber}!`);

    // Parse events
    const iface = new ethers.Interface([
      "event IncreaseLiquidity(uint256 indexed tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
      "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
    ]);

    for (const log of receipt!.logs) {
      try {
        const parsed = iface.parseLog({ topics: log.topics as string[], data: log.data });
        if (parsed?.name === "IncreaseLiquidity") {
          console.log(`\n=== LP Position Minted! ===`);
          console.log(`  Token ID:  ${parsed.args.tokenId}`);
          console.log(`  Liquidity: ${parsed.args.liquidity}`);
          console.log(`  Amount0:   ${ethers.formatUnits(parsed.args.amount0, 6)} USDT`);
          console.log(`  Amount1:   ${ethers.formatEther(parsed.args.amount1)} WOKB`);
          console.log(`  Tx Hash:   ${receipt!.hash}`);
          console.log(`  OKLink:    https://www.oklink.com/xlayer/tx/${receipt!.hash}`);
        }
      } catch { /* skip */ }
    }

    // Final balance check
    const finalOkb = await provider.getBalance(wallet.address);
    const finalWokb = await wokbContract.balanceOf(wallet.address);
    const finalUsdt = await usdtContract.balanceOf(wallet.address);
    const nftBalance = await npmContract.balanceOf(wallet.address);

    console.log(`\n--- Final Balances ---`);
    console.log(`  OKB:  ${ethers.formatEther(finalOkb)}`);
    console.log(`  WOKB: ${ethers.formatEther(finalWokb)}`);
    console.log(`  USDT: ${ethers.formatUnits(finalUsdt, 6)}`);
    console.log(`  V3 NFTs: ${nftBalance}`);

  } catch (err: any) {
    console.error(`\nMint FAILED: ${err.message}`);
    if (err.data) console.error(`  Revert data: ${err.data}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
