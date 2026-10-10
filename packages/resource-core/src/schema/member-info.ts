/**
 * What the issue mapping needs to know about each member (SPEC 6.4): whether
 * its JSON type is `integer`, and the codec that owns its representation.
 * @packageDocumentation
 */
import type { FindMember, MemberInfo } from './issues';
import type { ValueForm, ValueSpec } from './value-form';

function isInteger(form: ValueForm): boolean {
  return (
    form.kind === 'number' && (form.type === 'int2' || form.type === 'int4')
  );
}

/** The issue mapping's facts about a member whose value has `spec`. */
export function memberInfo(spec: ValueSpec): MemberInfo {
  const { form } = spec;
  return {
    integer: isInteger(form),
    integerElements: form.kind === 'array' && isInteger(form.element.form),
    codec: form.kind === 'codec' ? form.name : undefined,
  };
}

/**
 * Finds the member of an issue path whose first `prefix` keys lead to an
 * object of `members`; a path that ends at the object, or leads to a key
 * it does not hold, has no member.
 */
export function memberFinder(
  members: ReadonlyMap<string, MemberInfo>,
  prefix = 0,
): FindMember {
  return (path) => {
    const name = path[prefix];
    const info = typeof name === 'string' ? members.get(name) : undefined;
    return info === undefined
      ? undefined
      : { info, depth: path.length - prefix - 1 };
  };
}
