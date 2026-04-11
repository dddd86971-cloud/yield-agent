import { expect } from "chai";
import { ethers } from "hardhat";
import { DecisionLogger } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

/**
 * DecisionLogger unit tests
 * =========================
 *
 * DecisionLogger is the lowest tier in the YieldAgent on-chain stack — it's
 * the contract every other action ultimately writes to. These tests pin the
 * three invariants the SUBMISSION relies on:
 *
 *   1. Only authorized callers can write a decision. Nobody can forge the
 *      agent's reasoning history by calling logDecision directly.
 *   2. Each ActionType (DEPLOY / REBALANCE / COMPOUND / EMERGENCY_EXIT /
 *      HOLD) bumps its matching counter in agentStats, so the leaderboard
 *      claim "you can see how many times agent X rebalanced vs held" is
 *      backed by enforced accounting.
 *   3. Revert paths protect the audit trail from empty-reasoning and
 *      confidence-out-of-range writes — the judge-verifiable chain can
 *      never contain junk entries.
 *
 * We deliberately exercise the DecisionLogger directly (authorizing one of
 * the test signers as a mock "strategy manager") instead of going through
 * StrategyManager, because the StrategyManager integration tests cover
 * the glue path separately and we want these tests to isolate DecisionLogger
 * revert surfaces.
 */

// Matches the enum in contracts/interfaces/IYieldProtocol.sol
const ActionType = {
  DEPLOY: 0,
  REBALANCE: 1,
  COMPOUND: 2,
  EMERGENCY_EXIT: 3,
  HOLD: 4,
} as const;

describe("DecisionLogger", () => {
  let logger: DecisionLogger;
  let owner: SignerWithAddress;
  let authorizedCaller: SignerWithAddress;
  let agent: SignerWithAddress;
  let stranger: SignerWithAddress;

  beforeEach(async () => {
    [owner, authorizedCaller, agent, stranger] = await ethers.getSigners();

    const DecisionLoggerFactory = await ethers.getContractFactory("DecisionLogger");
    logger = (await DecisionLoggerFactory.deploy()) as unknown as DecisionLogger;
    await logger.waitForDeployment();

    // Authorize one signer to play the role of StrategyManager
    await logger.connect(owner).setAuthorized(authorizedCaller.address, true);
  });

  describe("deployment + admin", () => {
    it("sets deployer as owner", async () => {
      expect(await logger.owner()).to.equal(owner.address);
    });

    it("starts with no authorized callers except via setAuthorized", async () => {
      expect(await logger.authorized(stranger.address)).to.equal(false);
      expect(await logger.authorized(authorizedCaller.address)).to.equal(true);
    });

    it("only owner can setAuthorized", async () => {
      await expect(
        logger.connect(stranger).setAuthorized(stranger.address, true),
      ).to.be.revertedWith("Not owner");
    });

    it("emits AuthorizationUpdated on setAuthorized", async () => {
      await expect(logger.connect(owner).setAuthorized(stranger.address, true))
        .to.emit(logger, "AuthorizationUpdated")
        .withArgs(stranger.address, true);
    });

    it("transferOwnership flips control", async () => {
      await logger.connect(owner).transferOwnership(authorizedCaller.address);
      expect(await logger.owner()).to.equal(authorizedCaller.address);
      await expect(
        logger.connect(owner).setAuthorized(stranger.address, true),
      ).to.be.revertedWith("Not owner");
    });

    it("transferOwnership rejects zero address", async () => {
      await expect(
        logger.connect(owner).transferOwnership(ethers.ZeroAddress),
      ).to.be.revertedWith("Zero address");
    });
  });

  describe("logDecision access control", () => {
    it("rejects unauthorized caller", async () => {
      await expect(
        logger.connect(stranger).logDecision(
          0,
          agent.address,
          ActionType.DEPLOY,
          0,
          0,
          -1000,
          1000,
          95,
          "forged",
        ),
      ).to.be.revertedWith("Not authorized");
    });

    it("accepts call from owner without explicit authorization", async () => {
      // The onlyAuthorized modifier permits the owner as a fallback — this
      // lets the factory or a script log genesis decisions without first
      // authorizing itself.
      await expect(
        logger.connect(owner).logDecision(
          0,
          agent.address,
          ActionType.DEPLOY,
          0,
          0,
          -1000,
          1000,
          90,
          "owner path",
        ),
      ).to.emit(logger, "DecisionRecorded");
    });

    it("accepts call from explicitly authorized caller", async () => {
      await expect(
        logger.connect(authorizedCaller).logDecision(
          0,
          agent.address,
          ActionType.DEPLOY,
          0,
          0,
          -500,
          500,
          80,
          "auth path",
        ),
      )
        .to.emit(logger, "DecisionRecorded")
        .withArgs(0, agent.address, ActionType.DEPLOY, 80, "auth path");
    });
  });

  describe("logDecision validation", () => {
    it("reverts with empty reasoning", async () => {
      await expect(
        logger.connect(authorizedCaller).logDecision(
          0,
          agent.address,
          ActionType.HOLD,
          0,
          0,
          0,
          0,
          50,
          "",
        ),
      ).to.be.revertedWith("Reasoning required");
    });

    it("reverts with confidence > 100", async () => {
      await expect(
        logger.connect(authorizedCaller).logDecision(
          0,
          agent.address,
          ActionType.HOLD,
          0,
          0,
          0,
          0,
          101,
          "out of range",
        ),
      ).to.be.revertedWith("Confidence 0-100");
    });

    it("accepts confidence = 0", async () => {
      await expect(
        logger.connect(authorizedCaller).logDecision(
          0,
          agent.address,
          ActionType.HOLD,
          0,
          0,
          0,
          0,
          0,
          "zero confidence",
        ),
      ).to.emit(logger, "DecisionRecorded");
    });

    it("accepts confidence = 100", async () => {
      await expect(
        logger.connect(authorizedCaller).logDecision(
          0,
          agent.address,
          ActionType.DEPLOY,
          0,
          0,
          -100,
          100,
          100,
          "max confidence",
        ),
      ).to.emit(logger, "DecisionRecorded");
    });
  });

  describe("decision history + views", () => {
    beforeEach(async () => {
      // Seed three decisions on strategyId 0
      await logger.connect(authorizedCaller).logDecision(
        0,
        agent.address,
        ActionType.DEPLOY,
        0,
        0,
        -1000,
        1000,
        95,
        "deploy thesis",
      );
      await logger.connect(authorizedCaller).logDecision(
        0,
        agent.address,
        ActionType.HOLD,
        -1000,
        1000,
        -1000,
        1000,
        70,
        "ranging, hold",
      );
      await logger.connect(authorizedCaller).logDecision(
        0,
        agent.address,
        ActionType.REBALANCE,
        -1000,
        1000,
        -500,
        1500,
        85,
        "drift up, recenter",
      );
    });

    it("getDecisionCount returns 3", async () => {
      expect(await logger.getDecisionCount(0)).to.equal(3);
    });

    it("getDecisionHistory returns all 3 decisions in order", async () => {
      const history = await logger.getDecisionHistory(0);
      expect(history.length).to.equal(3);
      expect(history[0].action).to.equal(ActionType.DEPLOY);
      expect(history[0].reasoning).to.equal("deploy thesis");
      expect(history[0].confidence).to.equal(95);
      expect(history[1].action).to.equal(ActionType.HOLD);
      expect(history[2].action).to.equal(ActionType.REBALANCE);
      expect(history[2].newTickLower).to.equal(-500);
      expect(history[2].newTickUpper).to.equal(1500);
    });

    it("getLatestDecision returns the REBALANCE", async () => {
      const latest = await logger.getLatestDecision(0);
      expect(latest.action).to.equal(ActionType.REBALANCE);
      expect(latest.reasoning).to.equal("drift up, recenter");
    });

    it("getLatestDecision reverts when no decisions exist", async () => {
      await expect(logger.getLatestDecision(999)).to.be.revertedWith(
        "No decisions",
      );
    });

    it("getRecentDecisions clamps count to history length", async () => {
      const recent = await logger.getRecentDecisions(0, 10);
      expect(recent.length).to.equal(3);
    });

    it("getRecentDecisions returns last 2 when asked for 2", async () => {
      const recent = await logger.getRecentDecisions(0, 2);
      expect(recent.length).to.equal(2);
      expect(recent[0].action).to.equal(ActionType.HOLD);
      expect(recent[1].action).to.equal(ActionType.REBALANCE);
    });

    it("writes DecisionRecorded events for every call", async () => {
      // Past events — check topic counts
      const filter = logger.filters.DecisionRecorded();
      const events = await logger.queryFilter(filter);
      expect(events.length).to.equal(3);
    });
  });

  describe("agent statistics", () => {
    it("increments counters per action type", async () => {
      // 1 DEPLOY
      await logger.connect(authorizedCaller).logDecision(
        0,
        agent.address,
        ActionType.DEPLOY,
        0,
        0,
        -1000,
        1000,
        100,
        "deploy",
      );
      // 2 HOLD
      await logger.connect(authorizedCaller).logDecision(
        0,
        agent.address,
        ActionType.HOLD,
        -1000,
        1000,
        -1000,
        1000,
        50,
        "hold 1",
      );
      await logger.connect(authorizedCaller).logDecision(
        0,
        agent.address,
        ActionType.HOLD,
        -1000,
        1000,
        -1000,
        1000,
        60,
        "hold 2",
      );
      // 1 REBALANCE
      await logger.connect(authorizedCaller).logDecision(
        0,
        agent.address,
        ActionType.REBALANCE,
        -1000,
        1000,
        -500,
        1500,
        80,
        "rebalance",
      );

      const stats = await logger.getAgentStats(agent.address);
      // totalDecisions
      expect(stats.totalDecisions).to.equal(4);
      // averageConfidence = (100+50+60+80)/4 = 72 (floor)
      expect(stats.averageConfidence).to.equal(72);
      // rebalanceCount
      expect(stats.rebalanceCount).to.equal(1);
      // holdCount
      expect(stats.holdCount).to.equal(2);

      // Direct storage accessors (public mapping)
      const rawStats = await logger.agentStats(agent.address);
      expect(rawStats.deployCount).to.equal(1);
      expect(rawStats.compoundCount).to.equal(0);
      expect(rawStats.exitCount).to.equal(0);
    });

    it("getAgentStats returns 0 averageConfidence for unknown agent", async () => {
      const stats = await logger.getAgentStats(stranger.address);
      expect(stats.totalDecisions).to.equal(0);
      expect(stats.averageConfidence).to.equal(0);
    });

    it("tracks stats separately per agent", async () => {
      await logger.connect(authorizedCaller).logDecision(
        0,
        agent.address,
        ActionType.DEPLOY,
        0,
        0,
        -1000,
        1000,
        90,
        "agent A deploy",
      );
      await logger.connect(authorizedCaller).logDecision(
        1,
        stranger.address,
        ActionType.HOLD,
        0,
        0,
        0,
        0,
        40,
        "agent B hold",
      );

      const statsA = await logger.getAgentStats(agent.address);
      const statsB = await logger.getAgentStats(stranger.address);
      expect(statsA.totalDecisions).to.equal(1);
      expect(statsB.totalDecisions).to.equal(1);
      expect(statsA.holdCount).to.equal(0);
      expect(statsB.holdCount).to.equal(1);
    });
  });
});
