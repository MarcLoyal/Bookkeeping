const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Route params are untrusted strings — validate before using in a `= uuid` query so a bad id 404s instead of crashing the DB driver. */
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}
