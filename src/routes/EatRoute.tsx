import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUser, faBookOpen, faCalendarWeek } from '@fortawesome/free-solid-svg-icons';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import BottomSheet from '@/components/molecules/BottomSheet';
import Button from '@/components/atoms/Button';
import DailyTargets from '@/components/organisms/DailyTargets';
import EatProfileForm from '@/components/organisms/EatProfileForm';
import { useEatProfile } from '@/hooks/useEatProfile';
import { ACTIVITY_LABELS, computeTargets } from '@/services/nutritionTargets';
import { kgToLb } from '@/services/units';
import type { EatProfile } from '@/db/schema';

/**
 * Eat tab landing screen.
 *
 * Phase 2 hangs real, data-driven content on the Phase 1 shell: the static
 * Profile stub is replaced by a state-aware Profile section — an empty-state CTA
 * when no profile exists, or a compact summary + computed daily targets once one
 * is set. The profile lives as a JSON value in the `preferences` store (no schema
 * change); targets are pure on-device math (services/nutritionTargets.ts), so the
 * route owns the profile→targets computation and the display stays presentational.
 *
 * The Recipes and Weekly Plan sections remain Phase 1 "coming soon" stubs
 * (Phases 3 & 5). The whole surface retheme greens via the data-theme="eat"
 * cascade (ADR-0028); these components use role tokens only.
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

/** A short "62 yr · Female · 154 lb · 5 ft 9 in" line for the populated summary. */
function profileSummary(profile: EatProfile): string {
  const sex = profile.sex === 'male' ? 'Male' : 'Female';
  const activity = ACTIVITY_LABELS[profile.activity].split(' — ')[0];
  const weight =
    profile.units === 'metric'
      ? `${Math.round(profile.weightKg)} kg`
      : `${Math.round(kgToLb(profile.weightKg))} lb`;
  return `${profile.age} yr · ${sex} · ${weight} · ${activity}`;
}

export default function EatRoute() {
  const { data: profile, isLoading } = useEatProfile();
  const [isFormOpen, setFormOpen] = useState(false);

  return (
    <div className="relative flex flex-col pb-24">
      <section className="px-4 pt-6">
        <h1 className="font-display font-extrabold text-ink text-2xl mb-2">Plan your week</h1>
        <p className="text-text-muted text-sm">
          Turn your recipes into a weekly meal plan, scored against nutrition targets computed right
          on your device.
        </p>
      </section>

      <section className="px-4 pt-6">
        <h2 className="font-display font-bold text-text text-lg mb-3">Profile</h2>

        {isLoading ? null : !profile ? (
          <div className="flex flex-col gap-3 px-4 py-4 bg-card rounded-xl shadow-card">
            <div className="flex items-start gap-3">
              <FontAwesomeIcon icon={faUser} className="text-text-muted text-lg mt-0.5 shrink-0" />
              <span className="text-text-muted text-sm">
                Set up your profile to see your daily nutrition targets, computed locally from your
                age, sex, weight, height, and activity level.
              </span>
            </div>
            <Button variant="primary" onClick={() => setFormOpen(true)} className="self-start">
              Set up your profile
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3 px-4 py-3 bg-card rounded-xl shadow-card">
              <div className="flex items-center gap-3 min-w-0">
                <FontAwesomeIcon icon={faUser} className="text-text-muted text-lg shrink-0" />
                <span className="text-text text-sm font-medium truncate">
                  {profileSummary(profile)}
                </span>
              </div>
              <Button variant="secondary" onClick={() => setFormOpen(true)} className="shrink-0">
                Edit
              </Button>
            </div>

            <DailyTargets targets={computeTargets(profile)} />
          </div>
        )}
      </section>

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

      {isFormOpen ? (
        <BottomSheet
          title={profile ? 'Edit profile' : 'Set up your profile'}
          onClose={() => setFormOpen(false)}
        >
          <EatProfileForm onSaved={() => setFormOpen(false)} />
        </BottomSheet>
      ) : null}
    </div>
  );
}
