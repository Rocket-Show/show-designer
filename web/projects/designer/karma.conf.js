// Karma configuration file, see link for more information
// https://karma-runner.github.io/1.0/config/configuration-file.html

module.exports = function (config) {
  config.set({
    basePath: '',
    frameworks: ['jasmine', '@angular-devkit/build-angular'],
    plugins: [
      require('karma-jasmine'),
      require('karma-chrome-launcher'),
      require('karma-jasmine-html-reporter'),
      require('karma-coverage'),
      require('@angular-devkit/build-angular/plugins/karma'),
    ],
    client: {
      clearContext: false, // leave Jasmine Spec Runner output visible in browser
      // npm run conformance:record (see conformance/record.mjs) collects what the designer makes of the cases
      args: process.env.CONFORMANCE_RECORD_URL ? ['conformance-record', process.env.CONFORMANCE_RECORD_URL] : [],
    },
    // the coverage of ng test --code-coverage (karma-coverage, which the Angular CLI uses for it)
    coverageReporter: {
      dir: require('path').join(__dirname, '../../coverage'),
      subdir: 'designer',
      reporters: [{ type: 'html' }, { type: 'lcovonly' }, { type: 'json-summary' }, { type: 'text-summary' }],
      // the run fails below this coverage of the whole library (raised as the specs cover more of it)
      check: {
        global: { statements: 73, branches: 68, functions: 70, lines: 73 },
      },
    },
    reporters: ['progress', 'kjhtml'],
    port: 9876,
    colors: true,
    logLevel: config.LOG_INFO,
    autoWatch: true,
    browsers: ['Chrome'],
    customLaunchers: {
      // CI and containers, which run as root without a display
      ChromeHeadlessCI: {
        base: 'ChromeHeadless',
        flags: ['--no-sandbox'],
      },
    },
    singleRun: false,
  });
};
