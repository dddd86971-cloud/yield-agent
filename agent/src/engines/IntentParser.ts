import OpenAI from "openai";
import { config } from "../config";

export interface UserIntent {
  principal: number;
  riskProfile: "conservative" | "moderate" | "aggressive";
  preferredPairs: string[];
  targetAPRMin: number;
  targetAPRMax: number;
  maxILTolerance: number;
  constraints: string[];
  rawInput: string;
}

const SYSTEM_PROMPT = `You are YieldAgent's intent parser. Parse user's natural language input into a structured DeFi strategy intent.

Output ONLY valid JSON matching this schema:
{
  "principal": <number, USD value>,
  "riskProfile": "conservative" | "moderate" | "aggressive",
  "preferredPairs": ["OKB/USDC", ...],
  "targetAPRMin": <number, percentage>,
  "targetAPRMax": <number, percentage>,
  "maxILTolerance": <number, percentage>,
  "constraints": [<string>...]
}

Rules:
- If user says "conservative/保守": riskProfile=conservative, targetAPR=5-12%, maxIL=2%
- If user says "moderate/稳健/稳定": riskProfile=moderate, targetAPR=12-25%, maxIL=5%
- If user says "aggressive/激进": riskProfile=aggressive, targetAPR=25-50%, maxIL=15%
- Default pair is OKB/USDC if not specified
- If user mentions OKB: include OKB/USDC and OKB/ETH in preferredPairs
- Parse amounts: "5000U" = 5000, "5k" = 5000, "1万" = 10000
- If risk not specified, default to "moderate"
- Parse Chinese and English inputs`;

export class IntentParser {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({ apiKey: config.openaiApiKey });
  }

  async parse(userInput: string): Promise<UserIntent> {
    // Skip OpenAI entirely when no key is configured (avoids 30s of retries
    // returning a 401 in demo / read-only mode).
    if (!config.openaiApiKey) {
      return this.fallbackParse(userInput);
    }
    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userInput },
        ],
        temperature: 0.1,
        max_tokens: 500,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error("Empty AI response");

      const parsed = JSON.parse(content);
      return this.validate({
        ...parsed,
        rawInput: userInput,
      });
    } catch (error) {
      // Fallback to rule-based parsing
      return this.fallbackParse(userInput);
    }
  }

  private validate(intent: any): UserIntent {
    return {
      principal: Math.max(0, Number(intent.principal) || 1000),
      riskProfile: ["conservative", "moderate", "aggressive"].includes(intent.riskProfile)
        ? intent.riskProfile
        : "moderate",
      preferredPairs: Array.isArray(intent.preferredPairs) && intent.preferredPairs.length > 0
        ? intent.preferredPairs
        : ["OKB/USDC"],
      targetAPRMin: Math.max(0, Number(intent.targetAPRMin) || 12),
      targetAPRMax: Math.max(0, Number(intent.targetAPRMax) || 25),
      maxILTolerance: Math.max(0, Number(intent.maxILTolerance) || 5),
      constraints: Array.isArray(intent.constraints) ? intent.constraints : [],
      rawInput: intent.rawInput || "",
    };
  }

  private fallbackParse(input: string): UserIntent {
    const lower = input.toLowerCase();

    // Parse amount — order matters: try most specific patterns first.
    let principal = 1000;
    const wanMatch = input.match(/(\d+(?:\.\d+)?)\s*万/);
    const kMatch = input.match(/(\d+(?:\.\d+)?)\s*k\b/i);
    const usdMatch = input.match(/(\d+(?:\.\d+)?)\s*(?:u|usdc|usdt|美元|刀|\$)/i);
    if (wanMatch) {
      principal = parseFloat(wanMatch[1]) * 10000;
    } else if (kMatch) {
      principal = parseFloat(kMatch[1]) * 1000;
    } else if (usdMatch) {
      principal = parseFloat(usdMatch[1]);
    }

    // Parse risk
    let riskProfile: "conservative" | "moderate" | "aggressive" = "moderate";
    if (lower.includes("conservative") || lower.includes("保守") || lower.includes("安全")) {
      riskProfile = "conservative";
    } else if (lower.includes("aggressive") || lower.includes("激进") || lower.includes("高风险")) {
      riskProfile = "aggressive";
    } else if (lower.includes("moderate") || lower.includes("稳") || lower.includes("中等")) {
      riskProfile = "moderate";
    }

    // Parse pairs
    const preferredPairs: string[] = [];
    if (lower.includes("okb")) preferredPairs.push("OKB/USDC", "OKB/ETH");
    if (lower.includes("eth")) preferredPairs.push("ETH/USDC");
    if (preferredPairs.length === 0) preferredPairs.push("OKB/USDC");

    // Risk-based defaults
    const riskDefaults = {
      conservative: { targetAPRMin: 5, targetAPRMax: 12, maxIL: 2 },
      moderate: { targetAPRMin: 12, targetAPRMax: 25, maxIL: 5 },
      aggressive: { targetAPRMin: 25, targetAPRMax: 50, maxIL: 15 },
    };

    const defaults = riskDefaults[riskProfile];

    // Parse explicit APR target
    let targetAPRMin = defaults.targetAPRMin;
    let targetAPRMax = defaults.targetAPRMax;
    const aprMatch = input.match(/(\d+)%/);
    if (aprMatch) {
      const target = parseInt(aprMatch[1]);
      targetAPRMin = Math.max(target - 5, 0);
      targetAPRMax = target + 10;
    }

    return {
      principal,
      riskProfile,
      preferredPairs,
      targetAPRMin,
      targetAPRMax,
      maxILTolerance: defaults.maxIL,
      constraints: [],
      rawInput: input,
    };
  }
}
