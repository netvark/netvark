import { describe, expect, it } from 'vitest';

import { InvalidCursorError } from '../errors';
import {
  CONTACTS,
  OTHER_SECRET,
  rejected,
  SECRET,
  thrown,
} from '../test-support/fixtures';
import { createDefineKeyset } from './create-define-keyset';
import { defineKeyset } from './define-keyset';

function message(fn: () => unknown): string {
  const error = thrown(fn);
  expect(error).toBeInstanceOf(TypeError);
  return (error as TypeError).message;
}

/** A definition without a cursor, for definers whose defaults carry one. */
const ITEMS = {
  table: 'items',
  key: ['id'],
  fields: {
    id: { column: 'id', type: 'integer' },
    name: { column: 'name', type: 'text' },
  },
} as const;

/** Plans the page after `cursor`, which only a verified cursor yields a seek for. */
async function seekAfter(
  keyset: ReturnType<typeof defineKeyset>,
  cursor: string,
) {
  const plan = await keyset.plan({ page: { size: 1, after: cursor } });
  return { after: plan.after, seeks: plan.seek !== null };
}

/** The `next` cursor of a first page of one row out of two. */
async function nextCursor(keyset: ReturnType<typeof defineKeyset>) {
  const plan = await keyset.plan({ page: { size: 1 } });
  const page = await keyset.page(plan, [{ id: 1 }, { id: 2 }], (row) => [
    String(row.id),
  ]);
  expect(page.next).not.toBeNull();
  return page.next ?? '';
}

describe('createDefineKeyset', () => {
  it('without defaults defines exactly what defineKeyset defines', () => {
    const plain = defineKeyset({ ...ITEMS, cursor: { secret: SECRET } });
    const configured = createDefineKeyset()({
      ...ITEMS,
      cursor: { secret: SECRET },
    });
    expect(configured.definition).toEqual(plain.definition);
  });

  describe('cursor (SPEC 3.6)', () => {
    it('signs the cursors of a definition without one with the default secret', async () => {
      const define = createDefineKeyset({ cursor: { secret: SECRET } });
      const cursor = await nextCursor(define(ITEMS));
      const same = defineKeyset({ ...ITEMS, cursor: { secret: SECRET } });
      const other = defineKeyset({
        ...ITEMS,
        cursor: { secret: OTHER_SECRET },
      });
      await expect(seekAfter(same, cursor)).resolves.toEqual({
        after: cursor,
        seeks: true,
      });
      const error = await rejected(
        other.plan({ page: { size: 1, after: cursor } }),
      );
      expect(error).toBeInstanceOf(InvalidCursorError);
      expect((error as InvalidCursorError).reason).toBe('signature');
    });

    it('replaces the default member by member, even with undefined', async () => {
      const define = createDefineKeyset({
        cursor: { secret: SECRET, ttl: 60 },
      });
      expect(define(ITEMS).definition.cursor.ttl).toBe(60);
      expect(
        define({ ...ITEMS, cursor: { ttl: 5 } }).definition.cursor.ttl,
      ).toBe(5);
      expect(
        define({ ...ITEMS, cursor: { ttl: undefined } }).definition.cursor.ttl,
      ).toBeNull();
      const rotated = define({ ...ITEMS, cursor: { secret: OTHER_SECRET } });
      expect(rotated.definition.cursor.ttl).toBe(60);
      const cursor = await nextCursor(rotated);
      const signedWithOther = defineKeyset({
        ...ITEMS,
        cursor: { secret: OTHER_SECRET },
      });
      await expect(seekAfter(signedWithOther, cursor)).resolves.toEqual({
        after: cursor,
        seeks: true,
      });
    });

    it('requires a secret from the definition when the defaults have none', () => {
      const define = createDefineKeyset({ page: { max: 10 } });
      expect(message(() => define(ITEMS as never))).toBe(
        'cursor.secret must be set by the definition or the defaults',
      );
      expect(
        define({ ...ITEMS, cursor: { secret: SECRET } }).definition.page.max,
      ).toBe(10);
    });

    it('keeps the defaults of each definer to itself', async () => {
      const first = createDefineKeyset({ cursor: { secret: SECRET } });
      const second = createDefineKeyset({ cursor: { secret: OTHER_SECRET } });
      const cursor = await nextCursor(first(ITEMS));
      const error = await rejected(
        second(ITEMS).plan({ page: { size: 1, after: cursor } }),
      );
      expect((error as InvalidCursorError).reason).toBe('signature');
    });
  });

  describe('page (SPEC 3.6, 3.5)', () => {
    const define = createDefineKeyset({
      cursor: { secret: SECRET },
      page: { default: 10, max: 50, range: true },
    });

    it('applies the default bounds to a definition without page', () => {
      expect(define(ITEMS).definition.page).toEqual({
        default: 10,
        max: 50,
        range: true,
      });
    });

    it('merges the definition member by member', () => {
      expect(define({ ...ITEMS, page: { max: 30 } }).definition.page).toEqual({
        default: 10,
        max: 30,
        range: true,
      });
      expect(
        define({ ...ITEMS, page: { range: false } }).definition.page.range,
      ).toBe(false);
    });

    it('validates the merged bounds like any definition', () => {
      expect(message(() => define({ ...ITEMS, page: { max: 5 } }))).toBe(
        'page.default must not exceed page.max',
      );
    });
  });

  describe('search (SPEC 3.6, 3.4)', () => {
    const define = createDefineKeyset({
      cursor: { secret: SECRET },
      search: { config: 'english' },
    });

    it('gives full-text searches that name no configuration the default', () => {
      expect(
        define({ ...ITEMS, search: { columns: ['name'] } }).definition.search,
      ).toEqual({
        mode: 'websearch',
        source: { columns: ['name'] },
        config: 'english',
      });
      expect(
        define({ ...ITEMS, search: { vector: 'search_vector', mode: 'plain' } })
          .definition.search,
      ).toEqual({
        mode: 'plain',
        source: { vector: 'search_vector' },
        config: 'english',
      });
    });

    it('keeps the configuration a definition names, like searches, and no search', () => {
      expect(
        define({ ...ITEMS, search: { columns: ['name'], config: 'simple' } })
          .definition.search,
      ).toMatchObject({ config: 'simple' });
      expect(
        define({ ...CONTACTS, cursor: undefined }).definition.search,
      ).toEqual({ mode: 'like', columns: ['first_name', 'last_name'] });
      expect(define(ITEMS).definition.search).toBeNull();
    });
  });

  describe('defaults are checked at startup', () => {
    it.each([
      [
        { cursor: { secret: 'short' } },
        'cursor.secret must be at least 32 bytes',
      ],
      [{ cursor: 'secret' }, 'cursor must be an object'],
      [
        { cursor: { secret: SECRET, ttl: 0 } },
        'cursor.ttl must be a positive integer of seconds',
      ],
      [{ page: 5 }, 'page must be an object'],
      [{ page: { max: 0 } }, 'page.max must be a positive integer'],
      [{ page: { default: 2.5 } }, 'page.default must be a positive integer'],
      [
        { page: { default: 30, max: 20 } },
        'page.default must not exceed page.max',
      ],
      [{ page: { range: 'yes' } }, 'page.range must be a boolean'],
      [{ search: 'english' }, 'search must be an object'],
      [
        { search: { config: 'English-US' } },
        'search.config must match ^[a-z_][a-z0-9_]{0,62}$',
      ],
    ])('rejects %j', (defaults, expected) => {
      expect(message(() => createDefineKeyset(defaults as never))).toBe(
        expected,
      );
    });

    it('rejects defaults that are not an object', () => {
      expect(message(() => createDefineKeyset(null as never))).toBe(
        'createDefineKeyset requires an object',
      );
    });

    it('leaves a bound the defaults omit to the definition', () => {
      const define = createDefineKeyset({
        cursor: { secret: SECRET },
        page: { default: 150 },
      });
      expect(define({ ...ITEMS, page: { max: 200 } }).definition.page).toEqual({
        default: 150,
        max: 200,
        range: false,
      });
      expect(message(() => define(ITEMS))).toBe(
        'page.default must not exceed page.max',
      );
    });
  });

  it('rejects definition members that are not objects instead of dropping them', () => {
    const define = createDefineKeyset({
      cursor: { secret: SECRET },
      page: { max: 50 },
      search: { config: 'english' },
    });
    expect(message(() => define(null as never))).toBe(
      'defineKeyset requires an object',
    );
    expect(message(() => define({ ...ITEMS, page: 5 as never }))).toBe(
      'page must be an object',
    );
    expect(message(() => define({ ...ITEMS, cursor: 'x' as never }))).toBe(
      'cursor must be an object',
    );
    expect(message(() => define({ ...ITEMS, search: 1 as never }))).toBe(
      'search must be an object',
    );
  });
});
