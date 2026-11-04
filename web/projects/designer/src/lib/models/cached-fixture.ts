import { CachedFixtureChannel } from './cached-fixture-channel';
import { CachedFixturePixel } from './cached-fixture-pixel';
import { Fixture } from './fixture';
import { FixtureMode } from './fixture-mode';
import { FixtureProfile } from './fixture-profile';
import { PixelContext } from './pixel-pattern';

export class CachedFixture {
  fixture: Fixture;
  pixel: CachedFixturePixel;
  profile: FixtureProfile;
  mode: FixtureMode;
  channels: CachedFixtureChannel[] = [];

  // where the part is in its fixture, for the pixel effects (see FixtureService.getPixelPlace), worked out once
  pixelPlace: PixelContext;
}
