/**
 * Orders strings by UTF-16 code units, the order `Array.prototype.sort`
 * uses without a comparator, so the database's collation never decides the
 * order of anything written (SPEC 2.10).
 * @ref https://tc39.es/ecma262/#sec-islessthan
 */
export function compareCodeUnits(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}
