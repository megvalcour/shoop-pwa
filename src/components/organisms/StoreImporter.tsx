import { useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import Button from '@/components/atoms/Button';
import { useImportStore } from '@/hooks/useImportStore';
import { parseStoreImport } from '@/utils/parseStoreImport';
import type { ParsedStoreImport } from '@/utils/parseStoreImport';
import { STORE_IMPORT_PROMPT } from '@/utils/storeImportPrompt';

/**
 * Add-a-custom-store organism (ADR-0024). Explains how a custom store works,
 * offers a "Copy prompt" button that puts the AI prompt on the clipboard, and
 * accepts the resulting JSON via file upload or paste through one identical code
 * path (`parseStoreImport`). On a valid parse it previews the store and, on
 * confirm, creates it via `useImportStore` and navigates to its detail page.
 * All parse/validate/create logic lives in utils + the hook; this is UI only.
 */
export default function StoreImporter() {
  const navigate = useNavigate();
  const importStore = useImportStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [rawText, setRawText] = useState('');
  const [parsed, setParsed] = useState<ParsedStoreImport | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  function validate(text: string) {
    setRawText(text);
    if (!text.trim()) {
      setParsed(null);
      setErrors([]);
      return;
    }
    const result = parseStoreImport(text);
    if (result.ok) {
      setParsed(result.store);
      setErrors([]);
    } else {
      setParsed(null);
      setErrors(result.errors);
    }
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(STORE_IMPORT_PROMPT);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable (or denied): fall back to selecting the prompt
      // textarea so the user can copy it manually.
      const field = document.getElementById('store-import-prompt') as HTMLTextAreaElement | null;
      field?.focus();
      field?.select();
    }
  }

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    validate(text);
  }

  function addStore() {
    if (!parsed) return;
    importStore.mutate(parsed, {
      onSuccess: (storeId) => navigate(`/stores/${storeId}`),
    });
  }

  const totalItems = parsed?.aisles.reduce((sum, aisle) => sum + aisle.items.length, 0) ?? 0;

  return (
    <div className="flex flex-col gap-6 px-4 py-6 pb-24">
      <header>
        <h1 className="font-display font-bold text-text text-xl">Add a store</h1>
        <p className="text-text-muted text-sm mt-1">
          Custom stores are built from a JSON file describing your store&rsquo;s aisles and a few
          example items in each. The example items teach Shoop where to file your groceries when you
          shop there. Copy the prompt below, fill in the name and location of your grocery store at
          the bottom, then send it to an AI assistant. Upload or paste the result here.
        </p>
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="font-display font-bold text-text text-base">1. Copy the prompt</h2>
        <Button variant="secondary" className="self-start" onClick={() => void copyPrompt()}>
          {copied ? 'Copied!' : 'Copy prompt'}
        </Button>
        <textarea
          id="store-import-prompt"
          readOnly
          value={STORE_IMPORT_PROMPT}
          className="rounded-lg border border-border bg-card px-3 py-2 text-text-muted text-xs font-mono h-24 resize-none"
          aria-label="AI prompt"
        />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-display font-bold text-text text-base">2. Add the JSON</h2>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          onChange={(event) => void handleFile(event)}
          className="hidden"
          aria-label="Upload store JSON file"
        />
        <Button
          variant="secondary"
          className="self-start"
          onClick={() => fileInputRef.current?.click()}
        >
          Upload JSON file
        </Button>
        <textarea
          value={rawText}
          onChange={(event) => validate(event.target.value)}
          placeholder="…or paste the JSON here"
          aria-label="Store JSON"
          className="rounded-lg border border-border bg-card px-3 py-2 text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary h-40 resize-y font-mono text-xs"
        />
      </section>

      {errors.length > 0 && (
        <ul className="flex flex-col gap-1">
          {errors.map((error) => (
            <li key={error} className="text-destructive text-sm">
              {error}
            </li>
          ))}
        </ul>
      )}

      {parsed && (
        <section className="flex flex-col gap-3">
          <div className="rounded-xl bg-surface px-4 py-3">
            <p className="font-medium text-text">{parsed.name}</p>
            {parsed.address && <p className="text-text-muted text-sm">{parsed.address}</p>}
            <p className="text-text-muted text-sm mt-1">
              {parsed.aisles.length} {parsed.aisles.length === 1 ? 'aisle' : 'aisles'} ·{' '}
              {totalItems} example {totalItems === 1 ? 'item' : 'items'}
            </p>
          </div>

          {importStore.isError && (
            <p className="text-destructive text-sm">Couldn&rsquo;t add the store. Please try again.</p>
          )}

          <Button
            variant="primary"
            className="w-full"
            disabled={importStore.isPending}
            onClick={addStore}
          >
            {importStore.isPending ? 'Adding…' : 'Add store'}
          </Button>
        </section>
      )}
    </div>
  );
}
