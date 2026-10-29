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
| `channelValues`         | a project and how it is previewed (the timeline of a composition, the selected preset, its steps running, the selected scenes) | the value of every channel of every fixture and pixel at each time                          |

A project of a `channelValues` case names the profiles of `profiles` like the fixture library does (`"$profile":
"stairville/mh-100"`): a few real profiles of the library (see `profiles/README.md`) and the test fixtures of
`profiles/test`.

The files with `generated` in their header are written by `generate.mjs` from a seeded random source (curves, step
sequences, fades, whole projects with tracks, clips, steps and effects). The others are written by hand.

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
(`models/cycle-sine.ts`, `CycleSine`).
