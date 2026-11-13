import { HttpErrorResponse } from '@angular/common/http';

import { buildFixtureReview, FixtureReview, getAiFixturesError } from './ai-fixtures';
import { FixtureProfile } from './fixture-profile';

// What the designer makes of the answers about the profiles of the AI: what it tells the user when a request fails,
// and the review of a profile, channel by channel, with where the AI read each one in the manual.
describe('AI fixture profiles', () => {
  function httpError(status: number, error: any): HttpErrorResponse {
    return new HttpErrorResponse({ status, error });
  }

  describe('the errors', () => {
    const prefix = 'designer.fixture-ai.error.';

    it('tells how long a manual may be, or that it is too large to be uploaded', () => {
      expect(getAiFixturesError(httpError(413, { error: 'ai-manual-too-large', inputTokens: 520000, maxInputTokens: 400000 }))).toEqual({
        key: prefix + 'ai-manual-too-long',
        params: { inputTokens: 520000, maxInputTokens: 400000 },
      });
      expect(getAiFixturesError(httpError(413, { error: 'ai-manual-too-large' }))).toEqual({ key: prefix + 'ai-manual-too-large' });

      // the web server of a device refuses it without asking the API
      expect(getAiFixturesError(httpError(413, '<html>Request Entity Too Large</html>'))).toEqual({ key: prefix + 'ai-manual-too-large' });
    });

    it('lists what was still wrong with a profile the AI could not make right', () => {
      expect(getAiFixturesError(httpError(502, { error: 'ai-invalid-profile', errors: ['Mode 8ch lists 9 channels'] }))).toEqual({
        key: prefix + 'ai-invalid-profile',
        errors: ['Mode 8ch lists 9 channels'],
      });
      expect(getAiFixturesError(httpError(502, { error: 'ai-invalid-profile' }))).toEqual({
        key: prefix + 'ai-invalid-profile',
        errors: [],
      });
    });

    it('names the errors of the API it knows, a web server giving up waiting, and something gone wrong otherwise', () => {
      for (const code of ['ai-unavailable', 'ai-user-limit-reached', 'ai-limit-reached', 'ai-no-manual', 'ai-busy', 'unknown-version']) {
        expect(getAiFixturesError(httpError(400, { error: code }))).toEqual({ key: prefix + code });
      }

      expect(getAiFixturesError(httpError(504, 'Gateway Timeout'))).toEqual({ key: prefix + 'ai-timeout' });

      // a device which can't reach the online designer, or gave up waiting for it
      expect(getAiFixturesError(httpError(502, { error: 'api-unreachable' }))).toEqual({ key: 'designer.device.api-unreachable' });
      expect(getAiFixturesError(httpError(504, { error: 'api-timeout' }))).toEqual({ key: prefix + 'ai-timeout' });

      expect(getAiFixturesError(httpError(502, { error: 'something-new' }))).toEqual({ key: prefix + 'ai-failed' });
      expect(getAiFixturesError(new Error('broken'))).toEqual({ key: prefix + 'ai-failed' });
      expect(getAiFixturesError(undefined)).toEqual({ key: prefix + 'ai-failed' });
    });
  });

  describe('the review', () => {
    // a moving head with a fine dimmer, a strobe, a channel resetting it, a shutter which only opens and closes, the
    // speed of the strobe and a color for each of its four pixels
    const profile = new FixtureProfile({
      name: 'Head',
      matrix: { pixelKeys: [['1', '2', '3', '4']] },
      availableChannels: {
        Dimmer: { fineChannelAliases: ['Dimmer fine'], capability: { type: 'Intensity' } },
        Strobe: {
          capabilities: [
            { dmxRange: [0, 9], type: 'ShutterStrobe', shutterEffect: 'Open' },
            { dmxRange: [10, 255], type: 'ShutterStrobe', shutterEffect: 'Strobe', comment: 'Strobe slow to fast' },
          ],
        },
        Control: {
          capabilities: [
            { dmxRange: [0, 199], type: 'NoFunction' },
            { dmxRange: [200, 219], type: 'Maintenance', comment: 'Reset' },
            { dmxRange: [220, 255], type: 'Maintenance' },
          ],
        },
        Shutter: {
          capabilities: [
            { dmxRange: [0, 127], type: 'ShutterStrobe', shutterEffect: 'Closed' },
            { dmxRange: [128, 255], type: 'ShutterStrobe', shutterEffect: 'Open' },
          ],
        },
        'Strobe Speed': { capability: { type: 'StrobeSpeed', speedStart: 'slow', speedEnd: 'fast' } },
      },
      templateChannels: { 'Red $pixelKey': { capability: { type: 'ColorIntensity', color: 'Red' } } },
      modes: [
        {
          name: '11-channel',
          shortName: '11ch',
          channels: [
            'Dimmer',
            'Dimmer fine',
            null,
            'Strobe',
            'Control',
            'Unknown',
            { insert: 'matrixChannels', repeatFor: 'eachPixelABC', channelOrder: 'perPixel', templateChannels: ['Red $pixelKey'] },
            'Shutter',
            'Strobe Speed',
          ],
        },
        { name: 'Basic', channels: ['Dimmer'] },
      ],
    });

    const review: FixtureReview = {
      channels: {
        Dimmer: { page: 12, quote: 'CH1 000-255 Dimmer 0-100%', verified: true, uncertain: null },
        Control: { page: 13, quote: 'CH5 200-219 Reset', verified: false, uncertain: 'The manual names two resets.' },
        'Red $pixelKey': { page: 14, quote: 'CH8-11 Red', verified: true, uncertain: null },
      },
      uncertain: [],
    };

    it('lists the channels of each mode, numbered, with where the AI read them', () => {
      const pixelCounts: any[] = [];
      const modes = buildFixtureReview(profile, review, (repeatFor) => {
        pixelCounts.push(repeatFor);
        return 4;
      });

      expect(modes.map((mode) => [mode.name, mode.shortName])).toEqual([
        ['11-channel', '11ch'],
        ['Basic', 'Basic'],
      ]);
      expect(modes[0].channels.map((channel) => [channel.name, channel.number, channel.perPixel])).toEqual([
        ['Dimmer', 1, false],
        ['Dimmer fine', 2, false],
        [undefined, 3, false],
        ['Strobe', 4, false],
        ['Control', 5, false],
        ['Unknown', 6, false],
        ['Red $pixelKey', undefined, true],
        ['Shutter', 11, false],
        ['Strobe Speed', 12, false],
      ]);
      expect(pixelCounts).toEqual([['eachPixelABC']]);

      // a fine channel is read where its coarse channel is
      expect(modes[0].channels[1].note).toEqual(review.channels.Dimmer);
      expect(modes[0].channels[4].note).toEqual(review.channels.Control);
      expect(modes[0].channels[6].note).toEqual(review.channels['Red $pixelKey']);
      expect(modes[0].channels[3].note).toBeUndefined();
      expect(modes[0].channels[2].note).toBeUndefined();
    });

    it('marks the maintenance and the strobes, with their ranges', () => {
      const channels = buildFixtureReview(profile, review, () => 4)[0].channels;
      const marks = channels.map((channel) => [channel.name, channel.maintenance, channel.strobe]);

      expect(marks).toEqual([
        ['Dimmer', false, false],
        ['Dimmer fine', false, false],
        [undefined, false, false],
        ['Strobe', false, true],
        ['Control', true, false],
        ['Unknown', false, false],
        ['Red $pixelKey', false, false],
        ['Shutter', false, false],
        ['Strobe Speed', false, true],
      ]);
      expect(channels[3].ranges).toEqual([{ range: [10, 255], label: 'Strobe slow to fast' }]);
      expect(channels[4].ranges).toEqual([
        { range: [200, 219], label: 'Reset' },
        { range: [220, 255], label: 'Maintenance' },
      ]);
      expect(channels[8].ranges).toEqual([{ range: [], label: 'StrobeSpeed' }]);
    });

    it('lists the channels without notes where the AI told nothing', () => {
      const channels = buildFixtureReview(profile, undefined, () => 4)[0].channels;

      expect(channels.every((channel) => channel.note === undefined)).toBe(true);
    });
  });
});
