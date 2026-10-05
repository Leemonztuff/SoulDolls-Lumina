/**
 * Safe handling of names and values that come from level data (KNOWN_ISSUES LVL-17).
 *
 * Own-key lookups for the constant tables that names from level data index (object types, tile
 * stairs, texture names, tree / critter kinds, particle presets, scripts, colours …):
 * `TABLE[name]` also finds the Object.prototype members ("constructor", "toString",
 * "__proto__", "hasOwnProperty" …), so a hand-written or hostile level file could pass a table
 * test with such a name and then crash on the value. `isOwnKey` / `ownValue` accept only a string
 * that is one of the table's own keys; any other name is unknown, exactly like a misspelt one.
 * Both are allocation-free (safe on per-frame paths).
 *
 * Conversions that never throw: a JSON object with an own `toString` key (`{"toString": 1}`) makes
 * `String(v)`, `${v}`, `Number(v)` and comparisons throw ("Cannot convert object to primitive
 * value": ToPrimitive finds no callable toString / valueOf). `showValue` formats any value for a
 * message, `toText` / `toNumber` convert a value that should be text / a number (load-time code;
 * they are not meant for per-frame paths).
 */

/**
 * Is `key` a string naming one of `table`'s own properties?
 * @template {object} T
 * @param {T} table
 * @param {unknown} key any value (non-strings are never keys)
 * @returns {key is Extract<keyof T, string>}
 */
export function isOwnKey(table, key) {
  return typeof key === 'string' && Object.hasOwn(table, key);
}

/**
 * `table[key]` when `key` is one of the table's own keys (`isOwnKey`), otherwise undefined —
 * so `ownValue(T, name) ?? fallback` takes the fallback for every unknown name.
 * @template {object} T
 * @param {T} table
 * @param {unknown} key any value (non-strings give undefined)
 * @returns {T[keyof T] | undefined}
 */
export function ownValue(table, key) {
  return isOwnKey(table, key) ? table[key] : undefined;
}

/**
 * Text of any value for a warning or error message: a string as it is, anything else as JSON
 * (`5`, `null`, `["house"]`, `{"toString":1}`; undefined → "undefined"). Never throws. Strings,
 * numbers, booleans, null and undefined read exactly as `${v}` would.
 * @param {unknown} v
 * @returns {string}
 */
export function showValue(v) {
  if (typeof v === 'string') return v;
  try {
    return String(JSON.stringify(v));
  } catch {
    return typeof v;
  }
}

/**
 * `String(v)` for a level value that should be text, or `fallback` when String() throws (a JSON
 * object with an own `toString` key): every value String() converts gives the same text as before.
 * @param {unknown} v
 * @param {string} fallback
 * @returns {string}
 */
export function toText(v, fallback) {
  try {
    return String(v);
  } catch {
    return fallback;
  }
}

/**
 * `Number(v)` for a level value that should be a number, or NaN when Number() throws (a JSON
 * object with an own `toString` key and no callable `valueOf`): every value Number() converts
 * gives the same number as before.
 * @param {unknown} v
 * @returns {number}
 */
export function toNumber(v) {
  try {
    return Number(v);
  } catch {
    return NaN;
  }
}
