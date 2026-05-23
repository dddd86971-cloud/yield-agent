# AgentArena Hook — Demo Video Script

**Total duration:** 90 seconds
**Format:** Voice-over + screen recording
**Goal:** Communicate the core innovation + show on-chain proof in <2 minutes

---

## Shot list (timestamped)

### [0:00 – 0:10] — Hook (the problem)

**Visual:** Split screen — left: a passive LP losing money to a sophisticated MEV bot; right: a question mark.

**Voice-over:**
> "Uniswap V3 LPs lose billions every year to smart-money flow and adverse selection. They have no way to know who's swapping against them, and no contractual protection if they lose. What if AI agents could compete for the right to manage your liquidity — and **promise you a return with their own money on the line**?"

---

### [0:10 – 0:25] — The mechanism in one breath

**Visual:** Schematic of the AgentArena epoch cycle (bid → elect → enforce → settle → loop).

**Voice-over:**
> "AgentArena Hook turns every Uniswap V4 pool into a competitive market.
> Every four hours, AI agents submit signed Strategy Bonds — a stake plus a commitment to a fee range, a maximum number of rebalances, and a promised APR.
> The hook elects the agent with the highest score, gives them management rights, and **enforces every single committed parameter on-chain**.
> If they miss their promise, the hook slashes their stake. The slashed stake goes directly to the LPs."

---

### [0:25 – 0:50] — Live demo: 3 agents bid in one epoch

**Visual:** Terminal showing `forge test --match-test test_FullEpochLifecycle -vv` running live.

The relevant log output rolls in:
```
--- Stage 1: Bid Phase ---
  Confident  score:  42,857,142,857
  Cautious   score:   3,508,771,929
  Aggressive score:  59,523,809,523  ← winner

--- Stage 2: Election ---
  Active Manager: AggressiveAgent

--- Stage 3: Manager Sets TVL Snapshot ---
  startTVL = $10,000

--- Stage 5: Settlement ---
  Stake slashed:        250 USDT
  LP sink received:     250 USDT
  Reputation: 10000 → 9251
```

**Voice-over (while the log scrolls):**
> "Here's a full epoch in twelve seconds.
> Three agents compete — Confident, Cautious, and Aggressive — each with different signed commitments.
> Aggressive wins because she has the highest stake-times-APR-divided-by-band score.
> She gets management rights. But her promised APR isn't met during the epoch — so the hook **slashes 250 USDT from her stake**, sends it to the LP sink, drops her reputation, and opens bidding for the next round.
> All of this happens with zero human intervention. The mechanism is the audit trail."

---

### [0:50 – 1:10] — On-chain proof on X Layer

**Visual:** OKLink showing the deployed AgentArenaHook contract on X Layer mainnet (chain 196), with a list of recent transactions including `ManagerElected`, `BidSubmitted`, `EpochSettled`, `Slashed`.

**Voice-over:**
> "This isn't a simulation. The AgentArena Hook is deployed on X Layer mainnet, attached to a live Uniswap V4 USDT/WOKB pool with dynamic fees.
> Every event you saw in the test is a real on-chain transaction you can verify on OKLink.
> The PoolManager calls our hook on every swap. The hook reads the active manager's signed bond. If the swap stays inside the bond, fee is set dynamically. If the manager tries to break the bond — too many rebalances, range too wide — the transaction reverts and slash is automatic."

---

### [1:10 – 1:25] — Why this is composable infrastructure

**Visual:** Diagram showing multiple agentic projects (YieldAgent, Helios, XSight, future) all bidding into the same AgentArena.

**Voice-over:**
> "AgentArena is open. Any agent on X Layer can register, stake, and compete.
> YieldAgent is just the first one in. Helios, XSight, and every future agentic builder can plug in — and LPs always get the best-performing manager that round.
> This is the missing layer of X Layer's agent economy: **a market where AI strategies are bonded, accountable, and traded.**"

---

### [1:25 – 1:30] — Close

**Visual:** Project logo + URLs.

**Voice-over:**
> "AgentArena Hook. Built for Hook the Future Hackathon on X Layer.
> Twitter at YieldAgent underscore Aiz. Code linked below.
> Where AI agents bet on themselves."

---

## Recording checklist

- [ ] Run `forge test --match-test test_FullEpochLifecycle -vv` once to confirm the log output is clean
- [ ] Open OKLink with hook + registry addresses in tabs
- [ ] Pre-warm: scroll through OKLink tx list so screen recording shows real activity
- [ ] Mic + screen sync — record at 1080p, 30fps
- [ ] Background music: low-key electronic, -20dB beneath voice
- [ ] Captions burned in (in case sound is muted on Twitter previews)
- [ ] Export: MP4, H.264, ~12 Mbps, <100MB final file
- [ ] Upload to YouTube (unlisted) — get permalink for submission

---

## Submission caption

Post the YouTube link in:
1. Google Form (required submission channel)
2. Pinned tweet from `@YieldAgent_Aiz`
3. X Layer Builder Hub Telegram

**Tweet caption (English, ~270 chars):**
```
🪝 AgentArena Hook — submitted to Hook the Future

A V4 hook where AI agents stake USDT + sign strategy commitments,
compete in a 4h epoch auction, and get auto-slashed if they miss
their promise.

The first on-chain Agent Performance Bond.

90s demo 👇

#HookTheFuture @XLayerOfficial @Uniswap @flapdotsh
```

**Tweet caption (中文):**
```
🪝 AgentArena Hook — Hook the Future 提交

让 AI agent 在 V4 hook 里押注自己:
质押 + 签策略承诺,4 小时竞价管理权,
未达承诺自动 slash → 直接转 LP

DeFi 史上第一个 AI Agent 履约债券

90 秒 demo 👇

#HookTheFuture @XLayerOfficial @Uniswap @flapdotsh
```
