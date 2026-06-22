// Dependency-free guard for ADR-0016: the semver *minor* of package.json's
// version must equal DB_VERSION in src/db/schema.ts. Runnable in plain Node
// (no TS loader) locally and in CI; the comparison is factored into an exported
// helper so it can be unit-tested without spawning a process.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Extract DB_VERSION from the raw text of schema.ts. Regex (not import) so this
 * runs under plain Node without a TypeScript loader.
 * @param {string} schemaSource
 * @returns {number}
 */
export function extractDbVersion(schemaSource) {
  const match = schemaSource.match(/export const DB_VERSION\s*=\s*(\d+)/);
  if (!match) {
    throw new Error(
      'Could not find `export const DB_VERSION = <number>` in schema source.',
    );
  }
  return Number(match[1]);
}

/**
 * Assert that minor(version) === DB_VERSION. Throws with the drift message on
 * mismatch; returns the aligned numbers on success.
 * @param {{ version: string, schemaSource: string }} input
 * @returns {{ minor: number, dbVersion: number }}
 */
export function assertVersionAlignment({ version, schemaSource }) {
  const parts = String(version).split('.');
  if (parts.length < 2 || !/^\d+$/.test(parts[1])) {
    throw new Error(`Malformed package version: "${version}"`);
  }
  const minor = Number(parts[1]);
  const dbVersion = extractDbVersion(schemaSource);
  if (minor !== dbVersion) {
    throw new Error(
      `Version drift: semver minor (${minor}) ≠ DB_VERSION (${dbVersion})`,
    );
  }
  return { minor, dbVersion };
}

function main() {
  const pkgUrl = new URL('../package.json', import.meta.url);
  const schemaUrl = new URL('../src/db/schema.ts', import.meta.url);
  const { version } = JSON.parse(readFileSync(pkgUrl, 'utf-8'));
  const schemaSource = readFileSync(schemaUrl, 'utf-8');
  try {
    const { minor, dbVersion } = assertVersionAlignment({ version, schemaSource });
    console.log(
      `Version alignment OK: semver minor (${minor}) === DB_VERSION (${dbVersion}).`,
    );
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

// Run only when invoked directly (not when imported by tests).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
