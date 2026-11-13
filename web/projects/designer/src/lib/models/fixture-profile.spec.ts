import { FixtureProfile } from './fixture-profile';
import { Project } from './project';

// The copy of a profile in a project keeps what the library told about its version, and what the user confirmed the
// fixtures of it may do, when the project is saved and opened again.
describe('FixtureProfile', () => {
  const version = {
    uuid: 'stairville/mh-100~12',
    fixture: 'stairville/mh-100',
    manufacturerShortName: 'stairville',
    manufacturerName: 'Stairville',
    name: 'MH-100',
    mainCategory: 'Moving Head',
    origin: 'ai',
    state: 'open',
    confirmations: 1,
    problems: 0,
    usage: 12,
    versions: 2,
    best: true,
    bestUuid: 'stairville/mh-100~12',
    currentOfl: false,
    hidden: false,
    retired: false,
    created: '2026-11-13T10:00:00Z',
    parentUuid: 'stairville/mh-100~3',
    manual: { name: 'mh-100.pdf' },
    modeStates: [{ shortName: '14ch', name: '14-channel', hash: 'a', state: 'open', good: 1, bad: 0 }],
  };

  it('takes what the library tells about the version', () => {
    const profile = new FixtureProfile(version);
    const { mainCategory, ...fields } = version;

    expect(profile).toEqual(jasmine.objectContaining(fields as any));
    expect(profile.categories).toEqual(['Moving Head' as any]);
    expect(profile.confirmedMaintenance).toEqual([]);
  });

  it('keeps it with the copy in the project, saved and opened again', () => {
    const profile = new FixtureProfile({ ...version, modes: [{ name: '14-channel', shortName: '14ch', channels: [] }] });
    profile.confirmedMaintenance.push('reset');

    const opened = new Project(JSON.parse(JSON.stringify(new Project({ fixtureProfiles: [profile] })))).fixtureProfiles[0];

    expect(opened.origin).toBe('ai');
    expect(opened.modeStates).toEqual(version.modeStates as any);
    expect(opened.manual).toEqual({ name: 'mh-100.pdf' });
    expect(opened.confirmedMaintenance).toEqual(['reset']);
    expect(opened.source).toBeUndefined();
  });

  it('knows nothing of a version for a copy of an older project', () => {
    const json = JSON.parse(JSON.stringify(new FixtureProfile({ uuid: 'stairville/mh-100', name: 'MH-100', confirmedMaintenance: 'yes' })));

    expect(json.origin).toBeUndefined();
    expect(json.state).toBeUndefined();
    expect(new FixtureProfile(json).confirmedMaintenance).toEqual([]);
  });
});
