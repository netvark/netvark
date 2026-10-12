/**
 * The fixture catalogs the hydration test and the runtime smoke compile
 * (SPEC 7.2, 7.3), in the message-format plugin's format: values to isolate,
 * a date the application formats and interpolates, and a plural that selects
 * its form on the raw `count` and prints the formatted `countText` (ADR 0008).
 * No message formats, so the binding's refusal lets them through.
 * @ref https://inlang.com/m/reootnfj/plugin-inlang-messageFormat
 */

/** A catalog per locale, the base locale first. */
export type Catalogs = Readonly<
  Record<string, Readonly<Record<string, unknown>>>
>;

const COUNT_DECLARATIONS = [
  'input count',
  'input countText',
  'local countPlural = count: plural',
];

/** A plural over `count`, one variant per form. */
function plural(
  forms: Readonly<Record<string, string>>,
): ReadonlyArray<Record<string, unknown>> {
  return [
    {
      declarations: COUNT_DECLARATIONS,
      selectors: ['countPlural'],
      match: Object.fromEntries(
        Object.entries(forms).map(([form, text]) => [
          `countPlural=${form}`,
          text,
        ]),
      ),
    },
  ];
}

export const CATALOGS: Catalogs = {
  en: {
    shared_by: 'Shared by {name} ({count})',
    due: 'Due {date}',
    items: plural({ one: '{countText} item', other: '{countText} items' }),
  },
  ar: {
    shared_by: 'شاركه {name} ({count})',
    due: 'الاستحقاق {date}',
    items: plural({
      zero: 'لا عناصر',
      one: 'عنصر واحد',
      two: 'عنصران',
      few: '{countText} عناصر',
      many: '{countText} عنصرًا',
      other: '{countText} عنصر',
    }),
  },
};
