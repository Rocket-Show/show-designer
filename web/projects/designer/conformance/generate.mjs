// Writes the generated case files of the conformance cases (see README.md): their inputs only, the
// expected values are recorded from the designer by record.mjs, which runs this first. The inputs
// come from a seeded random source, so they come out the same every time.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const conformance = dirname(fileURLToPath(import.meta.url));

// mulberry32: a small random source which gives the same numbers for the same seed
function randomSource(seed) {
  let state = seed;

  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const random = {
    next,
    pick: (list) => list[Math.floor(next() * list.length)],
    chance: (probability) => next() < probability,
    int: (max) => Math.floor(next() * max),
    // a number with up to three decimals, like a time typed in or worked out
    number: (max) => Math.round(next() * max * 1000) / 1000,
    // set a property only some of the time: a project of an older designer doesn't have it
    maybe: (object, key, values, probability = 0.85) => {
      if (next() < probability) {
        object[key] = random.pick(values);
      }
    },
  };

  return random;
}

// A case file with each case on a line of its own, so a difference shows which cases it touches
export function writeCaseFile(path, caseFile) {
  const { cases, ...header } = caseFile;
  const lines = Object.entries(header).map(([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)},`);
  const caseLines = cases.map((conformanceCase, index) => `    ${JSON.stringify(conformanceCase)}${index < cases.length - 1 ? ',' : ''}`);

  writeFileSync(path, ['{', ...lines, '  "cases": [', ...caseLines, '  ]', '}', ''].join('\n'));
}

function write(fileName, kind, description, cases) {
  writeCaseFile(join(conformance, 'cases', fileName), {
    kind,
    description,
    generated: 'by generate.mjs, the expected values recorded by record.mjs',
    cases,
  });
  return fileName;
}

// ---- transition curves ------------------------------------------------------------------------

function transitionCurves() {
  const cases = [];

  for (const curve of ['linear', 'ease-in', 'ease-out', 'ease-in-out', 'snap', 'from-a-newer-designer', null]) {
    for (const position of [-1, 0, 0.001, 0.1, 0.25, 1 / 3, 0.4999, 0.5, 0.75, 0.999, 1, 2, null]) {
      cases.push({ name: `${curve} at ${position}`, input: { curve, position } });
    }
  }

  return write('transition-curve.json', 'transitionCurve', 'The curves of the transitions and fades', cases);
}

// ---- effect curves ----------------------------------------------------------------------------

function effectCurve(random, index) {
  const curve = { type: 'curve', uuid: 'curve-' + index, capabilities: [], channels: [] };

  random.maybe(curve, 'curveType', ['sine', 'square', 'triangle', 'sawtooth', 'reverse-sawtooth', 'from-a-newer-designer'], 0.95);
  random.maybe(curve, 'lengthMode', ['millis', 'beats'], 0.9);
  random.maybe(curve, 'lengthMillis', [1, 100, 1000, 1234.5, 2500, 6857.142857]);
  random.maybe(curve, 'lengthBeats', [0.25, 0.5, 1, 3, 4, 0]);
  random.maybe(curve, 'phaseMillis', [0, 125, -300, 999.9], 0.7);
  random.maybe(curve, 'phaseBeats', [0, 0.5, -1, 2.25], 0.7);
  random.maybe(curve, 'amplitude', [1, 0.5, 2, 0, 0.3]);
  random.maybe(curve, 'position', [0.5, 0, 1, 0.25, -0.5, 1.5]);
  random.maybe(curve, 'dutyCycle', [0.5, 0, 0.1, 0.3, 0.7, 0.9, 1, -0.2, 1.3]);
  random.maybe(curve, 'runMode', ['infinite', 'cycles', 'duration']);
  random.maybe(curve, 'runCycles', [1, 2, 1.5, 0, 3.4], 0.7);
  random.maybe(curve, 'runDurationMillis', [0, 300, 5000, 1234.5], 0.7);
  random.maybe(curve, 'endMode', ['hold', 'base']);
  random.maybe(curve, 'phasingMode', ['millis', 'beats', 'spread']);
  random.maybe(curve, 'phasingMillis', [0, 100, -250, 333.3]);
  random.maybe(curve, 'phasingBeats', [0, 1, -0.5, 0.25], 0.7);
  random.maybe(curve, 'phasingCycles', [1, 0.5, -1, 2, 0.33], 0.7);
  random.maybe(curve, 'phasingGroupSize', [1, 2, 3, 1.5, 2.5, 0], 0.7);

  // the designer writes null for a number it couldn't work out
  if (random.chance(0.05)) {
    curve[random.pick(['lengthMillis', 'amplitude', 'position', 'phasingMillis', 'dutyCycle'])] = null;
  }

  return curve;
}

function effectCurves() {
  const random = randomSource(1);
  const cases = [];
  const times = [0, 0.5, 1, 99.99, 250, 499.999, 500, 777, 1000, 1999, 2600, 5000, 12345.678, 100000];

  for (let index = 0; index < 250; index++) {
    const curve = effectCurve(random, index);
    const input = { curve, samples: [] };
    random.maybe(input, 'fixtureCount', [1, 4, 5, 7], 0.8);
    random.maybe(input, 'beatsPerMinute', [0, 60, 120, 128, 140.5], 0.7);

    for (let sample = 0; sample < 12; sample++) {
      input.samples.push({
        timeMillis: random.chance(0.5) ? random.pick(times) : random.number(20000),
        fixtureIndex: random.int((input.fixtureCount || 1) + 1),
      });
    }

    cases.push({ name: `${curve.curveType || 'default'} curve ${index}`, input });
  }

  return write('effect-curve.json', 'effectCurve', 'Effect curves: their period, phase, run and chase, sampled over time', cases);
}

// ---- the steps of presets ---------------------------------------------------------------------

const channelIdentities = [
  { profileUuid: 'p1', channelName: 'Dimmer' },
  { profileUuid: 'p1', channelName: 'Red' },
  { profileUuid: 'p2', channelName: 'Pan' },
];

const capabilityIdentities = [
  { type: 'Intensity' },
  { type: 'ColorIntensity', color: 'Red' },
  { type: 'ColorIntensity', color: 'Warm White' },
  { type: 'Pan', profileUuid: 'p2' },
  { type: 'WheelSlot', wheel: 'Color Wheel' },
];

function stepValues(random) {
  const values = { fixtureChannelValues: [], fixtureCapabilityValues: [] };

  for (const identity of channelIdentities) {
    if (random.chance(0.6)) {
      values.fixtureChannelValues.push({ ...identity, value: random.chance(0.2) ? random.pick([0, 255]) : random.number(255) });
    }
  }

  for (const identity of capabilityIdentities) {
    if (random.chance(0.6)) {
      const value = { ...identity };

      if (identity.type === 'WheelSlot') {
        value.slotNumber = random.pick([1, 2, 2.5, 0, null]);
      } else {
        value.valuePercentage = random.chance(0.08) ? null : random.chance(0.2) ? random.pick([0, 1]) : random.number(1);
      }

      values.fixtureCapabilityValues.push(value);
    }
  }

  return values;
}

function presetWithSteps(random, index) {
  const preset = { uuid: 'preset-' + index, steps: [], effects: [] };
  const stepCount = random.pick([0, 1, 2, 2, 3, 3, 4]);
  let startMillis = random.pick([0, 0, 250]);

  for (let stepIndex = 0; stepIndex < stepCount; stepIndex++) {
    const step = { uuid: `step-${index}-${stepIndex}`, startMillis, ...stepValues(random), effectAmounts: [] };
    random.maybe(step, 'transitionMillis', [null, 0, 100, 333.3, 5000], 0.6);
    random.maybe(step, 'transitionCurve', ['linear', 'ease-in', 'ease-out', 'ease-in-out', 'snap']);

    for (const effectUuid of ['e1', 'e2']) {
      if (random.chance(0.4)) {
        step.effectAmounts.push({ effectUuid, amount: random.pick([0, 0.5, 1, 0.25]) });
      }
    }

    preset.steps.push(step);
    startMillis += random.pick([100, 500, 1000, 1234.5]);
  }

  if (stepCount === 0) {
    // a project before the steps keeps its values on the preset
    Object.assign(preset, stepValues(random));
  }

  random.maybe(preset, 'stepsLoop', [true, false]);
  random.maybe(preset, 'stepsLoopMillis', [null, 0, 1500, 4000.5], 0.4);
  random.maybe(preset, 'stepsPhasingMode', ['millis', 'spread']);
  random.maybe(preset, 'stepsPhasingMillis', [0, 100, -50.5]);
  random.maybe(preset, 'stepsPhasingCycles', [1, 0.5, 0, -1]);
  random.maybe(preset, 'stepsPhasingGroupSize', [1, 2, 1.5, 2.5]);

  return preset;
}

function presetSteps() {
  const random = randomSource(2);
  const cases = [];

  for (let index = 0; index < 150; index++) {
    const preset = presetWithSteps(random, index);
    const input = { preset, samples: [] };
    random.maybe(input, 'fixtureCount', [1, 5], 0.7);
    const ends = preset.steps.map((step) => step.startMillis);

    for (let sample = 0; sample < 10; sample++) {
      const near =
        ends.length > 0 && random.chance(0.5) ? random.pick(ends) + random.pick([-1, 0, 0.5, 1, 50, 99.9]) : random.number(9000) - 100;

      input.samples.push({ timeMillis: near, fixtureIndex: random.int(5) });
    }

    cases.push({ name: `${preset.steps.length} steps ${index}`, input });
  }

  return write('preset-steps.json', 'presetSteps', 'The state of a preset running through its steps, also chased over its fixtures', cases);
}

// ---- the intensity of presets and scenes ------------------------------------------------------

function presetIntensity() {
  const random = randomSource(3);
  const curves = ['linear', 'ease-in', 'ease-out', 'ease-in-out', 'snap'];
  const cases = [];

  for (let index = 0; index < 200; index++) {
    const input = { preset: {}, times: [] };
    const regionStart = random.pick([0, 1000, 2500.5]);
    const regionEnd = regionStart + random.pick([1000, 4000, 10000, 6857.142857]);

    if (random.chance(0.85)) {
      input.scene = {};
      random.maybe(input.scene, 'dimmer', [1, 0.5, 0, 0.25, null]);
      random.maybe(input.scene, 'fadeInMillis', [0, 500, 2000, 1234.5, null]);
      random.maybe(input.scene, 'fadeOutMillis', [0, 500, 2000, 1234.5]);
      random.maybe(input.scene, 'fadeInCurve', curves);
      random.maybe(input.scene, 'fadeOutCurve', curves);
      random.maybe(input.scene, 'fadeInPre', [true, false], 0.5);
      random.maybe(input.scene, 'fadeOutPost', [true, false], 0.5);
    }

    if (random.chance(0.8)) {
      input.region = { startMillis: regionStart, endMillis: regionEnd };
    }

    random.maybe(input.preset, 'startMillis', [null, 0, 500, 250.25], 0.5);
    random.maybe(input.preset, 'endMillis', [null, 3000, 800, 5000.5], 0.5);
    random.maybe(input.preset, 'fadeInMillis', [0, 300, 1000, 2000]);
    random.maybe(input.preset, 'fadeOutMillis', [0, 300, 1000, 2000]);
    random.maybe(input.preset, 'fadeInCurve', curves);
    random.maybe(input.preset, 'fadeOutCurve', curves);
    random.maybe(input.preset, 'fadeInPre', [true, false], 0.5);
    random.maybe(input.preset, 'fadeOutPost', [true, false], 0.5);

    for (const time of [regionStart - 1500, regionStart - 1, regionStart, regionStart + 0.5, regionStart + 250, regionStart + 999.9]) {
      input.times.push(time);
    }
    for (const time of [regionEnd - 1000, regionEnd - 250.25, regionEnd, regionEnd + 300, regionEnd + 2500]) {
      input.times.push(time);
    }
    input.times.push(random.number(regionEnd + 3000));

    cases.push({ name: `intensity ${index}`, input });
  }

  return write(
    'preset-intensity.json',
    'presetIntensity',
    'How much of a preset reaches the stage: scene dimmer and fades of scenes and presets',
    cases
  );
}

// ---- frames: the values of every fixture of a project -----------------------------------------

function libraryProfile(name) {
  return JSON.parse(readFileSync(join(conformance, 'profiles', name + '.json'), 'utf8'));
}

// the pixel keys and the pixel groups of a profile of the library, which a preset can name
function pixelNames(profile) {
  if (!profile.matrix) {
    return [];
  }

  let keys = [];

  if (profile.matrix.pixelKeys) {
    keys = profile.matrix.pixelKeys.flat(2).filter((key) => key !== null);
  } else if (profile.matrix.pixelCount) {
    // the profiles of the cases count their pixels along one axis only
    const count = Math.max(...profile.matrix.pixelCount);
    keys = Array.from({ length: count }, (_, index) => String(index + 1));
  }

  return keys.concat(Object.keys(profile.matrix.pixelGroups || {}));
}

function presetFixtures(fixtureUuid, profile) {
  return [{ fixtureUuid }, ...pixelNames(profile).map((pixelKey) => ({ fixtureUuid, pixelKey }))];
}

const libraryProfiles = [
  'adb/alc4',
  'chauvet-dj/colorband-pix',
  'dts/xr4-spot',
  'elation/uni-bar',
  'etc/source-four-led-series-2-daylight-hd',
  'hong-yi/hy-g60',
  'ibiza-light/ls-005led',
  'panasonic/pt-rz120',
  'stairville/mh-100',
  'varytec/easy-move-xs-hp-wash-7x8w-rgbw',
];

function capability(type, valuePercentage, extra = {}) {
  return { type, valuePercentage, ...extra };
}

// every mode of the profiles of the library, lit by a preset with a dimmer, a color, a position and
// a wheel slot, and by one with a color only, which a color wheel has to approximate
function libraryModes() {
  const cases = [];

  for (const name of libraryProfiles) {
    const profile = libraryProfile(name);
    const wheel = Object.keys(profile.wheels || {})[0];

    for (const mode of profile.modes) {
      const modeName = mode.shortName || mode.name;
      const looks = {
        full: [
          capability('Intensity', 0.7),
          capability('ColorIntensity', 1, { color: 'Red' }),
          capability('ColorIntensity', 0.25, { color: 'Green' }),
          capability('ColorIntensity', 0.5, { color: 'Blue' }),
          capability('ColorIntensity', 0.1, { color: 'White' }),
          capability('Pan', 0.3),
          capability('Tilt', 0.6),
          ...(wheel ? [{ type: 'WheelSlot', wheel, slotNumber: 2 }] : []),
        ],
        color: [
          capability('Intensity', 0.35),
          capability('ColorIntensity', 0, { color: 'Red' }),
          capability('ColorIntensity', 0.1, { color: 'Green' }),
          capability('ColorIntensity', 0.9, { color: 'Blue' }),
        ],
      };

      for (const [look, capabilityValues] of Object.entries(looks)) {
        cases.push({
          name: `${name} ${modeName} ${look}`,
          input: {
            project: {
              version: 10,
              fixtureProfiles: [{ $profile: name }],
              fixtures: [{ uuid: 'fixture', profileUuid: name, modeShortName: modeName, dmxUniverseUuid: 'u', dmxFirstChannel: 0 }],
              presetFixtures: presetFixtures('fixture', profile),
              presets: [
                {
                  uuid: 'look',
                  fixtures: presetFixtures('fixture', profile),
                  steps: [{ uuid: 'look-step', fixtureCapabilityValues: capabilityValues }],
                },
              ],
              scenes: [],
              compositions: [],
            },
            runs: [{ preview: { mode: 'preset', preset: 'look' }, times: [0] }],
          },
        });
      }
    }
  }

  return write('channel-values-library.json', 'channelValues', 'Every mode of the fixture profiles of the cases, lit by a preset', cases);
}

// the fixtures the scenarios play: pars with and without a dimmer (profiles/test), a moving head
// and a pixel bar of the fixture library
const testProfiles = ['test/rgb-par', 'test/rgb', 'test/moving-head'];

const testFixtures = [
  { uuid: 'par-1', profileUuid: 'test/rgb-par', modeShortName: '6ch', dmxUniverseUuid: 'u', dmxFirstChannel: 0 },
  { uuid: 'par-2', profileUuid: 'test/rgb-par', modeShortName: '6ch', dmxUniverseUuid: 'u', dmxFirstChannel: 10 },
  // the same lamp as par 2, patched twice
  { uuid: 'par-2-twin', profileUuid: 'test/rgb-par', modeShortName: '6ch', dmxUniverseUuid: 'u', dmxFirstChannel: 10 },
  { uuid: 'rgb', profileUuid: 'test/rgb', modeShortName: '4ch', dmxUniverseUuid: 'u', dmxFirstChannel: 20 },
  { uuid: 'head-1', profileUuid: 'test/moving-head', modeShortName: '6ch', dmxUniverseUuid: 'v', dmxFirstChannel: 0 },
  { uuid: 'head-2', profileUuid: 'test/moving-head', modeShortName: '6ch', dmxUniverseUuid: 'v', dmxFirstChannel: 6 },
  { uuid: 'bar', profileUuid: 'chauvet-dj/colorband-pix', modeShortName: '36ch', dmxUniverseUuid: 'w', dmxFirstChannel: 0 },
];

function scenarioProject(random) {
  const bar = libraryProfile('chauvet-dj/colorband-pix');
  const allFixtures = testFixtures.flatMap((fixture) =>
    fixture.uuid === 'bar' ? presetFixtures('bar', bar) : [{ fixtureUuid: fixture.uuid }]
  );

  return {
    version: 10,
    masterDimmerValue: random.pick([1, 1, 0.5]),
    fixtureProfiles: [...testProfiles, 'chauvet-dj/colorband-pix'].map((name) => ({ $profile: name })),
    fixtures: testFixtures,
    presetFixtures: allFixtures,
    presets: [],
    scenes: [],
    compositions: [{ uuid: 'song', name: 'Song', beatsPerMinute: random.pick([120, 128, 93.5]), tracks: [], scenePlaybackRegions: [] }],
    selectedCompositionUuid: random.pick(['song', undefined]),
  };
}

function randomEffect(random, index) {
  const curve = effectCurve(random, index);
  curve.uuid = 'effect-' + index;
  curve.visible = random.pick([true, true, true, false, undefined]);

  if (random.chance(0.6)) {
    curve.capabilities = [
      random.pick([{ type: 'Intensity' }, { type: 'Pan' }, { type: 'Tilt' }, { type: 'ColorIntensity', color: 'Blue' }]),
    ];
  } else {
    curve.channels = [
      {
        profileUuid: random.pick(['test/rgb-par', 'test/rgb', 'chauvet-dj/colorband-pix']),
        channels: [random.pick(['Strobe', 'Red', 'Zero', 'Red 1', 'Green 3'])],
      },
    ];
  }

  return curve;
}

function randomCapabilityValues(random) {
  const values = [];

  if (random.chance(0.8)) values.push(capability('Intensity', random.number(1)));
  if (random.chance(0.7)) values.push(capability('ColorIntensity', random.number(1), { color: 'Red' }));
  if (random.chance(0.5)) values.push(capability('ColorIntensity', random.number(1), { color: 'Green' }));
  if (random.chance(0.6)) values.push(capability('ColorIntensity', random.number(1), { color: 'Blue' }));
  if (random.chance(0.4)) values.push(capability('Pan', random.number(1)));
  if (random.chance(0.4)) values.push(capability('Tilt', random.number(1)));
  if (random.chance(0.2)) values.push({ type: 'WheelSlot', wheel: 'Color Wheel', slotNumber: random.pick([1, 2, 2.5, 3]) });
  if (random.chance(0.1)) values.push(capability('Intensity', random.number(1), { profileUuid: 'test/moving-head' }));

  return values;
}

function randomPreset(random, project, index) {
  const pick = project.presetFixtures.filter(() => random.chance(0.55));
  const preset = {
    uuid: 'preset-' + index,
    name: 'Preset ' + index,
    fixtures: pick.length > 0 ? pick : [project.presetFixtures[0]],
    useGlobalFixtureOrder: random.pick([true, true, false]),
    steps: [],
    effects: [],
    mirrorPan: random.chance(0.2),
    mirrorTilt: random.chance(0.2),
  };

  if (!preset.useGlobalFixtureOrder) {
    preset.fixtures = preset.fixtures.slice().reverse();
  }

  const stepCount = random.pick([1, 1, 2, 3]);
  let startMillis = 0;

  for (let stepIndex = 0; stepIndex < stepCount; stepIndex++) {
    const step = {
      uuid: `${preset.uuid}-step-${stepIndex}`,
      startMillis,
      fixtureCapabilityValues: randomCapabilityValues(random),
      fixtureChannelValues: [],
      effectAmounts: [],
    };
    random.maybe(step, 'transitionMillis', [null, 0, 300], 0.5);
    random.maybe(step, 'transitionCurve', ['linear', 'ease-in-out', 'snap']);

    if (random.chance(0.3)) {
      step.fixtureChannelValues.push({ profileUuid: 'test/rgb-par', channelName: 'Strobe', value: random.int(256) });
    }

    preset.steps.push(step);
    startMillis += random.pick([500, 1000, 1500]);
  }

  random.maybe(preset, 'stepsLoop', [true, false]);
  random.maybe(preset, 'stepsPhasingMode', ['millis', 'spread'], 0.4);
  random.maybe(preset, 'stepsPhasingMillis', [0, 150], 0.4);
  random.maybe(preset, 'stepsPhasingGroupSize', [1, 2, 1.5], 0.4);

  const effectCount = random.pick([0, 0, 1, 2]);

  for (let effectIndex = 0; effectIndex < effectCount; effectIndex++) {
    const effect = randomEffect(random, index * 10 + effectIndex);
    preset.effects.push(effect);

    if (random.chance(0.3)) {
      preset.steps[0].effectAmounts.push({ effectUuid: effect.uuid, amount: random.pick([0, 0.5]) });
    }
  }

  random.maybe(preset, 'startMillis', [null, 500, 1250.5], 0.3);
  random.maybe(preset, 'endMillis', [null, 3000, 4500], 0.3);
  random.maybe(preset, 'fadeInMillis', [0, 400, 1000], 0.6);
  random.maybe(preset, 'fadeOutMillis', [0, 400, 1000], 0.6);
  random.maybe(preset, 'fadeInCurve', ['linear', 'ease-in', 'snap'], 0.5);
  random.maybe(preset, 'fadeInPre', [true, false], 0.3);
  random.maybe(preset, 'fadeOutPost', [true, false], 0.3);

  return preset;
}

// projects with random presets, scenes and clips, played on the timeline, as a preset of their own
// and as the selected scenes
function scenarios() {
  const random = randomSource(4);
  const cases = [];

  for (let index = 0; index < 30; index++) {
    const project = scenarioProject(random);
    const presetCount = 1 + random.int(4);

    for (let presetIndex = 0; presetIndex < presetCount; presetIndex++) {
      project.presets.push(randomPreset(random, project, presetIndex));
    }

    const sceneCount = 1 + random.int(3);

    for (let sceneIndex = 0; sceneIndex < sceneCount; sceneIndex++) {
      const scene = {
        uuid: 'scene-' + sceneIndex,
        name: 'Scene ' + sceneIndex,
        presetUuids: project.presets.filter(() => random.chance(0.6)).map((preset) => preset.uuid),
      };
      random.maybe(scene, 'dimmer', [1, 1, 0.6, 0.3]);
      random.maybe(scene, 'fadeInMillis', [0, 500, 2000]);
      random.maybe(scene, 'fadeOutMillis', [0, 500, 2000]);
      random.maybe(scene, 'fadeInCurve', ['linear', 'ease-out'], 0.5);
      random.maybe(scene, 'fadeInPre', [true, false], 0.3);
      random.maybe(scene, 'fadeOutPost', [true, false], 0.3);
      project.scenes.push(scene);
    }

    const composition = project.compositions[0];
    const trackCount = 1 + random.int(3);

    for (let trackIndex = 0; trackIndex < trackCount; trackIndex++) {
      const track = { uuid: 'track-' + trackIndex, name: 'Track ' + trackIndex };
      random.maybe(track, 'hidden', [true, false], 0.2);
      random.maybe(track, 'solo', [true, false], 0.2);
      composition.tracks.push(track);

      let startMillis = random.pick([0, 0, 1000.5]);

      for (let clip = 0; clip < 1 + random.int(3); clip++) {
        const endMillis = startMillis + random.pick([2000, 3000, 6857.142857]);
        composition.scenePlaybackRegions.push({
          sceneUuid: random.pick(project.scenes).uuid,
          startMillis,
          endMillis,
          trackUuid: track.uuid,
        });
        startMillis = endMillis + random.pick([0, 0, 500]);
      }
    }

    const times = [];
    for (let time = 0; time <= 16000; time += 500) {
      times.push(time + random.pick([0, 0, 0.5]));
    }

    const preset = random.pick(project.presets);
    const step = random.pick(preset.steps);
    const runs = [
      { preview: { mode: 'timeline', composition: 'Song' }, times },
      { preview: { mode: 'preset', preset: preset.uuid, step: step.uuid }, times: [0, 750, 3333] },
      { preview: { mode: 'preset', preset: preset.uuid, stepPreviewStartMillis: 250 }, times: [0, 250, 900, 1750.5, 4000] },
      { preview: { mode: 'scenes', scenes: project.scenes.filter(() => random.chance(0.6)).map((scene) => scene.uuid) }, times: [0, 1200] },
    ];

    cases.push({ name: `scenario ${index}`, input: { project, runs } });
  }

  return write(
    'channel-values-scenarios.json',
    'channelValues',
    'Projects with presets, steps, effects, scenes and clips on tracks, played like the designer previews them',
    cases
  );
}

// ---- edges: values right on the boundaries the cases above pass by ------------------------------

// times exactly where a fade starts or ends, also where a fade in still runs as the fade out
// starts, and fades whose position comes out a hair off 1 right on their edge (1333.3 - 1000 is a
// hair less than 333.3)
function presetIntensityEdges() {
  const cases = [
    {
      name: 'a fade in still running where the fade out starts',
      input: {
        preset: { fadeInMillis: 1500, fadeOutMillis: 1000 },
        region: { startMillis: 1000, endMillis: 3000 },
        times: [1000, 2000, 2500, 3000],
      },
    },
    {
      name: 'right at the end of a fade in of 333.3 ms',
      input: { preset: { fadeInMillis: 333.3 }, region: { startMillis: 1000, endMillis: 5000 }, times: [1000, 1333.3, 1333.4] },
    },
    {
      name: 'right at the start of a fade out of 100.1 ms',
      input: { preset: { fadeOutMillis: 100.1 }, region: { startMillis: 0, endMillis: 3000 }, times: [2899.8, 2899.9, 3000] },
    },
    {
      name: 'the fades of a preset with times of its own, on their edges',
      input: {
        preset: {
          startMillis: 500,
          endMillis: 2500,
          fadeInMillis: 1000,
          fadeOutMillis: 1000,
          fadeInCurve: 'ease-in',
          fadeOutCurve: 'ease-out',
        },
        region: { startMillis: 1000, endMillis: 5000 },
        times: [1500, 2500, 3500],
      },
    },
    {
      name: 'the fades of a scene on their edges, the scene fading in before its clip',
      input: {
        preset: {},
        scene: { fadeInMillis: 333.3, fadeOutMillis: 100.1, fadeInPre: true },
        region: { startMillis: 1333.3, endMillis: 3000 },
        times: [1000, 1333.3, 2899.9, 3000],
      },
    },
  ];

  return write(
    'preset-intensity-edges.json',
    'presetIntensity',
    'How much of a preset reaches the stage right on the edges of its fades',
    cases
  );
}

function step(uuid, startMillis, values, extra = {}) {
  return { uuid, startMillis, fixtureChannelValues: [], fixtureCapabilityValues: [], effectAmounts: [], ...values, ...extra };
}

function presetStepsEdges() {
  const dimmer = (value) => ({ fixtureChannelValues: [{ profileUuid: 'p1', channelName: 'Dimmer', value }] });
  const rotation = (valuePercentage) => ({ fixtureCapabilityValues: [{ type: 'WheelRotation', wheel: 'Gobo Wheel', valuePercentage }] });
  const samples = (times) => times.map((timeMillis) => ({ timeMillis, fixtureIndex: 0 }));

  const cases = [
    {
      // a pass through such steps lasts no time at all: there is nothing to start over
      name: 'a looping preset with all of its steps at the same time',
      input: {
        preset: { uuid: 'same-time', stepsLoop: true, steps: [step('a', 0, dimmer(10)), step('b', 0, dimmer(200))] },
        samples: samples([-100, 0, 500]),
      },
    },
    {
      name: 'a wheel turning faster from one step to the next keeps its wheel',
      input: {
        preset: {
          uuid: 'rotation',
          steps: [step('slow', 0, rotation(0.2)), step('fast', 1000, rotation(0.8), { transitionMillis: 1000 })],
        },
        samples: samples([999, 1000, 1500, 2000]),
      },
    },
  ];

  return write('preset-steps-edges.json', 'presetSteps', 'The state of a preset right on the edges of its steps', cases);
}

function edgeFixture(uuid, profileUuid, modeShortName, index) {
  return { uuid, profileUuid, modeShortName, dmxUniverseUuid: 'u', dmxFirstChannel: index * 16 };
}

function edgeProject(profiles, fixtures, presets, scenes) {
  const presetFixturesOfProject = fixtures.flatMap((fixture) => presetFixtures(fixture.uuid, libraryProfile(fixture.profileUuid)));

  return {
    version: 10,
    fixtureProfiles: profiles.map((name) => ({ $profile: name })),
    fixtures,
    presetFixtures: presetFixturesOfProject,
    presets,
    scenes,
    compositions: [],
  };
}

function edgePreset(uuid, fixtures, values) {
  return { uuid, name: uuid, fixtures, steps: [step(uuid + '-step', 0, values)], effects: [] };
}

function previewScenes(sceneUuids) {
  return [{ preview: { mode: 'scenes', scenes: sceneUuids }, times: [0] }];
}

const rgb = (red, green, blue) => [
  capability('ColorIntensity', red, { color: 'Red' }),
  capability('ColorIntensity', green, { color: 'Green' }),
  capability('ColorIntensity', blue, { color: 'Blue' }),
];

// The test profiles test/shared-dimmer, test/wheels and test/pixel-bar: values right on the edges of
// the ranges of a channel, several ranges giving the same brightness, ties on a color wheel, wheels
// named in all the ways the fixture library names them and the channels of pixels
function channelValuesEdges() {
  const cases = [];
  const sharedDimmer = 'test/shared-dimmer';

  // The dimmer of each par is set to a value right on an edge of one of its ranges (off, dark to
  // bright, 20 % to 60 %, bright to off, a strobe), its color to blue. A red preset fading in above
  // blends its color with the blue, weighted by how bright the dimmer lights at that value.
  const dimmerValues = [9, 10, 50, 99, 100, 125, 149, 150, 199, 200, 255];
  const pars = dimmerValues.map((value, index) => edgeFixture('at-' + value, sharedDimmer, '10ch', index));
  const dimmerPresets = pars.map((par, index) =>
    edgePreset('dimmer-' + dimmerValues[index], [{ fixtureUuid: par.uuid }], {
      fixtureChannelValues: [
        { profileUuid: sharedDimmer, channelName: 'Dimmer', value: dimmerValues[index] },
        { profileUuid: sharedDimmer, channelName: 'Blue', value: 255 },
      ],
    })
  );
  const red = edgePreset(
    'red',
    pars.map((par) => ({ fixtureUuid: par.uuid })),
    { fixtureCapabilityValues: [capability('Intensity', 0.8), ...rgb(1, 0, 0)] }
  );

  cases.push({
    name: 'a dimmer sharing its channel, at values right on the edges of its ranges, below a fading preset',
    input: {
      project: edgeProject(
        [sharedDimmer],
        pars,
        [red, ...dimmerPresets],
        [
          { uuid: 'top', name: 'Top', presetUuids: ['red'], dimmer: 0.5 },
          { uuid: 'below', name: 'Below', presetUuids: dimmerPresets.map((preset) => preset.uuid) },
        ]
      ),
      runs: previewScenes(['top', 'below']),
    },
  });

  // Each par lit to another brightness: the channels with several ranges take the one giving it (a
  // range rather than a single brightness), or else the closest one, the brighter one of two as
  // close. A range given in lumens all at 0, a single capability of one brightness and a capability
  // without a range among others.
  const brightnesses = [0, 0.3, 0.5, 0.8, 1];
  const lit = brightnesses.map((brightness, index) => edgeFixture('lit-' + brightness, sharedDimmer, '10ch', index));
  const brightnessPresets = lit.map((par, index) =>
    edgePreset('brightness-' + brightnesses[index], [{ fixtureUuid: par.uuid }], {
      fixtureCapabilityValues: [capability('Intensity', brightnesses[index])],
    })
  );

  cases.push({
    name: 'channels with several ranges of brightness, lit on and between the ranges',
    input: {
      project: edgeProject([sharedDimmer], lit, brightnessPresets, [
        { uuid: 'lit', name: 'Lit', presetUuids: brightnessPresets.map((preset) => preset.uuid) },
      ]),
      runs: previewScenes(['lit']),
    },
  });

  // A spot with a gobo wheel before its color wheel, which a channel named differently than the
  // wheel sets and another one shakes (naming its wheels in a list). Each spot is given a gobo and
  // a color, which the color wheel approximates: yellow lies as close to red, green, white and the
  // split between red and green.
  const wheels = 'test/wheels';
  const colors = { yellow: [1, 1, 0], cyan: [0, 1, 1], blue: [0, 0, 1], magenta: [1, 0, 1] };
  const spots = Object.keys(colors).map((color, index) => edgeFixture(color, wheels, '4ch', index));
  const colorPresets = spots.map((spot) =>
    edgePreset(spot.uuid, [{ fixtureUuid: spot.uuid }], {
      fixtureCapabilityValues: [
        { type: 'WheelSlot', wheel: 'Gobo Wheel', slotNumber: 2 },
        capability('Intensity', 1),
        ...rgb(...colors[spot.uuid]),
      ],
    })
  );
  const slotSpot = edgeFixture('slot', wheels, '4ch', spots.length);
  const slotPreset = edgePreset('slot', [{ fixtureUuid: 'slot' }], {
    fixtureCapabilityValues: [{ type: 'WheelSlot', wheel: 'Color Wheel', slotNumber: 4 }, ...rgb(1, 0, 0)],
  });

  cases.push({
    name: 'a spot approximating colors on its color wheel after setting its gobo',
    input: {
      project: edgeProject(
        [wheels],
        [...spots, slotSpot],
        [...colorPresets, slotPreset],
        [{ uuid: 'colors', name: 'Colors', presetUuids: [...colorPresets, slotPreset].map((preset) => preset.uuid) }]
      ),
      runs: previewScenes(['colors']),
    },
  });

  // A bar of pixels with its channels per channel (all reds, then all greens and all blues), one with
  // a dimmer of its own and pixels without one, and one naming the channels of a pixel directly
  const pixelBar = 'test/pixel-bar';
  const bars = [
    edgeFixture('per-channel', pixelBar, '9ch', 0),
    edgeFixture('with-dimmer', pixelBar, '10ch', 1),
    edgeFixture('named', pixelBar, '4ch', 2),
  ];
  const allParts = bars.flatMap((bar) => presetFixtures(bar.uuid, libraryProfile(pixelBar)));
  const fading = edgePreset('fading', allParts, { fixtureCapabilityValues: [capability('Intensity', 1), ...rgb(1, 0.5, 0)] });

  cases.push({
    name: 'the pixels of bars fading in, their channels per channel, without a dimmer and named directly',
    input: {
      project: edgeProject([pixelBar], bars, [fading], [{ uuid: 'fading', name: 'Fading', presetUuids: ['fading'], dimmer: 0.5 }]),
      runs: previewScenes(['fading']),
    },
  });

  // A preset of a current project without steps, which keeps its values itself like one of an older
  // project, previewed on its own and in its scene
  const par = edgeFixture('par', 'test/rgb-par', '6ch', 0);
  const withoutSteps = {
    uuid: 'without-steps',
    name: 'Without steps',
    fixtures: [{ fixtureUuid: 'par' }],
    steps: [],
    effects: [],
    fixtureCapabilityValues: [capability('Intensity', 1), ...rgb(1, 0, 0.5)],
    fixtureChannelValues: [{ profileUuid: 'test/rgb-par', channelName: 'Strobe', value: 20 }],
  };

  cases.push({
    name: 'a preset without steps keeping its values itself',
    input: {
      project: edgeProject(['test/rgb-par'], [par], [withoutSteps], [{ uuid: 'scene', name: 'Scene', presetUuids: ['without-steps'] }]),
      runs: [{ preview: { mode: 'preset', preset: 'without-steps' }, times: [0] }, ...previewScenes(['scene'])],
    },
  });

  return write(
    'channel-values-edges.json',
    'channelValues',
    'Test fixtures with values right on the edges of their ranges, ties on their wheels and the channels of pixels',
    cases
  );
}

export function generate() {
  return [
    transitionCurves(),
    effectCurves(),
    presetSteps(),
    presetIntensity(),
    libraryModes(),
    scenarios(),
    presetIntensityEdges(),
    presetStepsEdges(),
    channelValuesEdges(),
  ];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log('Wrote ' + generate().join(', '));
}
