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

// A sawtooth of an even duty cycle ramps exactly with the time (a little off it, were it worked out
// like the other duty cycles), and a curve synced to the beat at no tempo or one below zero runs on
// the default tempo
function effectCurveEdges() {
  const samples = (times) => times.map((timeMillis) => ({ timeMillis, fixtureIndex: 0 }));
  const cases = [];

  for (const curveType of ['sawtooth', 'reverse-sawtooth']) {
    cases.push({
      name: `a ${curveType} of an even duty cycle`,
      input: {
        curve: { type: 'curve', uuid: curveType, curveType, lengthMillis: 1000, dutyCycle: 0.5, capabilities: [], channels: [] },
        samples: samples([30, 100, 123.456789, 210.5, 700]),
      },
    });
  }

  for (const beatsPerMinute of [-60, 0]) {
    cases.push({
      name: `a curve synced to the beat at a tempo of ${beatsPerMinute}`,
      input: {
        curve: { type: 'curve', uuid: 'beats', curveType: 'sine', lengthMode: 'beats', lengthBeats: 1, capabilities: [], channels: [] },
        beatsPerMinute,
        samples: samples([0, 125, 250, 400]),
      },
    });
  }

  return write('effect-curve-edges.json', 'effectCurve', 'Effect curves right on the edges of their duty cycle and their tempo', cases);
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
    {
      // a value travels from the one of the step before driving the same: the dimmer of another
      // profile and another wheel are held, each by the step carrying it
      name: 'values of another profile and of another wheel are held, not travelled from',
      input: {
        preset: {
          uuid: 'others',
          steps: [
            step('from', 0, {
              fixtureChannelValues: [{ profileUuid: 'p1', channelName: 'Dimmer', value: 0 }],
              fixtureCapabilityValues: [{ type: 'WheelRotation', wheel: 'Gobo Wheel', valuePercentage: 0.2 }],
            }),
            step(
              'to',
              1000,
              {
                fixtureChannelValues: [{ profileUuid: 'p2', channelName: 'Dimmer', value: 200 }],
                fixtureCapabilityValues: [{ type: 'WheelRotation', wheel: 'Color Wheel', valuePercentage: 0.8 }],
              },
              { transitionMillis: 1000 }
            ),
          ],
        },
        samples: samples([1000, 1500, 2000]),
      },
    },
    {
      // a wheel never stands between two of its slots, also when the values carry a percentage, and
      // also when only one of the two steps names a slot
      name: 'wheel slots carrying a percentage as well turn at once',
      input: {
        preset: {
          uuid: 'slots',
          steps: [
            step('a', 0, {
              fixtureCapabilityValues: [
                { type: 'WheelSlot', wheel: 'Color Wheel', slotNumber: 2, valuePercentage: 0.2 },
                { type: 'WheelSlot', wheel: 'Gobo Wheel', valuePercentage: 0.2 },
                { type: 'WheelSlot', wheel: 'Prism', slotNumber: 1, valuePercentage: 0.2 },
              ],
            }),
            step(
              'b',
              1000,
              {
                fixtureCapabilityValues: [
                  { type: 'WheelSlot', wheel: 'Color Wheel', slotNumber: 3, valuePercentage: 0.8 },
                  { type: 'WheelSlot', wheel: 'Gobo Wheel', slotNumber: 4, valuePercentage: 0.8 },
                  { type: 'WheelSlot', wheel: 'Prism', valuePercentage: 0.8 },
                ],
              },
              { transitionMillis: 1000 }
            ),
          ],
        },
        samples: samples([1000, 1500, 2000]),
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

// How the values of the presets are mixed: fixtures sharing an address, profiles sharing the name
// of a channel, curves on the channels of a profile, an effect which is no curve and colors fading
// over the dimmer below them
function channelValuesMixingEdges() {
  const cases = [];
  const dimmer = {
    uuid: 'dimmer',
    name: 'Dimmer',
    availableChannels: { Dimmer: { capability: { type: 'Intensity' } } },
    modes: [{ name: '1-channel', shortName: '1ch', channels: ['Dimmer'] }],
  };
  // RGB and a color wheel
  const colorWheel = {
    uuid: 'rgb-wheel',
    name: 'RGB and color wheel',
    availableChannels: {
      Dimmer: { capability: { type: 'Intensity' } },
      Red: { capability: { type: 'ColorIntensity', color: 'Red' } },
      Green: { capability: { type: 'ColorIntensity', color: 'Green' } },
      Blue: { capability: { type: 'ColorIntensity', color: 'Blue' } },
      'Color Wheel': {
        capabilities: [
          { dmxRange: [0, 9], type: 'WheelSlot', slotNumber: 1 },
          { dmxRange: [10, 19], type: 'WheelSlot', slotNumber: 2 },
          { dmxRange: [20, 29], type: 'WheelSlot', slotNumber: 3 },
        ],
      },
    },
    wheels: {
      'Color Wheel': { slots: [{ type: 'Open' }, { type: 'Color', colors: ['#ff0000'] }, { type: 'Color', colors: ['#0000ff'] }] },
    },
    modes: [{ name: '5-channel', shortName: '5ch', channels: ['Dimmer', 'Red', 'Green', 'Blue', 'Color Wheel'] }],
  };
  const inlineProfiles = [dimmer, colorWheel];
  const project = (fixtures, presets, scenes, extra = {}) => ({
    version: 10,
    fixtureProfiles: [...inlineProfiles, { $profile: 'test/pixel-bar' }, { $profile: 'test/rgb-par' }],
    fixtures,
    presetFixtures: fixtures.flatMap((fixture) =>
      inlineProfiles.some((profile) => profile.uuid === fixture.profileUuid)
        ? [{ fixtureUuid: fixture.uuid }]
        : presetFixtures(fixture.uuid, libraryProfile(fixture.profileUuid))
    ),
    presets,
    scenes,
    compositions: [],
    ...extra,
  });

  // A fixture on the address of one before it is the same lamp: it takes its values, also its
  // pixels, while a fixture on the address of pixels only is one of its own. Fixtures sharing an
  // address and lit by nothing stay without values.
  cases.push({
    name: 'fixtures sharing an address, with pixels and without',
    input: {
      project: project(
        [
          edgeFixture('bar', 'test/pixel-bar', '9ch', 0),
          edgeFixture('same-bar', 'test/pixel-bar', '9ch', 0),
          edgeFixture('par-on-bar', 'test/rgb-par', '6ch', 0),
          edgeFixture('dimmer', 'dimmer', '1ch', 2),
          edgeFixture('same-dimmer', 'dimmer', '1ch', 2),
        ],
        [edgePreset('red', presetFixtures('bar', libraryProfile('test/pixel-bar')).slice(1), { fixtureCapabilityValues: rgb(1, 0, 0) })],
        [{ uuid: 'scene', name: 'Scene', presetUuids: ['red'] }]
      ),
      runs: previewScenes(['scene']),
    },
  });

  // A channel value is for the channel of its profile only, a curve on channels runs on the ones of
  // its profile, over their whole range
  const curve = {
    type: 'curve',
    uuid: 'curve',
    lengthMillis: 1000,
    capabilities: [],
    channels: [
      { profileUuid: 'test/rgb-par', channels: ['Red', 'Strobe', 'Missing'] },
      { profileUuid: 'dimmer', channels: ['Dimmer'] },
    ],
  };

  cases.push({
    name: 'channel values and curves of profiles sharing the name of a channel',
    input: {
      project: project(
        [edgeFixture('par', 'test/rgb-par', '6ch', 0), edgeFixture('dimmer', 'dimmer', '1ch', 1)],
        [
          {
            ...edgePreset('dimmer-only', [{ fixtureUuid: 'par' }, { fixtureUuid: 'dimmer' }], {
              fixtureChannelValues: [{ profileUuid: 'dimmer', channelName: 'Dimmer', value: 77 }],
            }),
            effects: [curve],
          },
        ],
        []
      ),
      runs: [{ preview: { mode: 'preset', preset: 'dimmer-only' }, times: [0, 125, 250, 600] }],
    },
  });

  // A fixture lighting a color with its own colors leaves its color wheel alone from the moment one
  // of its colors is set (a value set before the colors still lets the wheel show the color), one
  // with a color wheel only shows the color on its wheel
  cases.push({
    name: 'a color on a fixture with colors and a color wheel',
    input: {
      project: project(
        [
          edgeFixture('rgb-wheel', 'rgb-wheel', '5ch', 0),
          edgeFixture('dimmed-first', 'rgb-wheel', '5ch', 1),
          edgeFixture('moving-head', 'test/moving-head', '6ch', 2),
        ],
        [
          edgePreset('red', [{ fixtureUuid: 'rgb-wheel' }, { fixtureUuid: 'moving-head' }], {
            fixtureCapabilityValues: [...rgb(1, 0, 0), capability('Intensity', 1)],
          }),
          edgePreset('dimmed-first', [{ fixtureUuid: 'dimmed-first' }], {
            fixtureCapabilityValues: [capability('Intensity', 1), ...rgb(1, 0, 0)],
          }),
        ],
        [{ uuid: 'scene', name: 'Scene', presetUuids: ['red', 'dimmed-first'] }],
        { fixtureProfiles: [...inlineProfiles, { $profile: 'test/moving-head' }] }
      ),
      runs: previewScenes(['scene']),
    },
  });

  // Colors fading in over a par lit blue at half below them: each fading preset lets its par light
  // as bright as its own dimmer (one for its profile, a dimmer without a value doesn't count), a
  // curve on the dimmer or else the dimmer below, while it blends its color with the blue. A curve
  // only on a color or on channels, or an effect which is no curve, leaves the dimmer below alone.
  const pars = ['own-dimmer', 'dimmer-without-value', 'curve-on-dimmer', 'curve-on-color', 'curve-on-channels', 'pan-tilt'];
  const fading = {
    'own-dimmer': { values: [capability('Intensity', 1, { profileUuid: 'test/rgb-par' })], effects: [] },
    'dimmer-without-value': { values: [capability('Intensity', 0.8), { type: 'Intensity', profileUuid: 'test/rgb-par' }], effects: [] },
    'curve-on-dimmer': {
      values: [],
      effects: [
        {
          type: 'curve',
          uuid: 'dimmer-curve',
          lengthMillis: 4000,
          capabilities: [{ type: 'Intensity' }, { type: 'ColorIntensity', color: 'Green' }],
          channels: [],
        },
      ],
    },
    'curve-on-color': {
      values: [],
      effects: [
        {
          type: 'curve',
          uuid: 'color-curve',
          lengthMillis: 4000,
          capabilities: [{ type: 'ColorIntensity', color: 'Green' }],
          channels: [],
        },
      ],
    },
    'curve-on-channels': {
      values: [],
      effects: [
        {
          type: 'curve',
          uuid: 'channel-curve',
          lengthMillis: 4000,
          capabilities: [],
          channels: [{ profileUuid: 'test/rgb-par', channels: ['Strobe'] }],
        },
      ],
    },
    'pan-tilt': { values: [], effects: [{ type: 'pan-tilt', uuid: 'pan-tilt' }] },
  };
  const fadingPresets = pars.map((par) => ({
    ...edgePreset(par, [{ fixtureUuid: par }], {
      fixtureCapabilityValues: [...fading[par].values, capability('ColorIntensity', 1, { color: 'Red' })],
    }),
    effects: fading[par].effects,
    fadeInMillis: 1000,
  }));
  const below = edgePreset(
    'below',
    pars.map((par) => ({ fixtureUuid: par })),
    { fixtureCapabilityValues: [capability('Intensity', 0.5), capability('ColorIntensity', 1, { color: 'Blue' })] }
  );

  cases.push({
    name: 'colors fading in over a dimmer below them',
    input: {
      project: project(
        pars.map((par, index) => edgeFixture(par, 'test/rgb-par', '6ch', index)),
        [...fadingPresets, below],
        [
          { uuid: 'fading', name: 'Fading', presetUuids: pars },
          { uuid: 'below', name: 'Below', presetUuids: ['below'] },
        ],
        {
          compositions: [
            {
              uuid: 'song',
              name: 'Song',
              tracks: [
                { uuid: 'top', name: 'Top' },
                { uuid: 'bottom', name: 'Bottom' },
              ],
              scenePlaybackRegions: [
                { sceneUuid: 'fading', startMillis: 0, endMillis: 10000, trackUuid: 'top' },
                { sceneUuid: 'below', startMillis: 0, endMillis: 10000, trackUuid: 'bottom' },
              ],
            },
          ],
        }
      ),
      runs: [{ preview: { mode: 'timeline', composition: 'Song' }, times: [0, 250, 500, 999, 1000, 3000] }],
    },
  });

  return write(
    'channel-values-mixing-edges.json',
    'channelValues',
    'Fixtures sharing an address, profiles sharing the name of a channel, curves on channels and colors fading over a dimmer',
    cases
  );
}

// ---- projects of older versions, migrated ----------------------------------------------------

// A profile of a matrix given by its pixel count (or by its pixel keys), with a red channel for each
// pixel and, in the mode "dimmer", a dimmer of its own
function matrixProfile(uuid, matrix) {
  const pixels = { insert: 'matrixChannels', repeatFor: 'eachPixelXYZ', channelOrder: 'perPixel', templateChannels: ['Red $pixelKey'] };

  return {
    uuid,
    name: uuid,
    matrix,
    availableChannels: { Dimmer: { capability: { type: 'Intensity' } } },
    templateChannels: { 'Red $pixelKey': { capability: { type: 'ColorIntensity', color: 'Red' } } },
    modes: [
      { name: 'Pixels', shortName: 'pixels', channels: [pixels] },
      { name: 'Dimmer', shortName: 'dimmer', channels: ['Dimmer', pixels] },
    ],
  };
}

const dimmerProfile = {
  uuid: 'dimmer',
  name: 'Dimmer',
  availableChannels: { Dimmer: { capability: { type: 'Intensity' } } },
  modes: [{ name: '1-channel', shortName: '1ch', channels: ['Dimmer'] }],
};

function migrationFixture(uuid, profileUuid, modeShortName) {
  return { uuid, name: uuid, profileUuid, modeShortName, dmxUniverseUuid: 'u', dmxFirstChannel: 0 };
}

function curve(uuid, curveType, amplitude, channels = []) {
  return { type: 'curve', uuid, curveType, amplitude, lengthMillis: 1000, capabilities: [], channels };
}

const panTilt = { type: 'pan-tilt', uuid: 'circle', panStart: 0, panEnd: 1, tiltStart: 0, tiltEnd: 1 };

// Every step from version 1 to the current one, each on a project of the version before it, and a
// project which is already of that version, which keeps what it has
function migrations() {
  const intensity = { fixtureCapabilityValues: [capability('Intensity', 0.8), capability('ColorIntensity', 1, { color: 'Red' })] };
  const strobe = { fixtureChannelValues: [{ profileUuid: 'test/rgb-par', channelName: 'Strobe', value: 20 }] };
  const scenes = [
    { uuid: 'verse', name: 'Verse', presetUuids: ['b', 'missing', 'a'] },
    { uuid: 'chorus', name: 'Chorus', presetUuids: ['a', 'c', 'b'] },
  ];
  const cases = [];

  // A project of version 1 names the fixtures of a preset only: they are listed with their pixels
  // (also the pixel groups their channels are repeated for), in the order of the project, the values
  // of a preset become its step, the curves swing over half of their amplitude and the scenes are on
  // one lane. A fixture without its profile or its mode is left out.
  const version1 = {
    name: 'Version 1',
    fixtureProfiles: [
      dimmerProfile,
      { $profile: 'test/pixel-bar' },
      { $profile: 'chauvet-dj/colorband-pix' },
      { $profile: 'adb/alc4' },
      { $profile: 'etc/source-four-led-series-2-daylight-hd' },
      { $profile: 'test/rgb-par' },
    ],
    fixtures: [
      migrationFixture('dimmer', 'dimmer', '1ch'),
      migrationFixture('bar', 'test/pixel-bar', '9ch'),
      migrationFixture('bar-with-dimmer', 'test/pixel-bar', '10ch'),
      migrationFixture('band', 'chauvet-dj/colorband-pix', '6ch'),
      migrationFixture('ring', 'adb/alc4', 'ext-lin'),
      // a mode without a short name, which a fixture names by its name
      migrationFixture('source-four', 'etc/source-four-led-series-2-daylight-hd', 'Studio'),
      migrationFixture('par', 'test/rgb-par', '6ch'),
      migrationFixture('without-profile', 'gone', '1ch'),
      migrationFixture('without-mode', 'test/pixel-bar', 'gone'),
    ],
    presets: [
      {
        uuid: 'a',
        name: 'A',
        fixtureUuids: ['par', 'band', 'without-profile', 'dimmer', 'missing', 'bar-with-dimmer'],
        ...intensity,
        ...strobe,
        effects: [curve('sine', 'sine', 1, [{ profileUuid: 'test/pixel-bar', channels: ['Red 1'] }]), curve('square', 'square', 0.6)],
      },
      { uuid: 'b', name: 'B', fixtureUuids: ['ring', 'source-four', 'bar', 'without-mode'], effects: [panTilt] },
      { uuid: 'c', name: 'C' },
    ],
    scenes,
    compositions: [
      {
        uuid: 'song',
        name: 'Song',
        scenePlaybackRegions: [
          { sceneUuid: 'chorus', startMillis: 1000, endMillis: 3000 },
          { sceneUuid: 'verse', startMillis: 0, endMillis: 2000 },
        ],
      },
    ],
  };

  cases.push({ name: 'a project of version 1', input: { project: version1 } });
  cases.push({ name: 'a project of version 1 with nothing in it', input: { project: { name: 'Empty' } } });

  // A project of version 2 keeps the order of the scenes and the fixtures in the lists of the
  // project: the presets of a scene and the fixtures of a preset are sorted like them. A fixture the
  // project doesn't list comes first, an empty pixel key is none.
  const version2 = (version) => ({
    version,
    name: 'Version ' + version,
    fixtureProfiles: [dimmerProfile, { $profile: 'test/pixel-bar' }],
    fixtures: [migrationFixture('dimmer', 'dimmer', '1ch'), migrationFixture('bar', 'test/pixel-bar', '10ch')],
    presetFixtures: [
      { fixtureUuid: 'bar' },
      { fixtureUuid: 'bar', pixelKey: '1' },
      { fixtureUuid: 'bar', pixelKey: '2' },
      { fixtureUuid: 'dimmer' },
      { fixtureUuid: 'bar', pixelKey: '3' },
    ],
    presets: [
      {
        uuid: 'a',
        name: 'A',
        useGlobalFixtureOrder: false,
        fixtures: [
          { fixtureUuid: 'dimmer' },
          { fixtureUuid: 'bar', pixelKey: '3' },
          { fixtureUuid: 'gone' },
          { fixtureUuid: 'bar', pixelKey: '' },
          { fixtureUuid: 'bar', pixelKey: '1' },
        ],
        ...intensity,
      },
      { uuid: 'b', name: 'B', fixtures: [], useGlobalFixtureOrder: false },
      { uuid: 'c', name: 'C', fixtures: [{ fixtureUuid: 'bar', pixelKey: '2' }] },
    ],
    scenes,
    compositions: [],
  });

  cases.push({ name: 'a project of version 2', input: { project: version2(2) } });
  cases.push({ name: 'a project of version 3 keeps its orders', input: { project: version2(3) } });

  // Since version 7 a preset runs through steps: the values of a preset of an older project become its
  // first step. One of version 7 keeps its steps.
  const version6 = (version) => ({
    version,
    name: 'Version ' + version,
    fixtureProfiles: [{ $profile: 'test/rgb-par' }],
    fixtures: [migrationFixture('par', 'test/rgb-par', '6ch')],
    presetFixtures: [{ fixtureUuid: 'par' }],
    presets: [
      { uuid: 'values', name: 'Values', fixtures: [{ fixtureUuid: 'par' }], ...intensity, ...strobe },
      { uuid: 'nothing', name: 'Nothing', fixtures: [{ fixtureUuid: 'par' }] },
      {
        uuid: 'steps',
        name: 'Steps',
        fixtures: [{ fixtureUuid: 'par' }],
        ...strobe,
        steps: [
          step(
            'dark',
            0,
            { fixtureCapabilityValues: [capability('Intensity', 0)] },
            { effectAmounts: [{ effectUuid: 'sine', amount: 0 }] }
          ),
          step('bright', 1000, intensity, { transitionMillis: 250, transitionCurve: 'ease-in' }),
        ],
      },
    ],
    scenes: [],
    compositions: [],
  });

  cases.push({ name: 'a project of version 6', input: { project: version6(6) } });
  cases.push({ name: 'a project of version 7 keeps its steps', input: { project: version6(7) } });

  // Since version 8 every curve swings over its whole amplitude: the ones but the square swung over
  // half of it before
  const version7 = (version) => ({
    version,
    name: 'Version ' + version,
    fixtureProfiles: [],
    fixtures: [],
    presetFixtures: [],
    presets: [
      {
        uuid: 'curves',
        name: 'Curves',
        fixtures: [],
        steps: [step('step', 0, {})],
        effects: [
          curve('sine', 'sine', 1),
          curve('square', 'square', 1),
          curve('triangle', 'triangle', 0.3),
          curve('sawtooth', 'sawtooth', 2),
          curve('reverse-sawtooth', 'reverse-sawtooth', 0.7),
          curve('newer', 'from-a-newer-designer', 0.1),
          { type: 'curve', uuid: 'default', capabilities: [], channels: [] },
          panTilt,
        ],
      },
    ],
    scenes: [],
    compositions: [],
  });

  cases.push({ name: 'a project of version 7', input: { project: version7(7) } });
  cases.push({ name: 'a project of version 8 keeps its curves', input: { project: version7(8) } });

  // Since version 9 the pixels of a matrix given by its pixel count are named like in the fixture
  // library ("12" instead of "Pixel 12-1-1"): in the fixtures of the project and of the presets, the
  // channel values and the channels of the curves (see migration-edges.json)
  const version8 = (version) => ({
    version,
    name: 'Version ' + version,
    fixtureProfiles: [matrixProfile('bar', { pixelCount: [12, 1, 1] })],
    fixtures: [migrationFixture('bar', 'bar', 'dimmer')],
    presetFixtures: [
      { fixtureUuid: 'bar' },
      { fixtureUuid: 'bar', pixelKey: 'Pixel 1-1-1' },
      { fixtureUuid: 'bar', pixelKey: 'Pixel 12-1-1' },
    ],
    presets: [
      {
        uuid: 'pixels',
        name: 'Pixels',
        fixtures: [{ fixtureUuid: 'bar', pixelKey: 'Pixel 12-1-1' }],
        steps: [step('step', 0, { fixtureChannelValues: [{ profileUuid: 'bar', channelName: 'Red Pixel 12-1-1', value: 255 }] })],
        effects: [curve('sine', 'sine', 1, [{ profileUuid: 'bar', channels: ['Red Pixel 1-1-1', 'Dimmer'] }])],
      },
    ],
    scenes: [],
    compositions: [],
  });

  cases.push({ name: 'a project of version 8', input: { project: version8(8) } });
  cases.push({ name: 'a project of version 9 keeps its pixel keys', input: { project: version8(9) } });

  // Since version 10 the timeline has tracks: the scenes played on one lane before, the first scene
  // of the project on top, so every scene gets a track of its own in that order (see
  // migration-edges.json)
  const version9 = (version) => ({
    version,
    name: 'Version ' + version,
    fixtureProfiles: [],
    fixtures: [],
    presetFixtures: [],
    presets: [],
    scenes: [
      { uuid: 'chorus', name: 'Chorus', presetUuids: [] },
      { uuid: 'verse', name: 'Verse', presetUuids: [] },
    ],
    compositions: [
      {
        uuid: 'song',
        name: 'Song',
        scenePlaybackRegions: [
          { sceneUuid: 'verse', startMillis: 0, endMillis: 60000 },
          { sceneUuid: 'chorus', startMillis: 20000, endMillis: 40000 },
        ],
      },
    ],
  });

  cases.push({ name: 'a project of version 9', input: { project: version9(9) } });
  cases.push({ name: 'a project of version 10 keeps its clips off the tracks', input: { project: version9(10) } });

  return write('migration.json', 'migration', 'Projects of every older version, migrated to the current one', cases);
}

// The edges of the migrations: the pixel keys a project of version 8 names its pixels with, and the
// clips of a project of version 9 on the timeline
function migrationEdges() {
  const project = (version, extra) => ({
    version,
    name: 'Edges',
    fixtureProfiles: [],
    fixtures: [],
    presetFixtures: [],
    presets: [],
    scenes: [],
    compositions: [],
    ...extra,
  });
  const cases = [];

  // A matrix of each shape: a row, a column, a stack, the planes and a cube, each with a fixture of
  // its own, the pixels named like before version 9
  const shapes = {
    row: [12, 1, 1],
    column: [1, 12, 1],
    stack: [1, 1, 12],
    plane: [2, 3, 1],
    'side-plane': [1, 2, 3],
    'floor-plane': [2, 1, 3],
    cube: [2, 3, 4],
    single: [1, 1, 1],
  };
  const pixelNames = {
    row: ['Pixel 1-1-1', 'Pixel 9-1-1', 'Pixel 10-1-1', 'Pixel 12-1-1', 'Pixel 012-1-1'],
    column: ['Pixel 1-1-1', 'Pixel 1-10-1', 'Pixel 1-12-1'],
    stack: ['Pixel 1-1-1', 'Pixel 1-1-11', 'Pixel 1-1-12'],
    plane: ['Pixel 1-1-1', 'Pixel 2-3-1', 'Pixel 2-1-1'],
    'side-plane': ['Pixel 1-1-1', 'Pixel 1-2-3', 'Pixel 1-1-2'],
    'floor-plane': ['Pixel 1-1-1', 'Pixel 2-1-3', 'Pixel 1-1-2'],
    cube: ['Pixel 1-1-1', 'Pixel 2-3-4', 'Pixel 1-2-3'],
    single: ['Pixel 1-1-1'],
  };
  const shapeNames = Object.keys(shapes);
  const presetFixturesOf = (names) => shapeNames.flatMap((shape) => names(shape).map((pixelKey) => ({ fixtureUuid: shape, pixelKey })));
  const shapeProject = (presetFixtures, channelValues, curveChannels) =>
    project(8, {
      fixtureProfiles: shapeNames.map((shape) => matrixProfile(shape, { pixelCount: shapes[shape] })),
      fixtures: shapeNames.map((shape) => migrationFixture(shape, shape, 'pixels')),
      presetFixtures,
      presets: [
        {
          uuid: 'preset',
          name: 'Preset',
          fixtures: presetFixtures,
          steps: [step('step', 0, { fixtureChannelValues: channelValues })],
          effects: [curve('sine', 'sine', 1, curveChannels)],
        },
      ],
    });
  const channelValuesOf = (names) =>
    shapeNames.flatMap((shape) => names(shape).map((channelName, index) => ({ profileUuid: shape, channelName, value: index })));
  const curveChannelsOf = (names) => shapeNames.map((shape) => ({ profileUuid: shape, channels: names(shape) }));

  cases.push({
    name: 'the pixels of a row, a column, a stack, the planes and a cube',
    input: {
      project: shapeProject(
        presetFixturesOf((shape) => pixelNames[shape]),
        channelValuesOf((shape) => pixelNames[shape].map((name) => 'Red ' + name)),
        curveChannelsOf((shape) => pixelNames[shape].map((name) => 'Red ' + name))
      ),
    },
  });

  // Each number one beside the matrix on either side, on each axis, a number too long for any
  // integer and a pixel of a matrix which has a single one: a name of a pixel beside the matrix
  // stays as it is
  const outside = (shape) => {
    const [x, y, z] = shapes[shape];
    return [
      `Pixel 0-1-1`,
      `Pixel ${x + 1}-1-1`,
      `Pixel 1-0-1`,
      `Pixel 1-${y + 1}-1`,
      `Pixel 1-1-0`,
      `Pixel 1-1-${z + 1}`,
      'Pixel 99999999999999999999-1-1',
    ];
  };

  cases.push({
    name: 'the pixels beside the matrix',
    input: {
      project: shapeProject(
        presetFixturesOf(outside),
        channelValuesOf((shape) => outside(shape).map((name) => 'Red ' + name)),
        curveChannelsOf((shape) => outside(shape).map((name) => 'Red ' + name))
      ),
    },
  });

  // A pixel key is renamed only as a whole, a channel wherever it names a pixel: names starting
  // with a pixel key, ending with one, holding two of them or one in the middle of a word
  const around = [
    'Pixel 1-1-1 left',
    'Ring Pixel 1-1-1',
    'Pixel 2-1-1 Pixel 3-1-1',
    'Pixel 1-1-1-1',
    'XPixel 2-1-1Y',
    'pixel 1-1-1',
    'Pixel 1-1',
  ];

  cases.push({
    name: 'names which start with, end with or hold a pixel key',
    input: {
      project: project(8, {
        fixtureProfiles: [matrixProfile('row', { pixelCount: [12, 1, 1] })],
        fixtures: [migrationFixture('row', 'row', 'pixels')],
        presetFixtures: around.map((pixelKey) => ({ fixtureUuid: 'row', pixelKey })),
        presets: [
          {
            uuid: 'preset',
            name: 'Preset',
            fixtures: around.map((pixelKey) => ({ fixtureUuid: 'row', pixelKey })),
            steps: [
              step('step', 0, { fixtureChannelValues: around.map((channelName) => ({ profileUuid: 'row', channelName, value: 1 })) }),
            ],
            effects: [curve('sine', 'sine', 1, [{ profileUuid: 'row', channels: around }])],
          },
        ],
      }),
    },
  });

  // Only the pixels of a matrix given by its pixel count are renamed: not the ones of a profile
  // naming its pixels itself (even "Pixel 1-1-1"), of a profile with a pixel count which doesn't name
  // three axes, of a profile without a matrix or of a profile the project doesn't have. A fixture
  // without a pixel key is the fixture itself, a channel value without a name keeps having none, and
  // an effect which is no curve has no channels to rename.
  const named = ['Pixel 1-1-1', 'Pixel 2-1-1'];
  const others = ['named', 'named-and-counted', 'counted-twice', 'counted-four-times', 'dimmer', 'gone'];

  cases.push({
    name: 'the pixels and channels of other profiles, fixtures without a pixel key and effects which are no curves',
    input: {
      project: project(8, {
        fixtureProfiles: [
          matrixProfile('row', { pixelCount: [12, 1, 1] }),
          matrixProfile('named', { pixelKeys: [[named]] }),
          matrixProfile('named-and-counted', { pixelKeys: [[named]], pixelCount: [2, 1, 1] }),
          matrixProfile('counted-twice', { pixelCount: [2, 1] }),
          matrixProfile('counted-four-times', { pixelCount: [2, 1, 1, 1] }),
          dimmerProfile,
        ],
        fixtures: [
          migrationFixture('row', 'row', 'dimmer'),
          migrationFixture('named', 'named', 'pixels'),
          migrationFixture('named-and-counted', 'named-and-counted', 'pixels'),
          migrationFixture('counted-twice', 'counted-twice', 'pixels'),
          migrationFixture('counted-four-times', 'counted-four-times', 'pixels'),
          migrationFixture('dimmer', 'dimmer', '1ch'),
          migrationFixture('gone', 'gone', '1ch'),
        ],
        presetFixtures: [
          { fixtureUuid: 'row' },
          { fixtureUuid: 'row', pixelKey: 'Pixel 1-1-1' },
          ...others.map((fixtureUuid) => ({ fixtureUuid, pixelKey: 'Pixel 1-1-1' })),
          { fixtureUuid: 'missing', pixelKey: 'Pixel 1-1-1' },
        ],
        presets: [
          {
            uuid: 'preset',
            name: 'Preset',
            fixtures: [
              { fixtureUuid: 'row' },
              { fixtureUuid: 'named', pixelKey: 'Pixel 2-1-1' },
              { fixtureUuid: 'gone', pixelKey: 'Pixel 1-1-1' },
            ],
            steps: [
              step('step', 0, {
                fixtureChannelValues: [
                  { profileUuid: 'row', value: 7 },
                  { profileUuid: 'row', channelName: 'Red Pixel 2-1-1', value: 8 },
                  ...others.map((profileUuid) => ({ profileUuid, channelName: 'Red Pixel 1-1-1', value: 9 })),
                  { channelName: 'Red Pixel 1-1-1', value: 10 },
                ],
              }),
            ],
            effects: [
              panTilt,
              curve('sine', 'sine', 1, [
                { profileUuid: 'row', channels: ['Red Pixel 2-1-1'] },
                ...others.map((profileUuid) => ({ profileUuid, channels: ['Red Pixel 1-1-1'] })),
              ]),
            ],
          },
        ],
      }),
    },
  });

  // The clips of the scenes onto tracks of their own: in the order of the scenes, the clips of a scene
  // overlapping each other on further tracks of it (also ones given out of order), clips touching
  // each other on the same track. A clip of a scene which is gone stays off the tracks, a composition
  // without clips doesn't get a track, and one which has a track already keeps it and the clips on it.
  cases.push({
    name: 'the clips of a project of version 9 onto tracks',
    input: {
      project: project(9, {
        scenes: [
          { uuid: 'intro', name: 'Intro', presetUuids: [] },
          { uuid: 'verse', name: 'Verse', presetUuids: [] },
          { uuid: 'chorus', name: 'Chorus', presetUuids: [] },
          { uuid: 'unplayed', name: 'Unplayed', presetUuids: [] },
        ],
        compositions: [
          {
            uuid: 'song',
            name: 'Song',
            scenePlaybackRegions: [
              { sceneUuid: 'chorus', startMillis: 30000, endMillis: 40000 },
              { sceneUuid: 'verse', startMillis: 10000, endMillis: 20000 },
              { sceneUuid: 'verse', startMillis: 20000, endMillis: 30000 },
              { sceneUuid: 'chorus', startMillis: 15000, endMillis: 35000 },
              { sceneUuid: 'chorus', startMillis: 32000, endMillis: 33000 },
              { sceneUuid: 'gone', startMillis: 0, endMillis: 5000 },
              { sceneUuid: 'intro', startMillis: 0, endMillis: 10000 },
              { sceneUuid: 'chorus', startMillis: 41000, endMillis: 42000 },
            ],
          },
          { uuid: 'silence', name: 'Silence', scenePlaybackRegions: [] },
          {
            uuid: 'with-track',
            name: 'With a track',
            tracks: [{ uuid: 'kept', name: 'Kept' }],
            scenePlaybackRegions: [
              { sceneUuid: 'verse', startMillis: 0, endMillis: 1000, trackUuid: 'kept' },
              { sceneUuid: 'verse', startMillis: 500, endMillis: 1500 },
              { sceneUuid: 'intro', startMillis: 0, endMillis: 1000, trackUuid: 'not-there' },
            ],
          },
        ],
      }),
    },
  });

  // The tracks of a scene without a name (or with an empty one) are named like new ones: after the
  // first number no track of the composition carries yet
  cases.push({
    name: 'the clips of scenes without a name onto tracks',
    input: {
      project: project(9, {
        scenes: [
          { uuid: 'unnamed', presetUuids: [] },
          { uuid: 'empty', name: '', presetUuids: [] },
        ],
        compositions: [
          {
            uuid: 'song',
            name: 'Song',
            tracks: [{ uuid: 'kept', name: 'Track 2' }],
            scenePlaybackRegions: [
              { sceneUuid: 'unnamed', startMillis: 0, endMillis: 2000 },
              { sceneUuid: 'unnamed', startMillis: 1000, endMillis: 3000 },
              { sceneUuid: 'empty', startMillis: 0, endMillis: 2000 },
              { sceneUuid: 'empty', startMillis: 1000, endMillis: 3000 },
            ],
          },
        ],
      }),
    },
  });

  // A project saying it is of version 1 is migrated like one which doesn't say its version
  cases.push({
    name: 'a project saying it is of version 1',
    input: {
      project: project(1, {
        fixtureProfiles: [dimmerProfile],
        fixtures: [migrationFixture('dimmer', 'dimmer', '1ch')],
        presetFixtures: undefined,
        presets: [{ uuid: 'preset', name: 'Preset', fixtureUuids: ['dimmer'], fixtureCapabilityValues: [capability('Intensity', 1)] }],
      }),
    },
  });

  return write(
    'migration-edges.json',
    'migration',
    'The pixel keys and the clips of older projects right on the edges of the migrations',
    cases
  );
}

export function generate() {
  return [
    transitionCurves(),
    effectCurves(),
    effectCurveEdges(),
    presetSteps(),
    presetIntensity(),
    libraryModes(),
    scenarios(),
    presetIntensityEdges(),
    presetStepsEdges(),
    channelValuesEdges(),
    channelValuesMixingEdges(),
    migrations(),
    migrationEdges(),
  ];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log('Wrote ' + generate().join(', '));
}
