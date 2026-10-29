// Mutation testing of the engine of the designer, the code Rocket Show plays the projects with as well: Stryker puts
// faults into it and checks that the specs notice them. npm run mutation (report in reports/mutation)
export default {
  mutate: ['projects/designer/src/lib/models/transition-curve.ts'],
  testRunner: 'karma',
  karma: {
    projectType: 'angular-cli',
    configFile: 'projects/designer/karma.conf.js',
    ngConfig: { testArguments: { project: 'designer' } },
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
