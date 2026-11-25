// Picks the Firebase Hosting preview channels to delete (.github/workflows/deploy.yml, job "previews").
// Input: the JSON of `firebase hosting:channel:list --json`; a pull request number, or nothing.
// Output, one id per line: that pull request's channels ("pr<n>-…"), or with no number every channel
// but "live". The live channel is never listed.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * The channel ids to delete from a channel listing.
 * @param {unknown} listing the parsed `hosting:channel:list --json` output
 * @param {string | number | undefined} pr a pull request number; empty: every preview channel
 * @returns {string[]}
 */
export function previewChannels(listing, pr) {
  const result = /** @type {{ result?: unknown }} */ (listing)?.result;
  const channels = Array.isArray(result) ? result : Array.isArray(/** @type {{ channels?: unknown }} */ (result)?.channels) ? result.channels : [];
  const ids = channels.map((c) => String(c?.name ?? '').split('/').pop() ?? '').filter((id) => id !== '' && id !== 'live');
  const n = String(pr ?? '').trim();
  return n === '' ? ids : ids.filter((id) => id.startsWith(`pr${n}-`));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const listing = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  for (const id of previewChannels(listing, process.argv[3])) console.log(id);
}
