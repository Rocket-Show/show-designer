# Conformance cases with Rocket Show

Rocket Show plays the projects of the designer with an engine of its own (Java, `DefaultDesignerService`), which has to
light the stage exactly like the preview of the designer shows it. These cases make sure it does: both run them and
have to come to the very same numbers, compared exactly.

- The designer runs them in `src/lib/conformance.spec.ts`, which is part of `ng test designer`.
- Rocket Show runs them in `DesignerConformanceTest`, on a copy of this folder in
  `src/test/resources/designer-conformance` (CI checks that the copy is the one of the designer).

The expected values are recorded from the designer. A case shows that both engines agree, not that what they do is
right: what a case means is checked by the specs of the designer and the tests of Rocket Show.

## The cases

Each file of `cases` holds the cases of one kind, one case per line: its `name`, its `input` and what the designer
made of it (`expected`).

| Kind                    | Input                                                                                                                          | What is compared                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `transitionCurve`       | a curve and a position                                                                                                         | the shaped position                                                                         |
| `effectCurve`           | an effect curve, a tempo, a number of fixtures, times and fixtures                                                             | the period, phase, end of the run, loop, and the chase and the value at each time           |
| `presetSteps`           | a preset with its steps, times and fixtures                                                                                    | the length of a pass, and the step state at each time (values, wheel slots, effect amounts) |
| `presetIntensity`       | a preset, a scene and a clip, times                                                                                            | how much of the preset reaches the stage                                                    |
| `profileNumber`         | a text                                                                                                                         | the number the fixture library means by it, or none                                         |
| `defaultValue`          | a channel of the fixture library                                                                                               | the value it starts out with                                                                |
| `hexColor`, `mixColors` | colors of the fixture library                                                                                                  | their RGB values, mixed                                                                     |
| `pixels`                | a fixture matrix                                                                                                               | its pixels, its groups and the order a channel is repeated for them in                      |
| `pixelGroup`            | a group and pixels                                                                                                             | the pixels it covers, or `error` for a rule which can't be read                             |
| `pixelPattern`          | a pattern of the pixel effects with its settings, a palette, moments and pixels (of a bar, a matrix or the stage)              | where the pattern puts each pixel in the palette, how bright it makes it and its color      |
| `channelValues`         | a project and how it is previewed (the timeline of a composition, the selected preset, its steps running, the selected scenes) | the value of every channel of every fixture and pixel at each time                          |
| `migration`             | a project of an older version                                                                                                  | what both keep of it migrated to the current version and play it with (see below)           |

A run of a `channelValues` case may name fixtures identified from the fixture pool (`"identify"`), which blink at full
white on top of what the presets light them with, and the hold points the timeline played through (`"holds"`, each
with its position and the time held there): the effects and the steps of a clip spanning a hold run on for the time
held, while its position and its fades stand still (`channel-values-timing.json`, which also plays steps following the
beat at the tempo of the composition).

A project of a `channelValues` case names the profiles of `profiles` like the fixture library does (`"$profile":
"stairville/mh-100"`): a few real profiles of the library (see `profiles/README.md`) and the test fixtures of
`profiles/test`. It is a project of the current version: Rocket Show migrates a project of an older one when it loads
it, the designer plays the case as it is. In a current project the dimmers of the fixtures lighting in colors only
start at full (`colorDimmersAtFull`, see `channel-values-color-dimmers.json`).

The pixel effects light the pixels lighting in white only (`channel-values-pixel-white.json`, a dimmer of their own
each, like the LEDs of the Cameo Flash Matrix 250) as bright as the brightest of the red, green and blue of their light,
blended with white at full and dimmed by what the preset puts on their dimmers, which leaves the master dimmer of such a
matrix and the dimmers of the fixtures without pixels to the preset.

A `channelValues` case with pixel effects following the audio (`channel-values-pixel-audio.json`) brings the frames of
an analysis of the audio as well (`audio`, see `models/pixel-audio.ts`): for each 20 ms, the RMS, the peak, the bass, the
mids, the highs and 16 bands in dB, analyzed from a song. How the frames light the pixels is compared exactly, how they
are measured is not: the designer analyzes the audio file of the composition (`models/pixel-audio-analysis.ts`), Rocket
Show measures the audio while it plays (`AudioAnalysisService`, with the level and the spectrum of GStreamer). The
frames stand for all the audio: the effects of the cases follow all buses. How the buses an effect picks are added
together is a part of the measuring as well (`audioFramesFor` in the designer, `AudioAnalysisService.frame` in Rocket
Show).

A `migration` case compares the version, whether the dimmers of the fixtures lighting in colors start at full (not in a
project of before version 11), the fixtures and pixels of the project and of each preset (in their order,
with `useGlobalFixtureOrder`), the steps of each preset (times, transition, values and effect amounts), its curves
(type, amplitude and the channels of each profile) and its other effects, the presets of each scene in their order and
the tracks of each composition (their names) with the track of each clip, named by its place in the composition: the
uuid of a new track is a random one, like the uuid the designer gives the first step of an old preset (Rocket Show gives
it none), so neither is compared. Left out are the parts only the designer shows: the solo switch (`previewPreset`, version 4), the
folders and the positions in the lists (versions 5 and 6), which Rocket Show doesn't read, and the values an old
preset keeps besides its steps, which no migration touches.

The files with `generated` in their header are written by `generate.mjs`: most of them from a seeded random source
(curves, step sequences, fades, whole projects with tracks, clips, steps and effects), the ones ending in `-edges` from
values right on the edges the random ones pass by (where a fade starts or ends, a value on the edge of a range of a
channel, ties on a color wheel). The others are written by hand.

## Changing the cases

After adding or changing a case, a profile or `generate.mjs`, or after changing how the designer plays a project:

```shell
cd web
npm run conformance:record
```

It writes the generated files, `index.ts` (the files the spec imports) and the values the designer comes to into
`expected`. Look at the difference before committing it, then copy the cases to Rocket Show, which has to come to the
same values (fix it there, or the designer, wherever the two differ):

```shell
cd rocketshow
testing/sync-designer-conformance.sh ../show-designer
./mvnw test -Dtest=DesignerConformanceTest -Dskip.npm -Dskip.installnodenpm
```

Both engines compute with doubles and the same operations in the same order, so they come to the very same numbers.
Where a function of the platform rounds differently (Math.sin of the browser and of Java), both use one of their own
(`models/cycle-sine.ts`, `CycleSine`). The pixel effects keep to the same operations (`models/pixel-math.ts`,
`PixelMath`), and what looks random in them comes from a hash of whole numbers, which wraps around at 32 bits on both
sides.
