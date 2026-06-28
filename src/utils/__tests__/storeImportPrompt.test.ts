import { describe, it, expect } from 'vitest';
import { STORE_IMPORT_PROMPT } from '@/utils/storeImportPrompt';
import { parseStoreImport } from '@/utils/parseStoreImport';

describe('STORE_IMPORT_PROMPT', () => {
  it('embeds an example that parses cleanly through parseStoreImport', () => {
    // Extract the first JSON object from the prompt (the contract example) and
    // assert it validates — this keeps the prompt and validator in lockstep.
    const match = STORE_IMPORT_PROMPT.match(/\{[\s\S]*\}/);
    expect(match).not.toBeNull();
    const result = parseStoreImport(match![0]);
    expect(result.ok).toBe(true);
  });
});
