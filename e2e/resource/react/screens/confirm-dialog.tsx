/**
 * The dialog a person confirms an action in, as WAI-ARIA's modal dialog
 * pattern writes one: labeled by its title, described by its body, and
 * answered by its buttons, the confirming one named by the action. Its
 * texts are an action's confirmation for what the action's texts take: a
 * record, or a selection's count (resource SPEC 21.2, 21.3).
 * @ref https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
 */
import type { ReactElement } from 'react';

import { useId } from 'react';

/** What the dialog shows: its title, its body, `null` without one, and its confirming button's label. */
export interface ConfirmTexts {
  readonly title: string;
  readonly body: string | null;
  readonly confirm: string;
}

/** A confirmation as the models hold one, for what its texts take. */
interface HeldConfirm<TInput> {
  readonly title: (input: TInput) => string;
  readonly body: ((input: TInput) => string) | null;
  readonly confirm: ((input: TInput) => string) | null;
}

/** The dialog's texts of `action` for `input`, its button the action's label where it gives none; `null` without a confirmation. */
export function confirmTexts<TInput>(
  action: {
    readonly label: () => string;
    readonly confirm: HeldConfirm<TInput> | null;
  },
  input: TInput,
): ConfirmTexts | null {
  const { label, confirm } = action;
  return confirm === null
    ? null
    : {
        title: confirm.title(input),
        body: confirm.body?.(input) ?? null,
        confirm: confirm.confirm?.(input) ?? label(),
      };
}

/** The props of `ConfirmDialog`. */
export interface ConfirmDialogProps {
  readonly texts: ConfirmTexts;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}

/** A modal dialog of `texts`, cancelled or confirmed by its buttons. */
export function ConfirmDialog({
  texts,
  onCancel,
  onConfirm,
}: ConfirmDialogProps): ReactElement {
  const id = useId();
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${id}-title`}
      aria-describedby={texts.body === null ? undefined : `${id}-body`}
    >
      <h2 id={`${id}-title`}>{texts.title}</h2>
      {texts.body === null ? null : <p id={`${id}-body`}>{texts.body}</p>}
      <button type="button" onClick={onCancel}>
        Abbrechen
      </button>
      <button type="button" onClick={onConfirm}>
        {texts.confirm}
      </button>
    </div>
  );
}
