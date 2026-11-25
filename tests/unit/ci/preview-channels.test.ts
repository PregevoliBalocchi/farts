// The preview channels the deploy workflow deletes (tools/ci/preview-channels.mjs): never the live site.
import { describe, expect, it } from 'vitest';
import { previewChannels } from '../../../tools/ci/preview-channels.mjs';

const listing = (...ids: string[]) => ({ status: 'success', result: { channels: ids.map((id) => ({ name: `projects/farts-9435d/sites/farts-9435d/channels/${id}` })) } });

describe('previewChannels', () => {
  it('keeps the live channel out, whatever is asked', () => {
    expect(previewChannels(listing('live', 'pr58-riccardo-harden'), '')).toEqual(['pr58-riccardo-harden']);
    expect(previewChannels(listing('live'), undefined)).toEqual([]);
  });

  it('picks only the closed pull request\'s channels, not one whose number starts the same', () => {
    expect(previewChannels(listing('live', 'pr6-a', 'pr60-riccardo-impeccable-', 'pr61-b'), '60')).toEqual(['pr60-riccardo-impeccable-']);
    expect(previewChannels(listing('pr6-a', 'pr60-b'), 6)).toEqual(['pr6-a']);
  });

  it('lists nothing from an empty or unexpected listing', () => {
    expect(previewChannels({}, '')).toEqual([]);
    expect(previewChannels({ result: [] }, '')).toEqual([]);
    expect(previewChannels(null, '5')).toEqual([]);
  });
});
