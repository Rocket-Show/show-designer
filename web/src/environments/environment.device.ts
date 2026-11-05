// Used by `npm run start:device`: the dev server forwards /api to a Rocket Show device and logs in (see proxy.device.mjs)

export const environment = {
  production: false,
  name: 'dev',

  // same origin as the app, proxied to the device
  localBackend: '',

  debug: true,
};
