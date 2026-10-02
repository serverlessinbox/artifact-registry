/** True when a thrown value is an object carrying the given Node `code` (e.g. `MODULE_NOT_FOUND`). */
export function hasErrorCode(err: unknown, code: string): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === code;
}
