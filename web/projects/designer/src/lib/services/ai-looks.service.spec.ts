import { HttpHeaders, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BsModalService } from 'ngx-bootstrap/modal';
import { ToastrModule } from 'ngx-toastr';
import { EMPTY, of } from 'rxjs';

import { profiles } from '../../../conformance';
import { AiLooks, AiPreset, AiRig, defaultAiSettings } from '../models/ai-looks';
import { genericStrobePercentage } from '../models/ai-looks-compiler';
import { EffectCurve } from '../models/effect-curve';
import { EffectPanTilt } from '../models/effect-pan-tilt';
import { EffectPixel } from '../models/effect-pixel';
import { FixtureCapabilityType } from '../models/fixture-capability';
import { FixtureCapabilityValue } from '../models/fixture-capability-value';
import { Preset } from '../models/preset';
import { Composition } from '../models/composition';
import { GoboPatternChoice } from '../models/gobo-pattern-choice';
import { Project } from '../models/project';
import { goboCatalog } from '../preview/models/gobo';
import { AiLooksService } from './ai-looks.service';
import { FixtureService } from './fixture.service';
import { PresetService } from './preset.service';
import { PreviewService } from './preview.service';
import { ProjectService } from './project.service';
import { SceneService } from './scene.service';
import { TimelineService } from './timeline.service';
import { UndoService } from './undo.service';
import { UserEnsureLoginService } from './user-ensure-login.service';
import { UserService } from './user.service';

// a preset of the looks with everything it can set left out
const nothing: Omit<AiPreset, 'id' | 'name' | 'groups'> = {
  order: 'rig',
  wings: false,
  dimmer: null,
  dimmerFan: null,
  color: null,
  colorGradient: null,
  colorSequence: null,
  zoom: null,
  zoomFan: null,
  position: null,
  movement: null,
  dimmerEffect: null,
  pixel: null,
  gobo: null,
  prism: null,
  strobe: null,
};

describe('AiLooksService', () => {
  let service: AiLooksService;
  let projectService: ProjectService;
  let fixtureService: FixtureService;
  let sceneService: SceneService;
  let previewService: PreviewService;

  // a project with four pars at the front, two moving heads with a zoom at the back, two bars of pixels on the floor
  // and a strobe in a folder of its own
  function project(): Project {
    const fixtures: any[] = [];
    const presetFixtures: any[] = [];
    let channel = 0;
    const add = (profile: string, name: string, positioning: string, folderUuid?: string, modeShortName?: string) => {
      const uuid = 'fixture-' + (fixtures.length + 1);
      const library = profiles[profile];
      const mode = library.modes.find((candidate: any) => candidate.shortName === modeShortName) || library.modes[0];
      fixtures.push({
        uuid,
        profileUuid: profile,
        name,
        modeShortName: mode.shortName,
        dmxUniverseUuid: 'u',
        dmxFirstChannel: channel,
        positioning,
      });
      presetFixtures.push({ fixtureUuid: uuid, folderUuid });
      channel += 32;
    };

    for (let i = 1; i <= 4; i++) {
      add('test/rgb-par', 'Par ' + i, 'topFront');
    }
    add('test/mover', 'Mover 1', 'topBack', undefined, 'zoom');
    add('test/mover', 'Mover 2', 'topBack', undefined, 'zoom');
    add('test/pixel-bar', 'Bar 1', 'bottomFront');
    add('test/pixel-bar', 'Bar 2', 'bottomFront');
    add('test/strobe-par', 'Blinder', 'topBack', 'folder-strobes');
    add('test/effects-strobe', 'Strobe', 'topBack', 'folder-strobes');

    const used = Array.from(new Set(fixtures.map((fixture) => fixture.profileUuid)));

    return new Project({
      fixtures,
      presetFixtures,
      fixtureFolders: [{ uuid: 'folder-strobes', name: 'Strobes' }],
      fixtureProfiles: used.map((uuid) => ({ ...JSON.parse(JSON.stringify(profiles[uuid])), uuid })),
      universes: [{ uuid: 'u', name: 'Universe' }],
      presets: [],
      scenes: [],
      compositions: [],
    });
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ToastrModule.forRoot()],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), BsModalService],
    });

    service = TestBed.inject(AiLooksService);
    projectService = TestBed.inject(ProjectService);
    fixtureService = TestBed.inject(FixtureService);
    sceneService = TestBed.inject(SceneService);
    previewService = TestBed.inject(PreviewService);

    projectService.project = project();
    // the current version: undoing loads the project again, which would migrate an older one
    projectService.project.version = projectService.currentProjectVersion;
    fixtureService.updateCachedFixtures();
  });

  function groupOf(rig: AiRig, name: string) {
    return rig.groups.find((group) => group.group.name === name);
  }

  // the looks of one preset lighting the passed groups, played in one scene
  function oneLook(preset: Partial<AiPreset> & { groups: string[] }): AiLooks {
    return {
      name: 'Test looks',
      summary: '',
      presets: [{ ...nothing, id: 'look', name: 'Look', ...preset }],
      scenes: [{ name: 'Scene', section: 'verse', energy: 3, presets: ['look'], fadeInBeats: 0, fadeOutBeats: 0 }],
    };
  }

  function value(preset: Preset, type: FixtureCapabilityType, color?: string, profileUuid?: string): FixtureCapabilityValue {
    return preset.steps[0].fixtureCapabilityValues.find(
      (candidate) =>
        candidate.type === type &&
        (color === undefined || candidate.color === color) &&
        (profileUuid === undefined || candidate.profileUuid === profileUuid)
    );
  }

  // the value of a channel of a fixture (or one of its pixels) while the selected scenes play
  function channelValue(fixtureUuid: string, channelName: string, timeMillis = 0, pixelKey?: string): number {
    const values = previewService.getChannelValues(timeMillis, previewService.getPresets(timeMillis));
    const part = fixtureService.cachedFixtures.find(
      (cachedFixture) => cachedFixture.fixture.uuid === fixtureUuid && (cachedFixture.pixel?.key ?? undefined) === pixelKey
    );

    return values.get(part).find((channelValueOfPart) => channelValueOfPart.channelName === channelName)?.value;
  }

  describe('the rig', () => {
    it('groups the fixtures by model and place, and by the folders of the fixture pool', () => {
      const rig = service.getRig();

      expect(rig.groups.map((group) => [group.group.id, group.group.count, group.group.position])).toEqual([
        ['rgb-par', 4, 'top-front'],
        ['mover', 2, 'top-back'],
        ['bar-of-three-pixels', 2, 'floor-front'],
        ['strobes', 2, 'top-back'],
      ]);
      expect(groupOf(rig, 'RGB par').fixtureUuids).toEqual(['fixture-1', 'fixture-2', 'fixture-3', 'fixture-4']);
      expect(groupOf(rig, 'Strobes').fixtureUuids).toEqual(['fixture-9', 'fixture-10']);
    });

    it('tells what each group can do', () => {
      const rig = service.getRig();

      expect(groupOf(rig, 'RGB par').group.abilities).toEqual(['dimmer', 'color', 'strobe']);
      expect(groupOf(rig, 'Mover').group.abilities).toEqual(['dimmer', 'pan-tilt', 'strobe', 'zoom']);
      expect(groupOf(rig, 'Bar of three pixels').group.abilities).toEqual(['dimmer', 'color', 'pixels']);
      expect(groupOf(rig, 'Bar of three pixels').group.pixels).toEqual({ columns: 3, rows: 1 });
      expect(groupOf(rig, 'RGB par').group.category).toBe('Color Changer');
    });

    it('names the colors of a group lighting through a color wheel only', () => {
      projectService.project.fixtures[4].profileUuid = 'test/moving-head';
      projectService.project.fixtures[4].modeShortName = '6ch';
      projectService.project.fixtures[5].profileUuid = 'test/moving-head';
      projectService.project.fixtures[5].modeShortName = '6ch';
      projectService.project.fixtureProfiles.push(
        new Project({ fixtureProfiles: [{ ...profiles['test/moving-head'], uuid: 'test/moving-head' }] }).fixtureProfiles[0]
      );
      fixtureService.updateCachedFixtures();

      const heads = groupOf(service.getRig(), 'Moving head').group;

      expect(heads.abilities).toContain('color');
      expect(heads.colors.length).toBeGreaterThan(1);
      expect(heads.colors.every((color) => /^#[0-9a-f]{6}$/.test(color))).toBe(true);
      expect(groupOf(service.getRig(), 'RGB par').group.colors).toBeUndefined();
    });
  });

  describe('the looks added to the project', () => {
    it('come as presets and scenes in folders of their own, as one step to undo', () => {
      const undoService = TestBed.inject(UndoService);
      undoService.reset();
      undoService.captureChanges();
      const rig = service.getRig();

      const added = service.addToProject(
        {
          name: 'Neon night',
          summary: '',
          presets: [
            { ...nothing, id: 'wash', name: 'Pink wash', groups: ['rgb-par'], dimmer: 0.8, color: '#ff2fa0' },
            {
              ...nothing,
              id: 'heads',
              name: 'Heads',
              groups: ['mover'],
              dimmer: 1,
              position: { aim: 'center', fanDegrees: 0, fanShape: 'linear' },
            },
          ],
          scenes: [
            { name: 'Verse', section: 'verse', energy: 2, presets: ['wash'], fadeInBeats: 4, fadeOutBeats: 2 },
            { name: 'Chorus', section: 'chorus', energy: 5, presets: ['heads', 'wash'], fadeInBeats: 0, fadeOutBeats: 0 },
            { name: 'Blackout', section: 'blackout', energy: 1, presets: [], fadeInBeats: 0, fadeOutBeats: 0 },
          ],
        },
        rig,
        120
      );

      const project = projectService.project;
      expect(project.presets.map((preset) => preset.name)).toEqual(['Pink wash', 'Heads']);
      expect(project.scenes.map((scene) => scene.name)).toEqual(['Verse', 'Chorus', 'Blackout']);
      expect(project.presetFolders.map((folder) => folder.name)).toEqual(['Neon night']);
      expect(project.sceneFolders.map((folder) => folder.name)).toEqual(['Neon night']);
      expect(project.presets.every((preset) => preset.folderUuid === project.presetFolders[0].uuid)).toBe(true);
      expect(project.scenes.every((scene) => scene.folderUuid === project.sceneFolders[0].uuid)).toBe(true);

      // the scenes layer the presets, the topmost first, fading over the beats at the tempo of the looks
      const [wash, heads] = added.presets;
      expect(project.scenes[1].presetUuids).toEqual([heads.uuid, wash.uuid]);
      expect(project.scenes[2].presetUuids).toEqual([]);
      expect(project.scenes[0].fadeInMillis).toBe(2000);
      expect(project.scenes[0].fadeOutMillis).toBe(1000);

      // each preset plays the fixtures of its groups, the first scene plays
      expect(wash.fixtures.map((fixture) => fixture.fixtureUuid)).toEqual(['fixture-1', 'fixture-2', 'fixture-3', 'fixture-4']);
      expect(sceneService.selectedScenes).toEqual([project.scenes[0]]);
      expect(TestBed.inject(PresetService).selectedPreset).toBe(wash);

      // all of it is undone at once
      expect(undoService.canUndo).toBe(true);
      undoService.undo();
      expect(projectService.project.presets.length).toBe(0);
      expect(projectService.project.scenes.length).toBe(0);
    });

    it('fan the brightness and the zoom, and spread colors as a gradient', () => {
      const { presets } = service.addToProject(
        oneLook({
          groups: ['rgb-par'],
          dimmerFan: { shape: 'center', from: 1, to: 0.2 },
          colorGradient: { colors: ['#ff0000', '#0000ff'], blend: 'steps' },
          order: 'left-right',
          wings: true,
        }),
        service.getRig(),
        120
      );
      const [preset] = presets;

      expect(value(preset, FixtureCapabilityType.Intensity).fan.map((stop) => [stop.position, stop.valuePercentage])).toEqual([
        [0, 0.2],
        [0.5, 1],
        [1, 0.2],
      ]);
      expect(value(preset, FixtureCapabilityType.ColorIntensity, 'Red').fan.map((stop) => stop.valuePercentage)).toEqual([1, 0]);
      expect(value(preset, FixtureCapabilityType.ColorIntensity, 'Blue').fan.map((stop) => stop.valuePercentage)).toEqual([0, 1]);
      expect(value(preset, FixtureCapabilityType.ColorIntensity, 'Red').fanBetween).toBe('steps');
      expect(preset.fanOrder).toBe('left-right');
      expect(preset.patternWings).toBe(2);

      // the fixtures at the ends are dimmer than the ones in the middle
      expect(channelValue('fixture-1', 'Dimmer')).toBeLessThan(channelValue('fixture-2', 'Dimmer'));

      const zoomed = service.addToProject(
        oneLook({ groups: ['mover'], dimmer: 1, zoomFan: { shape: 'linear', from: 0, to: 1 } }),
        service.getRig(),
        120
      );
      expect(value(zoomed.presets[0], FixtureCapabilityType.Zoom).fan.map((stop) => stop.valuePercentage)).toEqual([0, 1]);
    });

    it('aim the moving heads at a spot on the stage, fanned out, and move them fanned over the heads in beats', () => {
      const { presets } = service.addToProject(
        oneLook({
          groups: ['mover'],
          dimmer: 1,
          position: { aim: 'left', fanDegrees: 30, fanShape: 'center' },
          movement: { shape: 'figure8', panDegrees: 40, tiltDegrees: 20, beats: 8, chase: 'alternate', fan: 'linear' },
        }),
        service.getRig(),
        100
      );
      const [preset] = presets;
      const pan = value(preset, FixtureCapabilityType.Pan);
      const project = projectService.project;

      // left as the audience sees it, on the floor of the stage
      expect([pan.aimX, pan.aimY, pan.aimZ]).toEqual([-project.stageWidthCm / 4, project.stageFloorHeightCm, 0]);
      expect(pan.spreadDegrees).toBe(30);
      expect(pan.fanShape).toBe('center');
      expect(value(preset, FixtureCapabilityType.Tilt).aimX).toBe(pan.aimX);

      const movement = preset.effects[0] as EffectPanTilt;
      expect(movement.type).toBe('pan-tilt');
      expect(movement.shape).toBe('figure8');
      expect([movement.sizePanDegrees, movement.sizeTiltDegrees]).toEqual([40, 20]);
      expect([movement.lengthMode, movement.lengthBeats]).toEqual(['beats', 8]);
      expect([movement.phasingMode, movement.phasingBeats]).toEqual(['beats', 4]);
      expect(movement.fanMode).toBe('linear');
    });

    it('point the heads straight out of their base', () => {
      const { presets } = service.addToProject(
        oneLook({ groups: ['mover'], dimmer: 1, position: { aim: 'straight', fanDegrees: 0, fanShape: 'linear' } }),
        service.getRig(),
        120
      );
      const pan = value(presets[0], FixtureCapabilityType.Pan);

      expect(pan.valueDegrees).toBe(0);
      expect(pan.aimX).toBeUndefined();
      expect(pan.spreadDegrees).toBeUndefined();
    });

    it('run a sequence of colors in steps following the beat, chased over the fixtures', () => {
      const { presets } = service.addToProject(
        oneLook({
          groups: ['rgb-par'],
          dimmer: 1,
          colorSequence: { colors: ['#ff0000', '#00ff00', '#0000ff'], beatsPerColor: 2, fade: 'snap', chase: 'spread' },
        }),
        service.getRig(),
        120
      );
      const [preset] = presets;

      expect(preset.steps.length).toBe(3);
      expect(preset.steps.map((step) => step.startMillis)).toEqual([0, 1000, 2000]);
      expect(preset.steps.map((step) => step.transitionMillis)).toEqual([0, 0, 0]);
      expect([preset.stepsLengthMode, preset.stepsBeatsPerMinute, preset.stepsLengthMillis, preset.stepsLoop]).toEqual([
        'beats',
        120,
        1000,
        true,
      ]);
      expect([preset.stepsPhasingMode, preset.stepsPhasingCycles]).toEqual(['spread', 1]);

      // every step keeps the brightness, each with its own color
      for (const [index, step] of preset.steps.entries()) {
        expect(step.fixtureCapabilityValues.find((candidate) => candidate.type === FixtureCapabilityType.Intensity).valuePercentage).toBe(
          1
        );
        const green = step.fixtureCapabilityValues.find((candidate) => candidate.color === 'Green').valuePercentage;
        expect(green).toBe(index === 1 ? 1 : 0);
      }
    });

    it('pulse the brightness down from the one of the preset, and paint the pixels in a palette', () => {
      const { presets } = service.addToProject(
        oneLook({
          groups: ['bar-of-three-pixels'],
          dimmer: 0.8,
          dimmerEffect: { curve: 'square', beats: 1, depth: 0.5, width: 0.25, chase: 'spread' },
          pixel: { pattern: 'comet', palette: 'neon', colors: [], beats: 4, direction: 'out', size: 0.4 },
        }),
        service.getRig(),
        120
      );
      const [preset] = presets;
      const curve = preset.effects[0] as EffectCurve;
      const pixel = preset.effects[1] as EffectPixel;

      expect(curve.capabilities.map((capability) => capability.type)).toEqual([FixtureCapabilityType.Intensity]);
      expect(curve.curveType).toBe('square');
      // from 0.8 down to 0.4
      expect(curve.position + curve.amplitude / 2).toBeCloseTo(0.8, 6);
      expect(curve.position - curve.amplitude / 2).toBeCloseTo(0.4, 6);
      expect(curve.dutyCycle).toBe(0.25);
      expect([curve.phasingMode, curve.phasingCycles]).toEqual(['spread', 1]);

      expect(pixel.type).toBe('pixel');
      expect([pixel.pattern, pixel.direction, pixel.size, pixel.lengthBeats]).toEqual(['comet', 'out', 0.4, 4]);
      expect(pixel.palette.ref).toBe('neon');
      expect(pixel.palette.stops.length).toBeGreaterThan(1);

      // a palette of its own
      const custom = service.addToProject(
        oneLook({
          groups: ['bar-of-three-pixels'],
          dimmer: 1,
          pixel: { pattern: 'chase', palette: 'custom', colors: ['#ff0000', '#00ff00'], beats: 2, direction: 'right', size: 0.2 },
        }),
        service.getRig(),
        120
      );
      expect((custom.presets[0].effects[0] as EffectPixel).palette.stops.map((stop) => [stop.position, stop.color])).toEqual([
        [0, '#ff0000'],
        [1, '#00ff00'],
      ]);
    });

    it('flash the strobe as fast as asked on every model, in its effect', () => {
      const { presets } = service.addToProject(
        oneLook({ groups: ['strobes', 'mover'], strobe: { effect: 'Pulse', flashesPerSecond: 3 } }),
        service.getRig(),
        120
      );
      const [preset] = presets;
      const strobe = (profileUuid: string) => value(preset, FixtureCapabilityType.ShutterStrobe, undefined, profileUuid);

      // 1 to 20 flashes a second, 1 to 25, and slow to fast (1 to 20)
      expect(strobe('test/strobe-par').valuePercentage).toBeCloseTo(2 / 19, 3);
      expect(strobe('test/mover').valuePercentage).toBeCloseTo(2 / 24, 3);
      expect(strobe('test/effects-strobe').valuePercentage).toBeCloseTo(2 / 19, 3);
      expect(strobe('test/effects-strobe').shutterEffect).toBe('Pulse');
      expect(value(preset, FixtureCapabilityType.StrobeSpeed, undefined, 'test/mover').valuePercentage).toBeCloseTo(2 / 24, 3);

      // a strobe flashes at full
      expect(value(preset, FixtureCapabilityType.Intensity).valuePercentage).toBe(1);
      expect(genericStrobePercentage(3)).toBeCloseTo(2 / 19, 3);
    });

    it('flash a model which tells no speeds like one from 1 to 20 times a second', () => {
      const { presets } = service.addToProject(
        oneLook({ groups: ['rgb-par'], strobe: { effect: 'Strobe', flashesPerSecond: 3 } }),
        service.getRig(),
        120
      );
      const strobe = value(presets[0], FixtureCapabilityType.ShutterStrobe, undefined, 'test/rgb-par');

      expect(strobe.valuePercentage).toBeCloseTo(genericStrobePercentage(3), 6);
      expect(strobe.shutterEffect).toBeUndefined();
    });

    it('add nothing for looks without a preset to play, and name the folders of looks without a name', () => {
      const project = projectService.project;
      const nothingToPlay = service.addToProject(oneLook({ groups: ['side-pars'], dimmer: 1 }), service.getRig(), 120);

      expect(nothingToPlay.presets.length).toBe(0);
      expect(project.presetFolders.length).toBe(0);
      expect(project.scenes.length).toBe(0);

      service.addToProject({ ...oneLook({ groups: ['rgb-par'], dimmer: 1 }), name: '', scenes: [] }, service.getRig(), 120);
      expect(project.presetFolders.map((folder) => folder.name)).toEqual(['AI looks']);
      expect(project.scenes.length).toBe(0);
    });

    it('follow the tempo of the composition open, or 120 beats a minute', () => {
      expect(service.getTempo()).toBe(120);

      TestBed.inject(TimelineService).selectedComposition = new Composition({ beatsPerMinute: 127.6 });
      expect(service.getTempo()).toBe(128);
    });

    describe('with gobos and prisms', () => {
      // a spot with a gobo wheel (dots on slot 2, a star on slot 3) turning its gobos and its prism, one with two such
      // wheels, and a beam with a prism
      beforeEach(() => {
        const project = projectService.project;

        for (const [uuid, profile, mode] of [
          ['spot', 'test/effects-spot', 'full'],
          ['twins', 'test/program-spot', '9ch'],
          ['beam', 'test/beam', undefined],
        ]) {
          const library = profiles[profile];
          project.fixtureProfiles.push(
            new Project({ fixtureProfiles: [{ ...JSON.parse(JSON.stringify(library)), uuid: profile }] }).fixtureProfiles[0]
          );
          project.fixtures.push(
            new Project({
              fixtures: [
                {
                  uuid,
                  profileUuid: profile,
                  name: uuid,
                  modeShortName: mode || library.modes[0].shortName,
                  dmxUniverseUuid: 'u',
                  dmxFirstChannel: 400 + project.fixtures.length * 20,
                  positioning: 'topBack',
                },
              ],
            }).fixtures[0]
          );
          project.presetFixtures.push(new Project({ presetFixtures: [{ fixtureUuid: uuid }] }).presetFixtures[0]);
        }
        fixtureService.updateCachedFixtures();
      });

      function gobo(preset: Preset, profileUuid: string) {
        return preset.steps[0].fixtureCapabilityValues.filter(
          (candidate) => candidate.profileUuid === profileUuid && candidate.type !== FixtureCapabilityType.ShutterStrobe
        );
      }

      it('tell the kinds of gobos of the wheels to the AI', () => {
        const spot = groupOf(service.getRig(), 'Effects Spot').group;

        expect(spot.gobos).toEqual(['dots', 'star']);
        expect(spot.abilities).toContain('gobo');
        expect(spot.abilities).toContain('prism');
      });

      it('put each model on its gobo of the kind asked, turning it, and the first of its gobos for any other', () => {
        const rig = service.getRig();
        const ids = ['effects-spot', 'program-spot'];
        const star = service.addToProject(oneLook({ groups: ids, dimmer: 1, gobo: { pattern: 'star', rotation: 0.5 } }), rig, 120)
          .presets[0];

        expect(gobo(star, 'test/effects-spot').map((value) => [value.type, value.wheel, value.slotNumber, value.valuePercentage])).toEqual([
          [FixtureCapabilityType.WheelSlot, 'Gobo Wheel', 3, undefined],
          [FixtureCapabilityType.WheelSlotRotation, 'Gobo Wheel', undefined, 0.75],
        ]);
        // of two wheels, the first one having it
        expect(gobo(star, 'test/program-spot').map((value) => [value.wheel, value.slotNumber])).toEqual([
          ['Gobo Wheel 1', 3],
          ['Gobo Wheel 1', undefined],
        ]);
        // the preview puts the wheel of the spot on the star
        sceneService.selectScenes([projectService.project.scenes[projectService.project.scenes.length - 1]]);
        expect(channelValue('spot', 'Gobo Wheel')).toBeGreaterThanOrEqual(20);
        expect(channelValue('spot', 'Gobo Wheel')).toBeLessThanOrEqual(29);

        for (const pattern of ['any', 'rings']) {
          const other = service.addToProject(oneLook({ groups: ids, dimmer: 1, gobo: { pattern, rotation: 0 } }), rig, 120).presets[0];
          expect(gobo(other, 'test/effects-spot').map((value) => [value.wheel, value.slotNumber])).toEqual([['Gobo Wheel', 2]]);
        }
      });

      it('take the pattern the user matched to a gobo of a model', () => {
        const rings = goboCatalog.find((entry) => entry.pattern.family === 'rings');
        projectService.project.goboPatterns = [
          new GoboPatternChoice({ profileUuid: 'test/effects-spot', wheel: 'Gobo Wheel', slotNumber: 3, pattern: rings.id }),
        ];
        const rig = service.getRig();

        expect(groupOf(rig, 'Effects Spot').group.gobos).toEqual(['dots', 'rings']);
        const preset = service.addToProject(
          oneLook({ groups: ['effects-spot'], dimmer: 1, gobo: { pattern: 'rings', rotation: 0 } }),
          rig,
          120
        ).presets[0];
        expect(gobo(preset, 'test/effects-spot')[0].slotNumber).toBe(3);
      });

      it('put no gobo on a model without one, and the prism in', () => {
        const preset = service.addToProject(
          oneLook({ groups: ['spot-with-a-beam'], dimmer: 1, gobo: { pattern: 'any', rotation: 0.5 }, prism: { rotation: 0.5 } }),
          service.getRig(),
          120
        ).presets[0];

        expect(gobo(preset, 'test/beam')).toEqual([]);
        expect(value(preset, FixtureCapabilityType.Prism).valuePercentage).toBe(1);
        expect(value(preset, FixtureCapabilityType.PrismRotation).valuePercentage).toBe(0.75);
      });
    });

    it('light the groups no preset brightens at full, and leave out what has nothing to play', () => {
      const rig = service.getRig();
      const { presets, scenes } = service.addToProject(
        {
          name: 'Looks',
          summary: '',
          presets: [
            { ...nothing, id: 'color', name: 'Color', groups: ['rgb-par'], color: '#00ff00' },
            { ...nothing, id: 'dimmed', name: 'Dimmed', groups: ['mover'], dimmer: 0.5 },
            { ...nothing, id: 'zoom', name: 'Zoom', groups: ['mover'], zoom: 0.3 },
            { ...nothing, id: 'ghost', name: 'Ghost', groups: ['side-pars'], dimmer: 1 },
          ],
          scenes: [
            { name: 'All', section: 'chorus', energy: 3, presets: ['zoom', 'dimmed', 'color', 'ghost'], fadeInBeats: 0, fadeOutBeats: 0 },
            { name: 'Ghost', section: 'verse', energy: 3, presets: ['ghost'], fadeInBeats: 0, fadeOutBeats: 0 },
          ],
        },
        rig,
        120
      );

      expect(presets.map((preset) => preset.name)).toEqual(['Color', 'Dimmed', 'Zoom']);
      expect(value(presets[0], FixtureCapabilityType.Intensity).valuePercentage).toBe(1);
      // the movers are brightened by another preset
      expect(value(presets[2], FixtureCapabilityType.Intensity)).toBeUndefined();
      expect(scenes.map((scene) => scene.name)).toEqual(['All']);
      expect(scenes[0].presetUuids.length).toBe(3);
    });
  });

  describe('the looks played before they are added', () => {
    const twoLooks = (): AiLooks => ({
      name: 'Neon night',
      summary: '',
      presets: [
        { ...nothing, id: 'wash', name: 'Pink wash', groups: ['rgb-par'], dimmer: 1, color: '#ff0000' },
        { ...nothing, id: 'heads', name: 'Heads', groups: ['mover'], dimmer: 1 },
      ],
      scenes: [
        { name: 'Verse', section: 'verse', energy: 2, presets: ['wash'], fadeInBeats: 0, fadeOutBeats: 0 },
        { name: 'Chorus', section: 'chorus', energy: 5, presets: ['heads', 'wash'], fadeInBeats: 0, fadeOutBeats: 0 },
        { name: 'Empty', section: 'verse', energy: 1, presets: ['missing'], fadeInBeats: 0, fadeOutBeats: 0 },
      ],
    });

    it('play a scene on the stage, leaving the project as it is', () => {
      const compiled = service.compile(twoLooks(), service.getRig(), 120);

      // a scene of the looks without a preset left is left out, the others know the scene of the looks they come from
      expect(compiled.scenes.map((scene) => scene.name)).toEqual(['Verse', 'Chorus']);
      expect(compiled.sources.map((scene) => scene.name)).toEqual(['Verse', 'Chorus']);
      expect(service.getScenePresets(compiled, compiled.scenes[1]).map((preset) => preset.name)).toEqual(['Heads', 'Pink wash']);
      expect(projectService.project.presets.length).toBe(0);
      expect(channelValue('fixture-1', 'Red')).toBeFalsy();

      previewService.previewAiScene(compiled.scenes[0], service.getScenePresets(compiled, compiled.scenes[0]), 0);
      expect(previewService.aiPreviewScene).toBe(compiled.scenes[0]);
      expect(channelValue('fixture-1', 'Red', 100)).toBe(255);
      expect(projectService.project.presets.length).toBe(0);

      previewService.endAiPreview();
      expect(previewService.aiPreviewScene).toBeUndefined();
      expect(channelValue('fixture-1', 'Red', 100)).toBeFalsy();
    });

    it('add the scenes picked with the presets they play, the scene played playing on', () => {
      const compiled = service.compile(twoLooks(), service.getRig(), 120);
      const [verse, chorus] = compiled.scenes;

      const added = service.addCompiled(compiled, 'Neon night', [verse], chorus);

      // the heads only play in the chorus, which is left out: the first scene added plays
      expect(added.scenes).toEqual([verse]);
      expect(projectService.project.presets.map((preset) => preset.name)).toEqual(['Pink wash']);
      expect(projectService.project.scenes.map((scene) => scene.name)).toEqual(['Verse']);
      expect(sceneService.selectedScenes).toEqual([verse]);

      // the scene played, when it is added
      const again = service.compile(twoLooks(), service.getRig(), 120);
      service.addCompiled(again, 'Neon night', again.scenes, again.scenes[1]);
      expect(sceneService.selectedScenes).toEqual([again.scenes[1]]);

      // nothing picked adds nothing
      const none = service.compile(twoLooks(), service.getRig(), 120);
      expect(service.addCompiled(none, 'Neon night', []).scenes).toEqual([]);
    });
  });

  describe('the panel', () => {
    it('opens for a logged in user, after asking a visitor to log in, and closes', () => {
      const toggled: boolean[] = [];
      service.panelToggled.subscribe((open) => toggled.push(open));
      const login = spyOn(TestBed.inject(UserEnsureLoginService), 'login').and.returnValue(of(null));

      service.start();
      service.openPanel();
      expect(login).toHaveBeenCalled();
      expect(service.panelOpen).toBe(true);

      service.closePanel();
      service.closePanel();
      expect(service.panelOpen).toBe(false);
      expect(toggled).toEqual([true, false]);
    });

    it('stays closed for a visitor who does not log in', () => {
      spyOn(TestBed.inject(UserEnsureLoginService), 'login').and.returnValue(EMPTY);

      service.start();

      expect(service.panelOpen).toBe(false);
    });

    it('remembers the tip about it as seen, and skips it without a storage', () => {
      const stored = localStorage.getItem('aiTipSeen');
      localStorage.removeItem('aiTipSeen');

      expect(service.tipSeen).toBe(false);
      service.dismissTip();
      expect(service.tipSeen).toBe(true);

      spyOn(localStorage, 'getItem').and.throwError('blocked');
      spyOn(localStorage, 'setItem').and.throwError('blocked');
      expect(service.tipSeen).toBe(true);
      expect(() => service.dismissTip()).not.toThrow();

      (localStorage.getItem as jasmine.Spy).and.callThrough();
      (localStorage.setItem as jasmine.Spy).and.callThrough();
      if (stored === null) {
        localStorage.removeItem('aiTipSeen');
      } else {
        localStorage.setItem('aiTipSeen', stored);
      }
    });
  });

  describe('the requests', () => {
    it('ask the API with the token of the user, sending the groups without their fixtures', () => {
      const http = TestBed.inject(HttpTestingController);
      spyOn(TestBed.inject(UserService), 'getHeaders').and.returnValue(new HttpHeaders({ Authorization: 'token-1' }));
      const rig = service.getRig();
      const request = service.getRequest(rig, defaultAiSettings(128), 'Synthwave');

      service.getStatus().subscribe();
      const status = http.expectOne('ai-looks');
      expect(status.request.method).toBe('GET');
      expect(status.request.headers.get('Authorization')).toBe('token-1');
      status.flush({ available: true });

      service.design(request).subscribe();
      const design = http.expectOne('ai-looks');
      expect(design.request.method).toBe('POST');
      expect(design.request.headers.get('Content-Type')).toBe('application/json');
      const body = JSON.parse(design.request.body);
      expect(body.rig.groups[0]).toEqual(groupOf(rig, 'RGB par').group);
      expect(body.rig.groups[0].fixtureUuids).toBeUndefined();
      expect(body.settings.bpm).toBe(128);
      expect(body.prompt).toBe('Synthwave');
      expect(body.current).toBeUndefined();
      design.flush({});
      http.verify();
    });

    it('send no token for a user who is not logged in', () => {
      const http = TestBed.inject(HttpTestingController);
      spyOn(TestBed.inject(UserService), 'getHeaders').and.returnValue(null);

      service.design(service.getRequest(service.getRig(), defaultAiSettings(), '')).subscribe({ error: () => undefined });
      const design = http.expectOne('ai-looks');
      expect(design.request.headers.has('Authorization')).toBe(false);
      expect(design.request.headers.get('Content-Type')).toBe('application/json');
      design.flush({ error: 'unauthorized' }, { status: 401, statusText: 'Unauthorized' });
      http.verify();
    });

    it('send the looks to change with the instruction', () => {
      const looks = oneLook({ groups: ['rgb-par'], dimmer: 1 });
      const request = service.getRequest(service.getRig(), defaultAiSettings(), '', looks, 'Warmer');

      expect(request.current).toBe(looks);
      expect(request.instruction).toBe('Warmer');
      expect(service.getRequest(service.getRig(), defaultAiSettings(), '', looks, '').current).toBeUndefined();
    });
  });
});
