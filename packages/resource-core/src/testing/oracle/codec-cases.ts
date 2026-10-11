/**
 * The cases of the codecs a resource's fields name (SPEC 7.1, 7.3): each
 * codec's fixtures written through its storage codec into a copy of the
 * field's column, whose type and domains alone judge them. The database
 * must store each fixture, and the storage codec must read the stored text
 * back as the fixture, a value the codec's schema accepts: the fixtures
 * are round-trip values, so each is written as the server reads it back.
 * @packageDocumentation
 */
import type { Codec } from '../../codecs/types';
import type { DeclaredInternals } from '../../declare/declared-resource';
import type { MemberSpec } from '../../schema/field-spec';
import type { TextStorage, TextStorageCodec } from './members';
import type { OracleCase, OracleFixture, OracleVerdict } from './types';

import { describe } from '../../internal/object';
import { accepts, storageOf, writeText } from './members';
import { sameJson } from './same-json';
import { refusal } from './verdict';

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** How the round trip of `fixture` went wrong, or `undefined`. */
function roundTrip(
  codec: Codec,
  storage: TextStorageCodec,
  fixture: unknown,
  verdict: OracleVerdict,
): string | undefined {
  if (!verdict.accepted) {
    return `the database refuses it (${refusal(verdict)})`;
  }
  const [stored = null] = verdict.stored;
  if (stored === null) {
    return 'the database stores NULL';
  }
  let back: unknown;
  try {
    back = storage.read(stored);
  } catch (error) {
    return `the storage codec's read throws on ${stored}: ${reason(error)}`;
  }
  if (!sameJson(back, fixture)) {
    return `the database stores ${stored}, which reads back as ${describe(back)}`;
  }
  return accepts(codec.schema, back)
    ? undefined
    : `it reads back as a value the codec's schema refuses`;
}

function codecCase(
  internals: DeclaredInternals,
  spec: MemberSpec,
  name: string,
  codec: Codec,
  storage: TextStorage,
): OracleCase {
  const { resource } = internals;
  const stored = storageOf(storage, name, internals, spec);
  return {
    subject: `${resource.names.type}.${spec.name} (codec ${name})`,
    kind: 'codec',
    probe: {
      kind: 'columns',
      table: resource.table,
      columns: [spec.column],
      checks: [],
      notNull: true,
    },
    fixtures: codec.fixtures.map((value, index): OracleFixture => {
      const label = `fixtures[${String(index)}]`;
      try {
        return {
          label,
          value,
          texts: [writeText(stored, value)],
          judge: (verdict) => roundTrip(codec, stored, value, verdict),
        };
      } catch (error) {
        return {
          label,
          value,
          unwritable: `the storage codec cannot write it: ${reason(error)}`,
        };
      }
    }),
  };
}

/** The cases of the codecs a resource's fields name, one per field. */
export function codecCases(
  internals: DeclaredInternals,
  storage: TextStorage,
): ReadonlyArray<OracleCase> {
  return internals.specs.fields.flatMap((spec) => {
    const { form } = spec.value;
    return form.kind === 'codec'
      ? [codecCase(internals, spec, form.name, form.codec, storage)]
      : [];
  });
}
