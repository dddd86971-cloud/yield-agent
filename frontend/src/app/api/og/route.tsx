import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px",
          backgroundColor: "#0a0a0f",
          color: "white",
        }}
      >
        {/* Top: brand row */}
        <div style={{ display: "flex", alignItems: "center" }}>
          <div
            style={{
              width: "72px",
              height: "72px",
              borderRadius: "20px",
              background: "linear-gradient(135deg, #00ffa3, #00cc82)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "40px",
              color: "#0a0a0f",
              fontWeight: 800,
              marginRight: "20px",
            }}
          >
            Y
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: "44px", fontWeight: 700, lineHeight: 1 }}>
              YieldAgent
            </div>
            <div
              style={{
                fontSize: "20px",
                color: "rgba(255,255,255,0.45)",
                marginTop: "6px",
              }}
            >
              on X Layer · zkEVM L2
            </div>
          </div>
          <div
            style={{
              marginLeft: "auto",
              display: "flex",
              alignItems: "center",
              padding: "10px 20px",
              borderRadius: "999px",
              border: "1px solid rgba(0,255,163,0.4)",
              backgroundColor: "rgba(0,255,163,0.08)",
              color: "#00ffa3",
              fontSize: "16px",
              textTransform: "uppercase",
              letterSpacing: "0.15em",
            }}
          >
            <div
              style={{
                width: "10px",
                height: "10px",
                borderRadius: "999px",
                backgroundColor: "#00ffa3",
                marginRight: "10px",
              }}
            />
            Live
          </div>
        </div>

        {/* Middle: headline */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: "92px",
              fontWeight: 800,
              lineHeight: 1.02,
              letterSpacing: "-0.02em",
              display: "flex",
            }}
          >
            The on-chain
          </div>
          <div
            style={{
              fontSize: "92px",
              fontWeight: 800,
              lineHeight: 1.02,
              letterSpacing: "-0.02em",
              color: "#00ffa3",
              display: "flex",
            }}
          >
            AI LP Manager.
          </div>
          <div
            style={{
              marginTop: "28px",
              fontSize: "26px",
              color: "rgba(255,255,255,0.6)",
              maxWidth: "920px",
              lineHeight: 1.4,
              display: "flex",
            }}
          >
            Tell the agent your goals in plain English. Three brains manage your
            Uniswap V3 liquidity 24/7. Every decision is logged on-chain.
          </div>
        </div>

        {/* Bottom: feature pills */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex" }}>
            <div
              style={{
                padding: "12px 22px",
                borderRadius: "14px",
                border: "1px solid rgba(255,255,255,0.12)",
                backgroundColor: "rgba(255,255,255,0.04)",
                fontSize: "20px",
                color: "rgba(255,255,255,0.78)",
                marginRight: "14px",
                display: "flex",
              }}
            >
              Market Brain
            </div>
            <div
              style={{
                padding: "12px 22px",
                borderRadius: "14px",
                border: "1px solid rgba(255,255,255,0.12)",
                backgroundColor: "rgba(255,255,255,0.04)",
                fontSize: "20px",
                color: "rgba(255,255,255,0.78)",
                marginRight: "14px",
                display: "flex",
              }}
            >
              Pool Brain
            </div>
            <div
              style={{
                padding: "12px 22px",
                borderRadius: "14px",
                border: "1px solid rgba(255,255,255,0.12)",
                backgroundColor: "rgba(255,255,255,0.04)",
                fontSize: "20px",
                color: "rgba(255,255,255,0.78)",
                marginRight: "14px",
                display: "flex",
              }}
            >
              Risk Brain
            </div>
          </div>
          <div
            style={{
              fontSize: "18px",
              color: "rgba(255,255,255,0.35)",
              textTransform: "uppercase",
              letterSpacing: "0.15em",
              display: "flex",
            }}
          >
            yieldagent.xyz
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
