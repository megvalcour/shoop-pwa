import { describe, expect, it } from 'vitest';
// @ts-expect-error -- plain .mjs helper, no type declarations needed for tests
import {
  assertVersionAlignment,
  extractDbVersion,
} from '../check-version-db-alignment.mjs';

const schema = (n: number) =>
  `import type { DBSchema } from 'idb';\n\nexport const DB_NAME = 'shoop';\nexport const DB_VERSION = ${n};\n`;

describe('extractDbVersion', () => {
  it('parses DB_VERSION from schema source', () => {
    expect(extractDbVersion(schema(4))).toBe(4);
  });

  it('throws a clear error on malformed schema source', () => {
    expect(() => extractDbVersion('const NOPE = 4;')).toThrow(/DB_VERSION/);
  });
});

describe('assertVersionAlignment', () => {
  it('passes when minor equals DB_VERSION', () => {
    expect(
      assertVersionAlignment({ version: '1.4.0', schemaSource: schema(4) }),
    ).toEqual({ minor: 4, dbVersion: 4 });
  });

  it('passes regardless of patch component', () => {
    expect(
      assertVersionAlignment({ version: '1.4.7', schemaSource: schema(4) }),
    ).toEqual({ minor: 4, dbVersion: 4 });
  });

  it('fails with the drift message when minor differs from DB_VERSION', () => {
    expect(() =>
      assertVersionAlignment({ version: '1.5.0', schemaSource: schema(4) }),
    ).toThrow('Version drift: semver minor (5) ≠ DB_VERSION (4)');
  });

  it('throws on a malformed version string', () => {
    expect(() =>
      assertVersionAlignment({ version: '1', schemaSource: schema(4) }),
    ).toThrow(/Malformed package version/);
  });

  it('propagates a clear error when DB_VERSION is missing', () => {
    expect(() =>
      assertVersionAlignment({ version: '1.4.0', schemaSource: 'nope' }),
    ).toThrow(/DB_VERSION/);
  });
});
