import { useSearchParams } from 'react-router';
import RecipeImporter from '@/components/organisms/RecipeImporter';
import { isValidRecipeUrl } from '@/hooks/useRecipeImport';

/**
 * The `/import` screen — the Web Share Target action and the manual entry point.
 * Share Target Level 1 delivers a normal GET navigation (ADR-0019), so the
 * shared data arrives as `title`/`text`/`url` query params. Many Android share
 * intents put the link in `text` (or even `title`) rather than `url`, so derive
 * the URL by checking `url` first, then scanning the other fields for the first
 * `http(s)` token. When nothing usable was shared, `RecipeImporter` renders its
 * manual-paste empty state.
 */
function deriveSharedUrl(params: URLSearchParams): string | undefined {
  const direct = params.get('url');
  if (isValidRecipeUrl(direct ?? undefined)) return direct ?? undefined;

  for (const field of ['text', 'title']) {
    const match = params.get(field)?.match(/https?:\/\/\S+/i);
    if (match && isValidRecipeUrl(match[0])) return match[0];
  }

  return undefined;
}

export default function ImportRecipeRoute() {
  const [params] = useSearchParams();
  const url = deriveSharedUrl(params);

  return <RecipeImporter initialUrl={url} />;
}
