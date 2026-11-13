// The versions of the profiles of the fixture library (see docs/fixture-library.md): every profile the library holds is a
// version of its fixture, with a uuid of its own (`<manufacturer>/<fixture-key>~<version id>`), which a project keeps
// with its copy of the profile. What is known about a version comes with it: where it comes from, the votes on its
// modes, how many projects and devices use it and which version of its fixture is the best one.

// where a version comes from: the Open Fixture Library, the AI (generated from a manual) or a user (offered from a file)
export type FixtureOrigin = 'ofl' | 'ai' | 'user';

// what the votes on a version or a mode tell about it
export type FixtureVersionState = 'confirmed' | 'open' | 'problem';

// one mode of a version: its state, the votes on it and the hash of what it does, which is the same in every version
// of the fixture having the mode unchanged
export interface FixtureModeState {
  shortName: string;
  name: string;
  hash: string;
  state: FixtureVersionState;
  good: number;
  bad: number;
}

// the manual a generated version was read from: the public address it was read from, or the name of the file
export interface FixtureManual {
  url?: string;
  name?: string;
}

// one version of a profile, as the library lists it (the VersionInfo of the API)
export interface FixtureVersion {
  uuid: string;
  fixture?: string;
  manufacturerShortName?: string;
  manufacturerName?: string;
  name?: string;
  mainCategory?: string;
  origin?: FixtureOrigin;
  state?: FixtureVersionState;
  confirmations?: number;
  problems?: number;
  usage?: number;
  versions?: number;
  best?: boolean;
  bestUuid?: string;
  currentOfl?: boolean;
  hidden?: boolean;
  retired?: boolean;
  created?: string;
  parentUuid?: string;
  manual?: FixtureManual;
  modeStates?: FixtureModeState[];
}

// what a badge says about the state of a version or a mode: confirmed by a number of users, a number of reported
// problems, or not confirmed yet
export interface FixtureStateBadge {
  state: 'confirmed' | 'problems' | 'unconfirmed';
  count: number;
}

// Why the library has a better version for a fixture of a project than the one its copy is: its mode is a problem, its
// version is hidden, or the best version of the fixture does the mode differently. The best version comes along.
export interface FixtureBetterVersion {
  reason: 'problem' | 'hidden' | 'changed';
  version: FixtureVersion;
}

// Does the uuid name a version of the library? A plain uuid (`<manufacturer>/<fixture-key>`) names a fixture, no
// version: the copy of a project older than the versions, or a profile from a file.
export function isVersionUuid(uuid: string): boolean {
  return typeof uuid === 'string' && uuid.indexOf('~') >= 0;
}

// A profile file may not take a uuid which looks like the one of a version of the library: its keys can't hold a "~".
export function hasVersionMark(file: any): boolean {
  return [file?.manufacturerKey, file?.fixtureKey].some((key) => typeof key === 'string' && key.indexOf('~') >= 0);
}

// a version not coming from the Open Fixture Library, which has to be confirmed by the ones using it
export function isGenerated(version: FixtureVersion): boolean {
  return version?.origin === 'ai' || version?.origin === 'user';
}

// the state of a mode of a version, by the short name of the mode (or its name, when it has none)
export function getModeState(version: FixtureVersion, shortName: string): FixtureModeState {
  return (version?.modeStates || []).find((mode) => mode.shortName === shortName);
}

// What a badge says about a version: confirmed by the users who marked one of its modes good, the users who reported a
// problem with one of its modes, or not confirmed yet for an open version of the AI or a user. An open version of the
// Open Fixture Library and a profile the library tells nothing about (an older library, a profile from a file) get none.
export function getVersionStateBadge(version: FixtureVersion): FixtureStateBadge {
  return getStateBadge(version, version?.state, version?.confirmations, version?.problems);
}

// the key of the translation of what a badge says, e.g. designer.fixture-library.state-confirmed, in the singular for one
export function getStateBadgeKey(badge: FixtureStateBadge): string {
  return badge ? 'designer.fixture-library.state-' + badge.state + (badge.count === 1 ? '-one' : '') : undefined;
}

// what a badge says about one mode of a version, like getVersionStateBadge, by the votes on that mode
export function getModeStateBadge(version: FixtureVersion, shortName: string): FixtureStateBadge {
  const mode = getModeState(version, shortName);

  return mode ? getStateBadge(version, mode.state, mode.good, mode.bad) : undefined;
}

function getStateBadge(version: FixtureVersion, state: FixtureVersionState, good: number, bad: number): FixtureStateBadge {
  if (state === 'confirmed') {
    return { state: 'confirmed', count: good || 0 };
  }

  if (state === 'problem') {
    return { state: 'problems', count: bad || 0 };
  }

  return state === 'open' && isGenerated(version) ? { state: 'unconfirmed', count: 0 } : undefined;
}

// The best version of a fixture for a fixture of a project, if it is better than the version of its copy (uuid) in the
// mode the fixture is used in, out of all versions of the fixture: when the mode is a problem, when the version is
// hidden, or when the best version does the mode differently. A best version having the mode unchanged (the same
// hash) would change nothing, so there is no better one then.
export function getBetterVersion(uuid: string, modeShortName: string, versions: FixtureVersion[]): FixtureBetterVersion {
  const current = versions.find((version) => version.uuid === uuid);
  const best = versions.find((version) => version.best);

  if (!current || !best || best.uuid === uuid) {
    return undefined;
  }

  const mode = getModeState(current, modeShortName);

  if (mode && (best.modeStates || []).some((bestMode) => bestMode.hash === mode.hash)) {
    return undefined;
  }

  if (current.hidden) {
    return { reason: 'hidden', version: best };
  }

  if (!mode) {
    return undefined;
  }

  if (mode.state === 'problem') {
    return { reason: 'problem', version: best };
  }

  return getModeState(best, modeShortName) ? { reason: 'changed', version: best } : undefined;
}
