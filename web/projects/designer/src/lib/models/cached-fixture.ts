import { CachedFixtureChannel } from './cached-fixture-channel';
import { CachedFixturePixel } from './cached-fixture-pixel';
import { Fixture } from './fixture';
import { FixtureMode } from './fixture-mode';
import { FixtureProfile } from './fixture-profile';

export class CachedFixture {
  fixture: Fixture;
  pixel: CachedFixturePixel;
  profile: FixtureProfile;
  mode: FixtureMode;
  channels: CachedFixtureChannel[] = [];
}
