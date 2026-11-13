import { FixtureCapability, FixtureCapabilityType } from './fixture-capability';
import { FixtureChannel } from './fixture-channel';
import { FixtureProfile } from './fixture-profile';
import { FixtureVersion } from './fixture-version';

// The fixture profiles the AI makes from the manual of a fixture (see docs/fixture-library.md, section 10), as the API
// of the online designer answers them (ai-fixtures), directly or through a Rocket Show device.

// can the user have profiles made, how many they made today and how large a manual may be
export interface AiFixturesStatus {
  available: boolean;
  requestsLast24Hours?: number;
  requestsPerUserPerDay?: number;
  maxManualBytes?: number;
  maxInputTokens?: number;
}

// where the AI read a channel in the manual: the page, the row there word for word, whether that row was found on the
// page (where the manual has text), and what the AI wasn't sure about
export interface FixtureReviewNote {
  page: number;
  quote: string;
  verified: boolean;
  uncertain: string;
}

// what the AI tells about a profile it made, by the keys of its channels
export interface FixtureReview {
  channels: { [channelKey: string]: FixtureReviewNote };
  uncertain: string[];
  manualUrl?: string;
}

// what the library already has for a fixture: its versions, and the ones made from the manual given
export interface AiFixturesLookup {
  versions: FixtureVersion[];
  manualKnown: boolean;
}

// What the AI is asked for: a profile of a manufacturer of the library (or a new one, by its name) and a model, from a
// manual, a link to one, or the manual it searches itself; in one mode, if the user only needs that one. Or a better
// version of a version (its uuid), from the same manual, as the instruction says.
export interface AiFixturesRequest {
  manual?: File;
  link?: string;
  manufacturerShortName?: string;
  manufacturerName?: string;
  model?: string;
  mode?: string;
  parentUuid?: string;
  instruction?: string;
}

// the profile the AI made, stored as a new version, with what it tells about it
export interface AiFixturesResponse {
  version: FixtureVersion;
  profile: any;
  review: FixtureReview;
  requestsLast24Hours: number;
  requestsPerUserPerDay: number;
}

// what went wrong, as the key of the translation, with what it names
export interface AiFixturesError {
  key: string;
  params?: { [name: string]: any };
  // what was still wrong with a profile the AI couldn't make right
  errors?: string[];
}

// One channel of a mode in the review of a generated profile: where the AI read it (see FixtureReviewNote, undefined
// where it doesn't say) and whether it resets the fixture, switches its lamp (maintenance) or strobes. Those stand out
// with their ranges: the fixture pool has buttons for the maintenance, and a wrong range could fire during a show.
export interface FixtureReviewChannel {
  // the name of the channel in the mode, undefined for a channel the mode leaves unused
  name: string;
  // where it is in the mode, counted from 1; undefined for one repeated for every pixel
  number: number;
  perPixel: boolean;
  note: FixtureReviewNote;
  maintenance: boolean;
  strobe: boolean;
  ranges: { range: number[]; label: string }[];
}

export interface FixtureReviewMode {
  name: string;
  shortName: string;
  channels: FixtureReviewChannel[];
}

const errorPrefix = 'designer.fixture-ai.error.';
const knownErrors = [
  'ai-unavailable',
  'ai-user-limit-reached',
  'ai-limit-reached',
  'ai-no-manual',
  'ai-refused',
  'ai-incomplete',
  'ai-busy',
  'wrong-parameters',
  'unknown-version',
];

// What to tell the user about a request for a profile which failed. A request refused for want of an account is told
// apart before (see UserEnsureLoginService.isRefused).
export function getAiFixturesError(error: any): AiFixturesError {
  const body = error?.error;
  const code = typeof body?.error === 'string' ? body.error : undefined;

  // (the web server of a device refuses a manual too large for it without asking the API)
  if (code === 'ai-manual-too-large' || error?.status === 413) {
    return typeof body?.maxInputTokens === 'number'
      ? { key: errorPrefix + 'ai-manual-too-long', params: { inputTokens: body.inputTokens, maxInputTokens: body.maxInputTokens } }
      : { key: errorPrefix + 'ai-manual-too-large' };
  }

  if (code === 'ai-invalid-profile') {
    return { key: errorPrefix + code, errors: Array.isArray(body.errors) ? body.errors : [] };
  }

  if (knownErrors.indexOf(code) >= 0) {
    return { key: errorPrefix + code };
  }

  // a device can't forward the request to the online designer
  if (code === 'api-unreachable') {
    return { key: 'designer.device.api-unreachable' };
  }

  // a web server on the way, or the device forwarding the request, gave up waiting: the profile may still be made
  if (code === 'api-timeout' || error?.status === 504) {
    return { key: errorPrefix + 'ai-timeout' };
  }

  return { key: errorPrefix + 'ai-failed' };
}

function isMaintenance(capability: FixtureCapability): boolean {
  return capability.type === FixtureCapabilityType.Maintenance;
}

function isStrobe(capability: FixtureCapability): boolean {
  return (
    (capability.type === FixtureCapabilityType.ShutterStrobe && ['Open', 'Closed'].indexOf(capability.shutterEffect) < 0) ||
    capability.type === FixtureCapabilityType.StrobeSpeed ||
    capability.type === FixtureCapabilityType.StrobeDuration
  );
}

// The review of a generated profile, mode by mode: each channel the mode lists with where the AI read it (see
// FixtureReviewChannel). A fine channel is read where its coarse channel is. The channels a mode repeats for every
// pixel are listed once; the number of the pixels they are repeated for (see FixtureService.getPixelsInOrder) moves
// the channels after them on.
export function buildFixtureReview(
  profile: FixtureProfile,
  review: FixtureReview,
  pixelCount: (repeatFor: string[]) => number
): FixtureReviewMode[] {
  // the channels by every name a mode may list them by, with the key the review knows them by
  const channels = new Map<string, { key: string; channel: FixtureChannel }>();

  for (const available of [profile.templateChannels, profile.availableChannels]) {
    for (const key of Object.keys(available)) {
      const channel: FixtureChannel = available[key];

      for (const name of [key, ...channel.fineChannelAliases]) {
        channels.set(name, { key, channel });
      }
    }
  }

  const reviewChannel = (name: string, number: number, perPixel: boolean): FixtureReviewChannel => {
    const found = channels.get(name);
    const capabilities = found ? (found.channel.capability ? [found.channel.capability] : found.channel.capabilities) : [];

    return {
      name,
      number,
      perPixel,
      note: found ? review?.channels?.[found.key] : undefined,
      maintenance: capabilities.some(isMaintenance),
      strobe: capabilities.some(isStrobe),
      ranges: capabilities
        .filter((capability) => isMaintenance(capability) || isStrobe(capability))
        .map((capability) => ({ range: capability.dmxRange, label: capability.comment || capability.shutterEffect || capability.type })),
    };
  };

  return profile.modes.map((mode) => {
    const modeChannels: FixtureReviewChannel[] = [];
    let number = 1;

    for (const modeChannel of mode.channels) {
      if (modeChannel.insert === 'matrixChannels') {
        for (const name of modeChannel.templateChannels) {
          modeChannels.push(reviewChannel(name, undefined, true));
        }

        number += pixelCount(modeChannel.repeatFor) * modeChannel.templateChannels.length;
      } else {
        modeChannels.push(reviewChannel(modeChannel.name, number++, false));
      }
    }

    return { name: mode.name, shortName: mode.shortName || mode.name, channels: modeChannels };
  });
}
