// Mutation testing of the engine of the designer, the code Rocket Show plays the projects with as well: Stryker puts
// faults into it and checks that the specs notice them. npm run mutation (report in reports/mutation)
export default {
  // what lights the stage: the curves, the steps, the fades, the fixture library and the channel values, also how
  // a project is read and migrated
  mutate: [
    'projects/designer/src/lib/models/{cycle-sine,effect,effect-curve,effect-pan-tilt,preset,preset-region-scene,preset-step,profile-number,project-number,scene,timeline-length,timeline-track,transition-curve}.ts',
    'projects/designer/src/lib/services/{fixture,fixture-pixel-group-resolve,preset,preset-step,preview,project-load}.service.ts',
  ],
  testRunner: 'karma',
  karma: {
    projectType: 'angular-cli',
    configFile: 'projects/designer/karma.conf.js',
    // the specs of the engine and the conformance cases with Rocket Show: the specs of the components use the
    // engine as well, but take most of the time of a run
    ngConfig: {
      testArguments: {
        project: 'designer',
        include: 'projects/designer/src/lib/{models/**/*,services/**/*,preview/models/*,conformance}.spec.ts',
      },
    },
    config: { browsers: ['ChromeHeadlessCI'] },
  },
  coverageAnalysis: 'perTest',
  concurrency: 2,
  // a run of the specs covering a mutant comes with about 13 s of its own in the browser
  timeoutMS: 60000,
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/index.html' },
  jsonReporter: { fileName: 'reports/mutation/mutation.json' },
  tempDirName: '.stryker-tmp',
  // the sandbox the mutants are tested in takes the sources only: the build cache alone has several GB
  ignorePatterns: ['.angular', 'coverage', 'dist', 'e2e', 'reports', '.stryker-tmp'],
  cleanTempDir: 'always',
};
