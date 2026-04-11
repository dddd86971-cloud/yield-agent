import { expect } from "chai";
import { ethers } from "hardhat";
import { StrategyManager, DecisionLogger } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

/**
 * StrategyManager integration tests
 * =================================
 *
 * StrategyManager is the on-chain audit surface the off-chain agent writes
 * to on every meaningful action. These tests exercise the full glue chain
 * StrategyManager → DecisionLogger so the judge-verifiable claim "every
 * DEPLOY / REBALANCE / HOLD / COMPOUND / EMERGENCY_EXIT emits a logged
 * decision with reasoning" is mechanically enforced.
 *
 * We deploy the real DecisionLogger (not a mock) and authorize the
 * StrategyManager on it exactly the way the production deploy script
 * does in `scripts/deploy.ts`. That way a passing test suite here proves
 * the production wiring is valid.
 */

const ActionType = {
  DEPLOY: 0,
  REBALANCE: 1,
  COMPOUND: 2,
  EMERGENCY_EXIT: 3,
  HOLD: 4,
} as const;

const RiskProfile = {
  CONSERVATIVE: 0,
  MODERATE: 1,
  AGGRESSIVE: 2,
} as const;

// Realistic tick range for a 0.3% USDT-OKB pool
const TICK_LOWER = -6000;
const TICK_UPPER = 6000;

const buildPositions = (tickLower = TICK_LOWER, tickUpper = TICK_UPPER) => [
  {
    tickLower,
    tickUpper,
    amount0Desired: ethers.parseUnits("2500", 6),
    amount1Desired: ethers.parseUnits("25", 18),
  },
];

describe("StrategyManager", () => {
  let logger: DecisionLogger;
  let manager: StrategyManager;
  let owner: SignerWithAddress;
  let agent: SignerWithAddress;
  let otherAgent: SignerWithAddress;
  let stranger: SignerWithAddress;
  let mockToken0: string;
  let mockToken1: string;
  let mockPool: string;

  beforeEach(async () => {
    [owner, agent, otherAgent, stranger] = await ethers.getSigners();

    const DecisionLoggerFactory = await ethers.getContractFactory("DecisionLogger");
    logger = (await DecisionLoggerFactory.deploy()) as unknown as DecisionLogger;
    await logger.waitForDeployment();
    const loggerAddr = await logger.getAddress();

    const StrategyManagerFactory = await ethers.getContractFactory("StrategyManager");
    manager = (await StrategyManagerFactory.deploy(loggerAddr)) as unknown as StrategyManager;
    await manager.waitForDeployment();
    const managerAddr = await manager.getAddress();

    // Production wiring: authorize StrategyManager on DecisionLogger,
    // then whitelist the agent on StrategyManager. Mirrors deploy.ts.
    await logger.connect(owner).setAuthorized(managerAddr, true);
    await manager.connect(owner).setAgent(agent.address, true);

    // Deterministic placeholder token + pool addresses. StrategyManager
    // is chain-agnostic so it never inspects these.
    mockToken0 = ethers.getAddress("0x1111111111111111111111111111111111111111");
    mockToken1 = ethers.getAddress("0x2222222222222222222222222222222222222222");
    mockPool = ethers.getAddress("0x3333333333333333333333333333333333333333");
  });

  describe("constructor + admin", () => {
    it("sets owner and fee recipient to deployer", async () => {
      expect(await manager.owner()).to.equal(owner.address);
      expect(await manager.feeRecipient()).to.equal(owner.address);
    });

    it("defaults performance fee to 10%", async () => {
      expect(await manager.performanceFeeBps()).to.equal(1000);
    });

    it("rejects zero logger in constructor", async () => {
      const SM = await ethers.getContractFactory("StrategyManager");
      await expect(SM.deploy(ethers.ZeroAddress)).to.be.revertedWith("Zero logger");
    });

    it("setAgent rejects non-owner", async () => {
      await expect(
        manager.connect(stranger).setAgent(stranger.address, true),
      ).to.be.revertedWith("Not owner");
    });

    it("setPerformanceFeeBps rejects > 30%", async () => {
      await expect(
        manager.connect(owner).setPerformanceFeeBps(3001),
      ).to.be.revertedWith("Fee too high");
    });

    it("setAgent + isAgent round-trip works", async () => {
      expect(await manager.isAgent(otherAgent.address)).to.equal(false);
      await manager.connect(owner).setAgent(otherAgent.address, true);
      expect(await manager.isAgent(otherAgent.address)).to.equal(true);
    });
  });

  describe("deployStrategy", () => {
    it("creates strategy 0 and logs DEPLOY decision", async () => {
      const positions = buildPositions();
      const thesis = "three-brain conservative USDT/OKB 0.3%";

      await expect(
        manager
          .connect(agent)
          .deployStrategy(
            mockPool,
            mockToken0,
            mockToken1,
            3000,
            positions,
            RiskProfile.CONSERVATIVE,
            thesis,
          ),
      )
        .to.emit(manager, "StrategyDeployed")
        .withArgs(
          0,
          agent.address,
          agent.address,
          mockPool,
          RiskProfile.CONSERVATIVE,
        );

      expect(await manager.nextStrategyId()).to.equal(1);

      const strategy = await manager.getStrategy(0);
      expect(strategy.agent).to.equal(agent.address);
      expect(strategy.owner).to.equal(agent.address);
      expect(strategy.pool).to.equal(mockPool);
      expect(strategy.token0).to.equal(mockToken0);
      expect(strategy.token1).to.equal(mockToken1);
      expect(strategy.fee).to.equal(3000);
      expect(strategy.active).to.equal(true);
      expect(strategy.riskProfile).to.equal(RiskProfile.CONSERVATIVE);
      expect(strategy.totalDeposited).to.equal(
        ethers.parseUnits("2500", 6) + ethers.parseUnits("25", 18),
      );

      // Decision log anchor
      expect(await logger.getDecisionCount(0)).to.equal(1);
      const latest = await logger.getLatestDecision(0);
      expect(latest.action).to.equal(ActionType.DEPLOY);
      expect(latest.reasoning).to.equal(thesis);
      expect(latest.confidence).to.equal(100);
      expect(latest.newTickLower).to.equal(TICK_LOWER);
      expect(latest.newTickUpper).to.equal(TICK_UPPER);
    });

    it("rejects call from non-agent", async () => {
      await expect(
        manager
          .connect(stranger)
          .deployStrategy(
            mockPool,
            mockToken0,
            mockToken1,
            3000,
            buildPositions(),
            RiskProfile.CONSERVATIVE,
            "thesis",
          ),
      ).to.be.revertedWith("Not authorized agent");
    });

    it("rejects same token", async () => {
      await expect(
        manager
          .connect(agent)
          .deployStrategy(
            mockPool,
            mockToken0,
            mockToken0,
            3000,
            buildPositions(),
            RiskProfile.MODERATE,
            "same token",
          ),
      ).to.be.revertedWith("Same token");
    });

    it("rejects empty thesis", async () => {
      await expect(
        manager
          .connect(agent)
          .deployStrategy(
            mockPool,
            mockToken0,
            mockToken1,
            3000,
            buildPositions(),
            RiskProfile.MODERATE,
            "",
          ),
      ).to.be.revertedWith("Thesis required");
    });

    it("rejects invalid tick range", async () => {
      const bad = [
        {
          tickLower: 1000,
          tickUpper: 1000,
          amount0Desired: 1n,
          amount1Desired: 1n,
        },
      ];
      await expect(
        manager
          .connect(agent)
          .deployStrategy(
            mockPool,
            mockToken0,
            mockToken1,
            3000,
            bad,
            RiskProfile.MODERATE,
            "thesis",
          ),
      ).to.be.revertedWith("Invalid tick range");
    });

    it("rejects empty positions array", async () => {
      await expect(
        manager
          .connect(agent)
          .deployStrategy(
            mockPool,
            mockToken0,
            mockToken1,
            3000,
            [],
            RiskProfile.MODERATE,
            "thesis",
          ),
      ).to.be.revertedWith("1-5 positions");
    });

    it("rejects > 5 positions", async () => {
      const six = Array.from({ length: 6 }, (_, i) => ({
        tickLower: -1000 - i * 10,
        tickUpper: 1000 + i * 10,
        amount0Desired: 1n,
        amount1Desired: 1n,
      }));
      await expect(
        manager
          .connect(agent)
          .deployStrategy(
            mockPool,
            mockToken0,
            mockToken1,
            3000,
            six,
            RiskProfile.MODERATE,
            "thesis",
          ),
      ).to.be.revertedWith("1-5 positions");
    });
  });

  describe("rebalance", () => {
    beforeEach(async () => {
      await manager
        .connect(agent)
        .deployStrategy(
          mockPool,
          mockToken0,
          mockToken1,
          3000,
          buildPositions(),
          RiskProfile.CONSERVATIVE,
          "initial",
        );
    });

    it("emits StrategyRebalanced + logs REBALANCE decision", async () => {
      const newPositions = buildPositions(-4000, 4000);
      const reasoning = "tighten band on low vol";

      await expect(
        manager.connect(agent).rebalance(0, newPositions, reasoning, 85),
      )
        .to.emit(manager, "StrategyRebalanced")
        .withArgs(0, -4000, 4000, 85);

      // Decision log now has DEPLOY + REBALANCE
      expect(await logger.getDecisionCount(0)).to.equal(2);
      const latest = await logger.getLatestDecision(0);
      expect(latest.action).to.equal(ActionType.REBALANCE);
      expect(latest.confidence).to.equal(85);
      expect(latest.reasoning).to.equal(reasoning);
      expect(latest.newTickLower).to.equal(-4000);
      expect(latest.newTickUpper).to.equal(4000);
    });

    it("rejects rebalance from different agent", async () => {
      // Whitelist the other agent first so we hit the "Not strategy agent"
      // check instead of the earlier "Not authorized agent" modifier.
      await manager.connect(owner).setAgent(otherAgent.address, true);

      await expect(
        manager
          .connect(otherAgent)
          .rebalance(0, buildPositions(-4000, 4000), "hostile", 50),
      ).to.be.revertedWith("Not strategy agent");
    });

    it("rejects rebalance with empty reasoning", async () => {
      await expect(
        manager.connect(agent).rebalance(0, buildPositions(-4000, 4000), "", 50),
      ).to.be.revertedWith("Reasoning required");
    });

    it("rejects rebalance with confidence > 100", async () => {
      await expect(
        manager
          .connect(agent)
          .rebalance(0, buildPositions(-4000, 4000), "ok", 101),
      ).to.be.revertedWith("Confidence 0-100");
    });

    it("rejects rebalance on non-existent strategy", async () => {
      await expect(
        manager
          .connect(agent)
          .rebalance(99, buildPositions(-4000, 4000), "ok", 50),
      ).to.be.revertedWith("Strategy does not exist");
    });
  });

  describe("logHold", () => {
    beforeEach(async () => {
      await manager
        .connect(agent)
        .deployStrategy(
          mockPool,
          mockToken0,
          mockToken1,
          3000,
          buildPositions(),
          RiskProfile.CONSERVATIVE,
          "initial",
        );
    });

    it("appends HOLD decision without mutating strategy", async () => {
      await manager.connect(agent).logHold(0, "price ranging, do nothing", 70);

      expect(await logger.getDecisionCount(0)).to.equal(2);
      const latest = await logger.getLatestDecision(0);
      expect(latest.action).to.equal(ActionType.HOLD);
      expect(latest.confidence).to.equal(70);

      // Strategy stays active and unchanged
      const strat = await manager.getStrategy(0);
      expect(strat.active).to.equal(true);
    });

    it("HOLD from wrong agent reverts", async () => {
      await manager.connect(owner).setAgent(otherAgent.address, true);
      await expect(
        manager.connect(otherAgent).logHold(0, "not mine", 50),
      ).to.be.revertedWith("Not strategy agent");
    });
  });

  describe("compoundFees", () => {
    beforeEach(async () => {
      await manager
        .connect(agent)
        .deployStrategy(
          mockPool,
          mockToken0,
          mockToken1,
          3000,
          buildPositions(),
          RiskProfile.CONSERVATIVE,
          "initial",
        );
    });

    it("emits StrategyCompounded + logs COMPOUND decision", async () => {
      await expect(
        manager.connect(agent).compoundFees(0, "harvest fees", 90),
      )
        .to.emit(manager, "StrategyCompounded")
        .withArgs(0, 90);

      const latest = await logger.getLatestDecision(0);
      expect(latest.action).to.equal(ActionType.COMPOUND);
      expect(latest.confidence).to.equal(90);
    });
  });

  describe("emergencyExit", () => {
    beforeEach(async () => {
      await manager
        .connect(agent)
        .deployStrategy(
          mockPool,
          mockToken0,
          mockToken1,
          3000,
          buildPositions(),
          RiskProfile.CONSERVATIVE,
          "initial",
        );
    });

    it("deactivates strategy and logs EMERGENCY_EXIT", async () => {
      await expect(
        manager.connect(agent).emergencyExit(0, "vol spike, unwind"),
      )
        .to.emit(manager, "StrategyExited")
        .withArgs(0, "vol spike, unwind");

      const strat = await manager.getStrategy(0);
      expect(strat.active).to.equal(false);

      const latest = await logger.getLatestDecision(0);
      expect(latest.action).to.equal(ActionType.EMERGENCY_EXIT);
      expect(latest.confidence).to.equal(100);
    });

    it("after exit, rebalance reverts with 'Strategy not active'", async () => {
      await manager.connect(agent).emergencyExit(0, "done");
      await expect(
        manager
          .connect(agent)
          .rebalance(0, buildPositions(-4000, 4000), "too late", 50),
      ).to.be.revertedWith("Strategy not active");
    });

    it("after exit, logHold reverts with 'Strategy not active'", async () => {
      await manager.connect(agent).emergencyExit(0, "done");
      await expect(
        manager.connect(agent).logHold(0, "too late", 50),
      ).to.be.revertedWith("Strategy not active");
    });
  });

  describe("recordExecution", () => {
    const TX_HASH = "0x" + "ab".repeat(32);
    const EXTERNAL_ID = "invest-12345";

    beforeEach(async () => {
      await manager
        .connect(agent)
        .deployStrategy(
          mockPool,
          mockToken0,
          mockToken1,
          3000,
          buildPositions(),
          RiskProfile.CONSERVATIVE,
          "initial",
        );
    });

    it("appends execution and emits ExecutionRecorded", async () => {
      await expect(
        manager
          .connect(agent)
          .recordExecution(0, ActionType.DEPLOY, -1000, 1000, TX_HASH, EXTERNAL_ID),
      )
        .to.emit(manager, "ExecutionRecorded")
        .withArgs(0, ActionType.DEPLOY, TX_HASH, EXTERNAL_ID);

      const count = await manager.getExecutionCount(0);
      expect(count).to.equal(1);

      const latest = await manager.getLatestExecution(0);
      expect(latest.action).to.equal(ActionType.DEPLOY);
      expect(latest.tickLower).to.equal(-1000);
      expect(latest.tickUpper).to.equal(1000);
      expect(latest.txHash).to.equal(TX_HASH);
      expect(latest.externalId).to.equal(EXTERNAL_ID);
    });

    it("rejects zero tx hash", async () => {
      await expect(
        manager
          .connect(agent)
          .recordExecution(
            0,
            ActionType.DEPLOY,
            -1000,
            1000,
            ethers.ZeroHash,
            EXTERNAL_ID,
          ),
      ).to.be.revertedWith("Zero tx hash");
    });

    it("rejects from non-agent", async () => {
      await expect(
        manager
          .connect(stranger)
          .recordExecution(
            0,
            ActionType.DEPLOY,
            -1000,
            1000,
            TX_HASH,
            EXTERNAL_ID,
          ),
      ).to.be.revertedWith("Not authorized agent");
    });

    it("getLatestExecution reverts when no executions", async () => {
      // Fresh strategy, no executions recorded
      await expect(manager.getLatestExecution(0)).to.be.revertedWith(
        "No executions",
      );
    });
  });
});
