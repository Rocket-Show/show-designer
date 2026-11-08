// Used by the end-to-end tests (`npm run e2e`, see e2e/README.md): the app talks to the local backend, which the tests
// fake in the browser (e2e/fake-api.ts), whatever environment.ts points the dev build at

export const environment = {
  production: false,
  name: 'dev',

  localBackend: 'http://localhost:8080',

  debug: true,
};
