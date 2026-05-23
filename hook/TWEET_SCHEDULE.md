# Daily Tweet Schedule — Hook the Future Hackathon (5/22–5/28)

Hackathon requires **持续运营发推** during the 6-day event. Below: 1-2 tweets per day,
copy-paste-ready in English + Chinese. All from `@YieldAgent_Aiz`.

@ the 3 required accounts (`@XLayerOfficial @Uniswap @flapdotsh`) on **Day 1** and
**Submission Day**. For days in between, just use `#HookTheFuture` to avoid notification spam.

---

## Day 1 (5/22) — Entry announcement

### English version

```
🪝 YieldAgent → V4 Hook

Build X AI S2: 3-brain AI managed real V3 LPs.
Now: AI lives inside the V4 pool.

🧠 AICuratedHook
· beforeSwap → MarketBrain → dynamic fee
· afterSwap → RiskBrain → rebalance signal

6 days on X Layer 🚀

#HookTheFuture @XLayerOfficial @Uniswap @flapdotsh
```

### 中文版

```
🪝 YieldAgent 报名 Hook the Future

Build X AI S2 上榜后,这一季我们把 AI 直接写进 Uniswap V4 池子 -

🧠 AICuratedHook
· beforeSwap → MarketBrain → 动态手续费
· afterSwap → RiskBrain → 触发再平衡

6 天交付,同一条 X Layer 🚀

#HookTheFuture @XLayerOfficial @Uniswap @flapdotsh
```

**Image:** `docs/v3-architecture.png`

---

## Day 2 (5/23) — Pivot reveal: AgentArena

After thinking deeper, we realized the AI-as-feature framing was too shallow.
Re-pivot to the AgentArena thesis.

### English

```
✏️ Pivoting bigger.

Not just an AI hook — an open arena where AI agents
STAKE USDT + SIGN strategy commitments + COMPETE
for the right to manage Uniswap V4 LP positions.

Miss your promise → auto-slash → LP gets paid.

First on-chain Agent Performance Bond. 🪝

#HookTheFuture
```

### 中文

```
✏️ 把方向想得更大。

不是 AI Hook,是 AI 代理竞技场:
质押 USDT + 签名策略承诺 + 竞争管理 V4 LP 权
没达承诺 → 自动 slash → LP 拿赔偿

DeFi 历史上第一个链上 AI 代理履约债券 🪝

#HookTheFuture
```

---

## Day 3 (5/24) — Engineering proof

After the code is compiled + tested, post evidence.

### English

```
Day 3: AgentArena Hook is alive in tests.

12/12 passing — including the headline test:
3 agents bid → Aggressive wins → epoch runs →
manager misses APR → auto-slash 250 USDT → LP paid

The mechanism IS the audit trail.

Code: [github.com/dddd86971-cloud/yield-agent/tree/main/hook]

#HookTheFuture
```

### 中文

```
Day 3: AgentArena Hook 测试全过。

12/12 通过,包括完整 epoch 演示:
3 个 agent 投标 → Aggressive 胜出 → epoch 跑
→ 经理未达 APR → 自动 slash 250 USDT → LP 拿钱

机制本身就是审计链。

代码: [github.com/dddd86971-cloud/yield-agent/tree/main/hook]

#HookTheFuture
```

**Image:** screenshot of `forge test --match-test test_FullEpochLifecycle -vv` output

---

## Day 4 (5/25) — Mainnet deploy

After running `DeployHook.s.sol` and `InitPool.s.sol`.

### English (replace `0x...` with actual addresses)

```
Day 4: AgentArena Hook is LIVE on X Layer mainnet.

🪝 Hook:     0x...
📋 Registry: 0x...
🏊 V4 Pool (USDT/WOKB, dynamic fee): 0x...

PoolManager fires our hook on every swap.
Anyone can register an agent and compete.

Verify: oklink.com/xlayer/address/0x...

#HookTheFuture
```

### 中文

```
Day 4: AgentArena Hook 主网上线 ✅

🪝 Hook:     0x...
📋 Registry: 0x...
🏊 V4 Pool (USDT/WOKB,动态 fee): 0x...

PoolManager 每笔 swap 触发我们的 hook。
任何 agentic 项目都可以来报名竞争。

链上验证 👉 oklink.com/xlayer/address/0x...

#HookTheFuture
```

**Image:** OKLink screenshot showing the deployed contract

---

## Day 5 (5/26) — First live epoch + demo video

After running `RegisterAgent.s.sol` and at least one full epoch on mainnet.

### English

```
Day 5: First real epoch on mainnet — recorded.

@YieldAgent_Aiz submitted a StrategyBond:
✅ promised 18% APR
✅ fee range 30-80bps
✅ stake 500 USDT
✅ TEE-signed

Won the election. Active manager for 4h.
Reward + reputation update happen on-chain at settlement.

90s demo video 👇 [youtube link]

#HookTheFuture
```

### 中文

```
Day 5: 主网首个真实 epoch — 已录像。

@YieldAgent_Aiz 提交了 StrategyBond:
✅ 承诺 18% APR
✅ fee 范围 30-80bps
✅ 质押 500 USDT
✅ TEE 签名

赢得选举,获得 4 小时管理权。
结算时奖励 + reputation 全程链上。

90 秒 demo 视频 👇 [youtube 链接]

#HookTheFuture
```

**Asset:** YouTube link of demo video (see `DEMO_SCRIPT.md`)

---

## Day 6 (5/27) — Final submission

This is THE @ -all-three tweet. Required by hackathon rules.

### English

```
🪝 Submitting AgentArena Hook to Hook the Future

The first on-chain Agent Performance Bond on Uniswap V4.

✅ Deployed: X Layer mainnet
✅ Tests: 12/12 passing
✅ Live epochs: [N] completed
✅ Demo: [youtube]
✅ Code: [github link]

Thanks for the opportunity to build.

@XLayerOfficial @Uniswap @flapdotsh
#HookTheFuture
```

### 中文

```
🪝 AgentArena Hook 正式提交 Hook the Future

第一个上链的 Uniswap V4 AI 代理履约债券协议。

✅ 主网部署:X Layer
✅ 测试:12/12 全过
✅ 链上 epochs:[N] 个完整跑通
✅ Demo:[youtube]
✅ 代码:[github]

感谢评委 + 同台所有 builder。

@XLayerOfficial @Uniswap @flapdotsh
#HookTheFuture
```

**Image:** Final architecture diagram OR a montage of OKLink screenshots

---

## Posting cadence guidelines

| Day | Tweets | Engagement strategy |
|-----|--------|--------------------|
| Day 1 | 1 (entry) | @ all 3 official accounts, post in TG group within 30min |
| Day 2 | 1 (pivot) | reply to Day 1, quote-RT if any official engagement |
| Day 3 | 1 (engineering) | include screenshot of test output |
| Day 4 | 1 (mainnet deploy) | include OKLink screenshot, NO @ tags |
| Day 5 | 1 (epoch + video) | YouTube link, share to TG group |
| Day 6 | 1 (submission) | **REQUIRED** @XLayerOfficial @Uniswap @flapdotsh |

**Total: 6 tweets across 6 days = solid "持续运营" footprint.**

---

## Backup content (if you want more activity)

### Mid-week engagement tweet (any day)

**English:**
```
Why do most Uniswap V3 LPs lose money?

Adverse selection. Smart-money flow eats their lunch.
LPs see fees, but pay way more in IL + LVR.

Our hook fixes this by giving the LP a hard floor:
manager promises APR, gets slashed if they miss.

Math is now on the LP's side.

#HookTheFuture
```

**中文:**
```
为什么大部分 V3 LP 都在亏钱?

逆向选择。聪明钱专门搬运你的 LP 仓位。
LP 看着收 fee,但被 IL + LVR 吃得更狠。

我们的 hook 给 LP 一个硬底线:
管理者承诺 APR,未达就自动 slash 补偿你。

数学第一次站在 LP 这边。

#HookTheFuture
```
