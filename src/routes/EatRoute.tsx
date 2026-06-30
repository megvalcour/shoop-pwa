import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faUserGear,
  faBookOpen,
  faCalendarWeek,
} from '@fortawesome/free-solid-svg-icons';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';

interface ComingSoonSection {
  icon: IconDefinition;
  title: string;
  body: string;
}

// Static "coming soon" stubs. Phase 1 ships no Eat object stores, so these are
// placeholders structured so later phases swap each stub's body for a real
// data-driven state in place: Profile → Phase 2 (profile/targets), Recipes →
// Phase 3 (recipe library), Weekly Plan → Phase 5 (plan grid).
const SECTIONS: ComingSoonSection[] = [
  {
    icon: faUserGear,
    title: 'Profile',
    body: 'Tell Shoop your age, weight, height and activity so it can compute your daily nutrition targets — all on-device.',
  },
  {
    icon: faBookOpen,
    title: 'Recipes',
    body: 'Save the recipes you cook and Shoop will enrich each ingredient with nutrition data from USDA FoodData Central.',
  },
  {
    icon: faCalendarWeek,
    title: 'Weekly Plan',
    body: 'Drop recipes onto a weekly plan and see how the week scores against your targets, then send what you need to your list.',
  },
];

export default function EatRoute() {
  return (
    <div className="flex flex-col pb-24">
      <section className="px-4 pt-6">
        <h1 className="font-display font-extrabold text-ink text-2xl mb-1">Plan your week</h1>
        <p className="text-text-muted text-sm">
          Turn your recipes into a weekly meal plan, scored against nutrition targets computed just
          for you. Coming together over the next few updates.
        </p>
      </section>

      {SECTIONS.map(({ icon, title, body }) => (
        <section key={title} className="px-4 pt-6">
          <div className="bg-card rounded-2xl p-4 shadow-card">
            <div className="flex items-center gap-3 mb-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-tint text-primary">
                <FontAwesomeIcon icon={icon} />
              </span>
              <h2 className="font-display font-bold text-text text-lg">{title}</h2>
              <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-text-muted bg-surface rounded-full px-2 py-1">
                Coming soon
              </span>
            </div>
            <p className="text-text-muted text-sm">{body}</p>
          </div>
        </section>
      ))}
    </div>
  );
}
