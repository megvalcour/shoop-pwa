import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUser, faBookOpen, faCalendarWeek } from '@fortawesome/free-solid-svg-icons';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';

/**
 * Eat tab landing screen (Phase 1 — shell + theme only).
 *
 * Presentational by design: the profile / recipe / weekly-plan object stores do
 * not exist until Phases 2–5 (ADR-0026 ships the migration later), so this
 * screen reads no hooks and persists nothing. It renders a static intro plus
 * three "coming soon" placeholder sections, each structured so the matching
 * later phase can swap the stub body in place without restructuring the page:
 *   - Profile      → Phase 2 (profile capture + locally-computed targets)
 *   - Recipes      → Phase 3 (recipe library)
 *   - Weekly Plan  → Phase 5 (plan grid + scoring)
 *
 * The StoreHeader and bottom nav remain visible and retheme green via the
 * data-theme="eat" cascade (ADR-0028); an Eat-specific header is a later-phase
 * consideration, not Phase 1 scope.
 */

interface ComingSoonSectionProps {
  icon: IconDefinition;
  title: string;
  description: string;
}

function ComingSoonSection({ icon, title, description }: ComingSoonSectionProps) {
  return (
    <section className="px-4 pt-6">
      <h2 className="font-display font-bold text-text text-lg mb-3">{title}</h2>
      <div className="flex items-start gap-3 px-4 py-4 bg-card rounded-xl shadow-card">
        <FontAwesomeIcon icon={icon} className="text-text-muted text-lg mt-0.5 shrink-0" />
        <div className="flex flex-col gap-1">
          <span className="text-text-muted text-sm">{description}</span>
          <span className="text-text-muted/70 text-xs font-medium uppercase tracking-wide">
            Coming soon
          </span>
        </div>
      </div>
    </section>
  );
}

export default function EatRoute() {
  return (
    <div className="relative flex flex-col pb-24">
      <section className="px-4 pt-6">
        <h1 className="font-display font-extrabold text-ink text-2xl mb-2">Plan your week</h1>
        <p className="text-text-muted text-sm">
          Turn your recipes into a weekly meal plan, scored against nutrition targets computed right
          on your device.
        </p>
      </section>

      <ComingSoonSection
        icon={faUser}
        title="Profile"
        description="Set your age, sex, weight, height, and activity level so Shoop can compute your daily nutrition targets locally."
      />

      <ComingSoonSection
        icon={faBookOpen}
        title="Recipes"
        description="Build a library of recipes you can pull from when planning your week."
      />

      <ComingSoonSection
        icon={faCalendarWeek}
        title="Weekly Plan"
        description="Lay out your meals for the week and see how they stack up against your targets."
      />
    </div>
  );
}
