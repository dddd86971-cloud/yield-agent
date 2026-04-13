import { LandingHeader } from "@/components/landing/LandingHeader";
import { LandingHero } from "@/components/landing/LandingHero";
import { LandingFeatures } from "@/components/landing/LandingFeatures";
import { LandingHowItWorks } from "@/components/landing/LandingHowItWorks";
import { LandingComparison } from "@/components/landing/LandingComparison";
import { LandingStats } from "@/components/landing/LandingStats";
import { LandingFAQ } from "@/components/landing/LandingFAQ";
import { LandingCTA } from "@/components/landing/LandingCTA";
import { LandingTryAgent } from "@/components/landing/LandingTryAgent";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { Reveal } from "@/components/landing/Reveal";

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      <LandingHeader />
      <main>
        <LandingHero />
        <Reveal>
          <LandingFeatures />
        </Reveal>
        <Reveal>
          <LandingHowItWorks />
        </Reveal>
        <Reveal>
          <LandingComparison />
        </Reveal>
        <Reveal>
          <LandingStats />
        </Reveal>
        <Reveal>
          <LandingTryAgent />
        </Reveal>
        <Reveal>
          <LandingFAQ />
        </Reveal>
        <Reveal>
          <LandingCTA />
        </Reveal>
      </main>
      <LandingFooter />
    </div>
  );
}
