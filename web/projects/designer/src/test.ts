// This file is required by karma.conf.js and loads recursively all the .spec and framework files

// zone.js comes before Angular, which looks for its testing zones (fakeAsync) when it is loaded
import 'core-js/es7/reflect';
import 'zone.js';
import 'zone.js/testing';

import { getTestBed } from '@angular/core/testing';
import { BrowserDynamicTestingModule, platformBrowserDynamicTesting } from '@angular/platform-browser-dynamic/testing';

// First, initialize the Angular testing environment.
getTestBed().initTestEnvironment(BrowserDynamicTestingModule, platformBrowserDynamicTesting(), {
  teardown: { destroyAfterEach: true },
});
