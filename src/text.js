// -----------------------------------------------------------------------------
// Names compared folded: no case, no accent, no punctuation ("Times Sq-42 St"
// and "times sq 42 st" are the same station).
// -----------------------------------------------------------------------------

/**
 * @description Fold a text for comparisons.
 * @param {unknown} value - The text.
 * @returns {string} Lower case, no accent, words separated by one space.
 * @example
 * fold('Times Sq-42 St'); // -> 'times sq 42 st'
 */
function fold(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * @description A slug for an external id.
 * @param {unknown} value - The text.
 * @param {number} [max] - Its longest length.
 * @returns {string} "times-sq-42-st".
 */
function slug(value, max = 40) {
  return fold(value).replace(/ /g, '-').slice(0, max).replace(/-$/, '');
}

export { fold, slug };
