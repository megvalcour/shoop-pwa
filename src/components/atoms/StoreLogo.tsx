import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCarrot, faStore } from '@fortawesome/free-solid-svg-icons';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';

interface Props {
  slug: string;
  name: string;
  sizeClassName?: string;
}

// Logoless stores fall back to a Font Awesome icon (ADR-0007) chosen from the
// slug — symmetric with how the PNG `src` is derived from the slug. The General
// Store is intentionally icon-only (a carrot); any other store without a PNG
// gets a generic storefront badge rather than rendering nothing.
const FALLBACK_ICON_BY_SLUG: Record<string, IconDefinition> = {
  general: faCarrot,
};

export default function StoreLogo({ slug, name, sizeClassName = 'h-9 w-9' }: Props) {
  // Track which slug failed to load rather than a bare boolean: StoreHeader stays
  // mounted for the whole session, so a transient load failure (or switching to a
  // logoless store like General) would otherwise latch the fallback permanently —
  // even after switching back to a store that has a PNG. Keying on the slug lets a
  // slug change re-attempt the image instead of inheriting a stale error.
  const [erroredSlug, setErroredSlug] = useState<string | null>(null);
  const errored = erroredSlug === slug;

  if (errored) {
    const icon = FALLBACK_ICON_BY_SLUG[slug] ?? faStore;
    return (
      <span
        role="img"
        aria-label={name}
        className={`${sizeClassName} flex items-center justify-center rounded-full bg-white text-primary shadow-md`}
      >
        <FontAwesomeIcon icon={icon} />
      </span>
    );
  }

  return (
    <img
      src={`/store-logos/${slug}.png`}
      alt={name}
      onError={() => setErroredSlug(slug)}
      className={`${sizeClassName} rounded-full bg-white object-contain p-1 shadow-md`}
    />
  );
}
