import {
  FixtureVersion,
  getBetterVersion,
  getModeState,
  getModeStateBadge,
  getStateBadgeKey,
  getVersionStateBadge,
  hasVersionMark,
  isGenerated,
  isVersionUuid,
} from './fixture-version';

// What the designer makes of the versions of the library: which uuid names one, what its badges say, and when the
// library has a better version for a fixture of a project than the copy it plays from.
describe('fixture versions', () => {
  // a version of the fixture with a mode in 14 channels and one in 8
  function version(uuid: string, values: Partial<FixtureVersion> = {}): FixtureVersion {
    return {
      uuid,
      fixture: 'stairville/mh-100',
      origin: 'ofl',
      state: 'open',
      modeStates: [
        { shortName: '14ch', name: '14-channel', hash: 'a', state: 'open', good: 0, bad: 0 },
        { shortName: '8ch', name: '8-channel', hash: 'b', state: 'open', good: 0, bad: 0 },
      ],
      ...values,
    };
  }

  it('tells the uuid of a version from the plain uuid of a fixture', () => {
    expect(isVersionUuid('stairville/mh-100~12')).toBe(true);
    expect(isVersionUuid('stairville/mh-100')).toBe(false);
    expect(isVersionUuid(undefined)).toBe(false);
  });

  it('finds a "~" in the keys of a profile file', () => {
    expect(hasVersionMark({ manufacturerKey: 'acme', fixtureKey: 'par~2' })).toBe(true);
    expect(hasVersionMark({ manufacturerKey: 'ac~me', fixtureKey: 'par' })).toBe(true);
    expect(hasVersionMark({ manufacturerKey: 'acme', fixtureKey: 'par' })).toBe(false);
    expect(hasVersionMark({ name: 'no keys', fixtureKey: 3 })).toBe(false);
    expect(hasVersionMark(undefined)).toBe(false);
  });

  it('knows the versions made by the AI and by users from the ones of the Open Fixture Library', () => {
    expect(isGenerated({ uuid: 'a~1', origin: 'ai' })).toBe(true);
    expect(isGenerated({ uuid: 'a~1', origin: 'user' })).toBe(true);
    expect(isGenerated({ uuid: 'a~1', origin: 'ofl' })).toBe(false);
    expect(isGenerated({ uuid: 'a' })).toBe(false);
    expect(isGenerated(undefined)).toBe(false);
  });

  it('finds the state of a mode by its short name', () => {
    expect(getModeState(version('a~1'), '8ch').hash).toBe('b');
    expect(getModeState(version('a~1'), '4ch')).toBeUndefined();
    expect(getModeState({ uuid: 'a' }, '8ch')).toBeUndefined();
    expect(getModeState(undefined, '8ch')).toBeUndefined();
  });

  it('says who confirmed a version, the problems reported, or that one of the AI or a user is not confirmed yet', () => {
    expect(getVersionStateBadge(version('a~1', { state: 'confirmed', confirmations: 3 }))).toEqual({ state: 'confirmed', count: 3 });
    expect(getVersionStateBadge(version('a~1', { state: 'confirmed' }))).toEqual({ state: 'confirmed', count: 0 });
    expect(getVersionStateBadge(version('a~1', { state: 'problem', problems: 2 }))).toEqual({ state: 'problems', count: 2 });
    expect(getVersionStateBadge(version('a~1', { state: 'problem' }))).toEqual({ state: 'problems', count: 0 });
    expect(getVersionStateBadge(version('a~1', { origin: 'ai' }))).toEqual({ state: 'unconfirmed', count: 0 });
    expect(getVersionStateBadge(version('a~1', { origin: 'user' }))).toEqual({ state: 'unconfirmed', count: 0 });

    // an open version of the library itself, and a profile the library tells nothing about
    expect(getVersionStateBadge(version('a~1'))).toBeUndefined();
    expect(getVersionStateBadge({ uuid: 'a', origin: 'ai' })).toBeUndefined();
    expect(getVersionStateBadge(undefined)).toBeUndefined();
  });

  it('says the same of each mode, by the votes on it', () => {
    const modes = version('a~1', {
      origin: 'ai',
      modeStates: [
        { shortName: '14ch', name: '14-channel', hash: 'a', state: 'confirmed', good: 4, bad: 1 },
        { shortName: '8ch', name: '8-channel', hash: 'b', state: 'problem', good: 0, bad: 2 },
        { shortName: '4ch', name: '4-channel', hash: 'c', state: 'open', good: 1, bad: 0 },
      ],
    });

    expect(getModeStateBadge(modes, '14ch')).toEqual({ state: 'confirmed', count: 4 });
    expect(getModeStateBadge(modes, '8ch')).toEqual({ state: 'problems', count: 2 });
    expect(getModeStateBadge(modes, '4ch')).toEqual({ state: 'unconfirmed', count: 0 });
    expect(getModeStateBadge(modes, '2ch')).toBeUndefined();
  });

  it('names the translation of a badge, in the singular for one', () => {
    expect(getStateBadgeKey({ state: 'confirmed', count: 3 })).toBe('designer.fixture-library.state-confirmed');
    expect(getStateBadgeKey({ state: 'problems', count: 1 })).toBe('designer.fixture-library.state-problems-one');
    expect(getStateBadgeKey({ state: 'unconfirmed', count: 0 })).toBe('designer.fixture-library.state-unconfirmed');
    expect(getStateBadgeKey(undefined)).toBeUndefined();
  });

  describe('a better version', () => {
    // the best version does the 14 channels differently, and the 8 channels the same
    const best = version('a~3', {
      best: true,
      modeStates: [
        { shortName: '14ch', name: '14-channel', hash: 'a2', state: 'confirmed', good: 3, bad: 0 },
        { shortName: '8ch', name: '8-channel', hash: 'b', state: 'open', good: 0, bad: 0 },
      ],
    });

    it('is the best version, where it does the mode of the fixture differently', () => {
      expect(getBetterVersion('a~1', '14ch', [best, version('a~1')])).toEqual({ reason: 'changed', version: best });
    });

    it('is none where the best version has the mode unchanged, nothing would change', () => {
      const problem = version('a~1', {
        hidden: true,
        modeStates: [{ shortName: '8ch', name: '8-channel', hash: 'b', state: 'problem', good: 0, bad: 2 }],
      });

      expect(getBetterVersion('a~1', '8ch', [best, problem])).toBeUndefined();
    });

    it('is the best version for a mode which is a problem', () => {
      const problem = version('a~1', {
        modeStates: [{ shortName: '4ch', name: '4-channel', hash: 'c', state: 'problem', good: 0, bad: 2 }],
      });

      expect(getBetterVersion('a~1', '4ch', [best, problem])).toEqual({ reason: 'problem', version: best });
    });

    it('is the best version for a hidden one, also where the mode is not known', () => {
      expect(getBetterVersion('a~1', '14ch', [best, version('a~1', { hidden: true })])).toEqual({ reason: 'hidden', version: best });
      expect(getBetterVersion('a~1', '2ch', [best, version('a~1', { hidden: true })])).toEqual({ reason: 'hidden', version: best });
    });

    it('is none for an open mode the best version does not have, or a mode the version does not know', () => {
      const modes = version('a~1', {
        modeStates: [{ shortName: '4ch', name: '4-channel', hash: 'c', state: 'open', good: 0, bad: 0 }],
      });

      expect(getBetterVersion('a~1', '4ch', [best, modes])).toBeUndefined();
      expect(getBetterVersion('a~1', '2ch', [best, modes])).toBeUndefined();
    });

    it('is none for the best version itself, or without a version marked best or the version of the copy', () => {
      expect(getBetterVersion('a~3', '14ch', [best, version('a~1')])).toBeUndefined();
      expect(getBetterVersion('a~1', '14ch', [version('a~2'), version('a~1')])).toBeUndefined();
      expect(getBetterVersion('a~1', '14ch', [best])).toBeUndefined();
      expect(getBetterVersion('a~1', '14ch', [version('a~3', { best: true, modeStates: undefined }), version('a~1')])).toBeUndefined();
    });
  });
});
