/**
 * Reads a generated Kysely types file back as data, each table's select
 * types by column and each enum's labels, and checks a value node-postgres
 * returned against a declared type. Only the types `renderKyselyTypes`
 * writes are understood; anything else fails loudly.
 */
export interface DeclaredTypes {
  /** By the `DB` key, the select type of each column, in order. */
  readonly tables: ReadonlyMap<string, ReadonlyMap<string, string>>;
  /** By TypeScript name. */
  readonly enums: ReadonlyMap<string, ReadonlyArray<string>>;
}

const ENUM = /^export type (\w+) = (.+);$/u;
const INTERFACE = /^export interface (\w+) \{\}?$/u;
const MEMBER = /^ {2}(.+?): (.+);$/u;
const WRAPPED = /^(ColumnType|Generated|GeneratedAlways)<(.+)>$/u;
const ARRAY = /^Array<(.+)>$/u;
const OPEN = new Set(['<', '{', '(']);
const CLOSE = new Set(['>', '}', ')']);

/** `text` split at `separator` outside brackets. */
function split(text: string, separator: string): ReadonlyArray<string> {
  const parts: Array<string> = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const character = text.charAt(index);
    if (OPEN.has(character)) {
      depth += 1;
    } else if (CLOSE.has(character)) {
      depth -= 1;
    } else if (depth === 0 && text.startsWith(separator, index)) {
      parts.push(text.slice(start, index));
      start = index + separator.length;
    }
  }
  return [...parts, text.slice(start)];
}

function unquote(text: string): string {
  return text.startsWith("'") ? text.slice(1, -1).replaceAll("\\'", "'") : text;
}

/** The select type of a member type: `ColumnType`'s first argument, or what `Generated` wraps. */
function selectType(type: string): string {
  const [, wrapper, inner = type] = WRAPPED.exec(type) ?? [];
  return wrapper === 'ColumnType' ? (split(inner, ', ')[0] ?? inner) : inner;
}

function interfaces(
  text: string,
): ReadonlyMap<string, ReadonlyMap<string, string>> {
  const found = new Map<string, Map<string, string>>();
  let current: Map<string, string> | undefined;
  for (const line of text.split('\n')) {
    const start = INTERFACE.exec(line);
    const member = MEMBER.exec(line);
    if (start !== null) {
      current = new Map();
      found.set(start[1] ?? '', current);
    } else if (line === '}') {
      current = undefined;
    } else if (member !== null && current !== undefined) {
      current.set(unquote(member[1] ?? ''), member[2] ?? '');
    }
  }
  return found;
}

export function readDeclaredTypes(text: string): DeclaredTypes {
  const all = interfaces(text);
  const tables = [...(all.get('DB') ?? [])].map(
    ([key, name]): [string, ReadonlyMap<string, string>] => [
      key,
      new Map(
        [...(all.get(name) ?? [])].map(([column, type]) => [
          column,
          selectType(type),
        ]),
      ),
    ],
  );
  const enums = text
    .split('\n')
    .flatMap((line): Array<[string, ReadonlyArray<string>]> => {
      const [, name, union = ''] = ENUM.exec(line) ?? [];
      return name === undefined || !union.startsWith("'")
        ? []
        : [[name, split(union, ' | ').map((label) => unquote(label))]];
    });
  return { tables: new Map(tables), enums: new Map(enums) };
}

function isJson(value: unknown): boolean {
  if (
    value === null ||
    ['string', 'number', 'boolean'].includes(typeof value)
  ) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every((element) => isJson(element));
  }
  return (
    typeof value === 'object' &&
    Object.values(value).every((element) => isJson(element))
  );
}

const CHECKS: ReadonlyMap<string, (value: unknown) => boolean> = new Map([
  ['null', (value: unknown) => value === null],
  ['string', (value: unknown) => typeof value === 'string'],
  ['number', (value: unknown) => typeof value === 'number'],
  ['boolean', (value: unknown) => typeof value === 'boolean'],
  [
    'Date',
    (value: unknown) => value instanceof Date && !Number.isNaN(value.getTime()),
  ],
  ['JsonValue', isJson],
]);

/** Whether `value` has the declared type `type`. */
export function hasType(
  value: unknown,
  type: string,
  declared: DeclaredTypes,
): boolean {
  const options = split(type, ' | ');
  if (options.length > 1) {
    return options.some((option) => hasType(value, option, declared));
  }
  const element = ARRAY.exec(type)?.[1];
  if (element !== undefined) {
    return (
      Array.isArray(value) &&
      value.every((item) => hasType(item, element, declared))
    );
  }
  const labels = declared.enums.get(type);
  if (labels !== undefined) {
    return typeof value === 'string' && labels.includes(value);
  }
  const check = CHECKS.get(type);
  if (check === undefined) {
    throw new Error(`no runtime check for the declared type ${type}`);
  }
  return check(value);
}
