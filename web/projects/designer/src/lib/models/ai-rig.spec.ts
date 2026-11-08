import { aiMaxRigGroups, buildAiRig, getAiPosition } from './ai-rig';
import { Fixture, Positioning } from './fixture';
import { FixtureCapabilityType } from './fixture-capability';
import { FixtureWheelSlotType } from './fixture-wheel-slot';

// The fixtures of a project in groups, as the AI is told about them: built here from parts of fixtures with just what
// the rig reads of them (their profile and the capabilities of their channels).
describe('buildAiRig', () => {
  function fixture(uuid: string, profileUuid: string, data: any = {}): Fixture {
    return new Fixture({ uuid, profileUuid, name: uuid, ...data });
  }

  function capability(type: FixtureCapabilityType, data: any = {}): any {
    return { capability: { type, ...data.capability }, wheelIsColor: !!data.wheelIsColor, wheelSlots: data.wheelSlots || [] };
  }

  function part(owner: Fixture, profile: any, capabilities: any[], pixelKey?: string): any {
    return { fixture: owner, profile, channels: [{ capabilities }], pixel: pixelKey ? { key: pixelKey } : undefined };
  }

  const stage = { stageHeightCm: 350, stageFloorHeightCm: 30 };

  it('places fixtures by hand by where they are on the stage', () => {
    const at = (y: number, z: number) =>
      getAiPosition(fixture('f', 'p', { positioning: Positioning.manual, positionY: y, positionZ: z }), stage);

    expect(at(300, 100)).toBe('top-front');
    expect(at(300, -100)).toBe('top-back');
    expect(at(50, 0)).toBe('floor-front');
    expect(at(50, -10)).toBe('floor-back');
    expect(getAiPosition(fixture('f', 'p', { positioning: Positioning.bottomBack }), stage)).toBe('floor-back');

    const unplaced = fixture('f', 'p', { positioning: Positioning.manual });
    unplaced.positionY = undefined;
    expect(getAiPosition(unplaced, stage)).toBe('other');
  });

  it('groups by folder and by model and place, naming each group once', () => {
    const wash = { uuid: 'wash', name: 'Wash', categories: ['Color Changer'] };
    const unnamed = { uuid: 'odd', name: '***', categories: [] };
    const fixtures = [
      fixture('a', 'wash'),
      fixture('b', 'wash', { positioning: Positioning.topBack }),
      fixture('c', 'wash'),
      fixture('d', 'odd'),
      fixture('e', 'odd', { positioning: Positioning.bottomFront }),
      fixture('missing', 'wash'),
    ];
    const color = capability(FixtureCapabilityType.ColorIntensity);

    const rig = buildAiRig({
      fixtures,
      presetFixtures: [
        { fixtureUuid: 'a' },
        { fixtureUuid: 'b' },
        { fixtureUuid: 'c', folderUuid: 'folder' },
        { fixtureUuid: 'd' },
        { fixtureUuid: 'e' },
        // a fixture the designer has no parts of, and one listed again
        { fixtureUuid: 'missing' },
        { fixtureUuid: 'a' },
        { fixtureUuid: 'unknown' },
      ] as any[],
      fixtureFolders: [{ uuid: 'folder', name: 'Wash' } as any],
      cachedFixtures: [
        part(fixtures[0], wash, [color]),
        part(fixtures[1], wash, [color]),
        part(fixtures[2], wash, [color]),
        part(fixtures[3], unnamed, []),
        part(fixtures[4], unnamed, []),
      ],
      ...stage,
    });

    expect(rig.groups.map((group) => [group.group.id, group.group.name, group.group.position, group.fixtureUuids])).toEqual([
      ['wash', 'Wash', 'top-front', ['a']],
      ['wash-2', 'Wash 2', 'top-back', ['b']],
      ['wash-3', 'Wash 3', 'top-front', ['c']],
      ['group', '***', 'top-front', ['d']],
      ['2', '*** 2', 'floor-front', ['e']],
    ]);
    expect(rig.groups[3].group.category).toBe('');
    expect(rig.groups[3].group.abilities).toEqual([]);
  });

  it('tells what the fixtures can do: colors through a wheel only, gobos, prisms, the strobe', () => {
    const spot = { uuid: 'spot', name: 'Spot', categories: ['Moving Head'] };
    const heads = [fixture('a', 'spot'), fixture('b', 'spot')];
    const wheel = (slots: any[]) =>
      capability(FixtureCapabilityType.WheelSlot, {
        wheelIsColor: true,
        wheelSlots: slots.map((colors) => ({ type: FixtureWheelSlotType.Color, colors })),
      });
    const parts = heads.map((head) =>
      part(head, spot, [
        capability(FixtureCapabilityType.Intensity),
        wheel([['#FF0000'], ['#0000ff', 'not-a-color'], ['#ff0000'], undefined]),
        capability(FixtureCapabilityType.WheelSlot, { wheelSlots: [{ type: FixtureWheelSlotType.Gobo }, null] }),
        capability(FixtureCapabilityType.Prism),
        capability(FixtureCapabilityType.Zoom),
        capability(FixtureCapabilityType.ShutterStrobe, { capability: { shutterEffect: 'Open' } }),
        capability(FixtureCapabilityType.ShutterStrobe, { capability: { shutterEffect: 'Closed' } }),
        capability(FixtureCapabilityType.Tilt),
      ])
    );

    const [group] = buildAiRig({
      fixtures: heads,
      presetFixtures: heads.map((head) => ({ fixtureUuid: head.uuid })) as any[],
      fixtureFolders: [],
      cachedFixtures: parts,
      ...stage,
    }).groups;

    expect(group.group.abilities).toEqual(['dimmer', 'color', 'pan-tilt', 'zoom', 'gobo', 'prism']);
    expect(group.group.colors).toEqual(['#ff0000', '#0000ff']);
    expect(group.group.count).toBe(2);
  });

  it('measures the pixels of a bar in a row without a matrix, and of a matrix in its columns and rows', () => {
    const bar = { uuid: 'bar', name: 'Bar', categories: ['Pixel Bar'] };
    const matrix = { uuid: 'matrix', name: 'Matrix', categories: ['Matrix'], matrix: { pixelCount: [4, 2, 2] } };
    const fixtures = [fixture('bar-1', 'bar'), fixture('matrix-1', 'matrix')];
    const color = capability(FixtureCapabilityType.ColorIntensity);

    const rig = buildAiRig({
      fixtures,
      presetFixtures: fixtures.map((each) => ({ fixtureUuid: each.uuid })) as any[],
      fixtureFolders: [],
      cachedFixtures: [
        part(fixtures[0], bar, []),
        ...['1', '2', '3', '4', '5'].map((key) => part(fixtures[0], bar, [color], key)),
        part(fixtures[1], matrix, [color], '1'),
      ],
      ...stage,
    });

    expect(rig.groups[0].group.pixels).toEqual({ columns: 5, rows: 1 });
    expect(rig.groups[0].group.abilities).toContain('pixels');
    expect(rig.groups[0].group.colors).toBeUndefined();
    expect(rig.groups[1].group.pixels).toEqual({ columns: 4, rows: 4 });
  });

  it('copes with profiles telling little: no categories, wheels without slots, a matrix of one layer, a folder without a name', () => {
    const plain = { uuid: 'plain', name: 'Plain' };
    const panel = { uuid: 'panel', name: 'Panel', categories: ['Matrix'], matrix: { pixelCount: [4, 2] } };
    const fixtures = [fixture('a', 'plain'), fixture('b', 'panel')];
    const bare = (type: FixtureCapabilityType, wheelIsColor = false) => ({ capability: { type }, wheelIsColor });

    const rig = buildAiRig({
      fixtures,
      presetFixtures: [{ fixtureUuid: 'a', folderUuid: 'unnamed' }, { fixtureUuid: 'b' }] as any[],
      fixtureFolders: [{ uuid: 'unnamed', name: '' } as any],
      cachedFixtures: [
        part(fixtures[0], plain, [bare(FixtureCapabilityType.WheelSlot, true), bare(FixtureCapabilityType.WheelSlot)]),
        part(fixtures[1], panel, [capability(FixtureCapabilityType.ColorIntensity)], '1'),
      ],
      ...stage,
    });

    expect(rig.groups[0].group).toEqual(jasmine.objectContaining({ id: 'group', name: '', category: '', abilities: ['color'] }));
    expect(rig.groups[0].group.colors).toBeUndefined();
    expect(rig.groups[1].group.pixels).toEqual({ columns: 4, rows: 2 });
  });

  it('describes no more groups than the API takes', () => {
    const fixtures: Fixture[] = [];
    const parts: any[] = [];

    for (let i = 0; i < aiMaxRigGroups + 3; i++) {
      const each = fixture('f' + i, 'profile-' + i);
      fixtures.push(each);
      parts.push(part(each, { uuid: 'profile-' + i, name: 'Model ' + i, categories: [] }, []));
    }

    const rig = buildAiRig({
      fixtures,
      presetFixtures: fixtures.map((each) => ({ fixtureUuid: each.uuid })) as any[],
      fixtureFolders: [],
      cachedFixtures: parts,
      ...stage,
    });

    expect(rig.groups.length).toBe(aiMaxRigGroups);
  });
});
