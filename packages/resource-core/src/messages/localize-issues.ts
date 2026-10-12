/**
 * `localizeIssues(messages)` (SPEC 10.5): the text a client shows for an
 * issue of `write.create` or `write.update` before it sends anything. It
 * is the detail `localizeErrors` gives the error object the server makes
 * of the same issue (SPEC 9.3): a `VALIDATION_FAILED` item at `/data/` and
 * the issue's path, carrying the issue's code as its `reason` and its
 * `expected`. A relationship's issue points one level higher than the
 * server's item, which continues under the relationship's `data`; both
 * name the same member, the only part of the pointer a detail reads.
 * Nothing is cached: a message function reads the locale when it runs, so
 * each call renders in the locale of that moment.
 * @ref https://paraglidejs.com/server-side-rendering
 * @packageDocumentation
 */
import type { ResourceIssue } from '../schema/issues';
import type { Messages } from './types';

import { checkedMessages } from './define-messages';
import { dictionaryOf } from './dictionary';
import { detailOf } from './object-detail';

const CALLER = 'localizeIssues';

/** The code of the object the server makes of a schema issue (SPEC 9.3). */
const CODE = 'VALIDATION_FAILED';

/** The text of an issue of a write to a resource of `type`. */
export type IssueText = (type: string, issue: ResourceIssue) => string;

/**
 * The texts of `write.create` and `write.update` issues in the words of
 * `messages`, which `defineMessages` or `defaultMessages` returned. Throws
 * `TypeError` for messages no definer returned.
 */
export function localizeIssues(messages: Messages): IssueText {
  const checked = checkedMessages(messages);
  if (checked === undefined) {
    throw new TypeError(
      `${CALLER}: messages must be what defineMessages or defaultMessages returned`,
    );
  }
  const dictionary = dictionaryOf(checked);
  const text = dictionary.errors.get(CODE);
  return (type, issue) =>
    detailOf(dictionary, {
      code: CODE,
      text,
      derived: undefined,
      item: {
        detail: issue.message,
        path: ['data', ...issue.path],
        reason: issue.code,
        expected: issue.expected,
      },
      type,
    });
}
