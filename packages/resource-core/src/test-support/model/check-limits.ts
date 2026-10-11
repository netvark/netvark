/**
 * The limits property (SPEC 8): each member's `limits`, and an array's
 * element's, against the model's fold, bounds compared by value.
 * Not published with the package.
 * @packageDocumentation
 */
import type { FieldLimits } from '../../meta/types';
import type { Subject } from './check-support';
import type { ModelBound } from './decimal';
import type { ModelLimits } from './limits';

import { differ, sorted, valueSource } from './check-support';
import { canonicalDecimal } from './decimal';
import { levelLimits } from './limits';
import { columnRules, levelOf } from './value-levels';

function canonicalBound(bound: ModelBound | null): ModelBound | null {
  return bound === null
    ? null
    : { ...bound, value: canonicalDecimal(bound.value) };
}

/** One spelling per bound and step, so limits compare by value. */
function canonical(limits: ModelLimits): ModelLimits {
  const step =
    limits.multipleOf === null ? null : canonicalDecimal(limits.multipleOf);
  return {
    ...limits,
    lower: canonicalBound(limits.lower),
    upper: canonicalBound(limits.upper),
    multipleOf: step,
  };
}

/** Metadata limits in the model's terms; both bounds of one side set at once is a problem of its own. */
function asModel(limits: FieldLimits): ModelLimits {
  const lower = limits.minimum ?? limits.exclusiveMinimum;
  const upper = limits.maximum ?? limits.exclusiveMaximum;
  return canonical({
    minLength: limits.minLength,
    maxLength: limits.maxLength,
    lower:
      lower === null
        ? null
        : { value: lower, inclusive: limits.minimum !== null },
    upper:
      upper === null
        ? null
        : { value: upper, inclusive: limits.maximum !== null },
    multipleOf: limits.multipleOf,
    patterns: sorted(limits.patterns),
  });
}

export function limitsProblems(subject: Subject): Array<string> {
  return subject.declaration.members.flatMap((member) => {
    if (member.codec) {
      return [];
    }
    const meta = subject.resource.fields[member.name]!;
    const [source, column] = valueSource(subject, member);
    const level = levelOf(subject.catalog, source.columns[column]!);
    const where = `fields.${member.name}.limits`;
    const both =
      (meta.limits.minimum !== null && meta.limits.exclusiveMinimum !== null) ||
      (meta.limits.maximum !== null && meta.limits.exclusiveMaximum !== null);
    return [
      ...(both ? [`${where}: both bounds of one side`] : []),
      ...differ(
        where,
        canonical(levelLimits(level, columnRules(source, column))),
        asModel(meta.limits),
      ),
      ...(level.element === null
        ? []
        : differ(
            `fields.${member.name}.items.limits`,
            canonical(levelLimits(level.element, [])),
            asModel(meta.items!.limits),
          )),
    ];
  });
}
