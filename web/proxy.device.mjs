// Dev server proxy for `npm run start:device`: forwards /api to a Rocket Show device and logs in with its admin password,
// because the designer has no login of its own. E.g.:
//   ROCKETSHOW_PASSWORD=secret npm run start:device
//   ROCKETSHOW_DEVICE=http://192.168.1.64 ROCKETSHOW_PASSWORD=secret npm run start:device
import http from 'node:http';
import https from 'node:https';

const device = process.env.ROCKETSHOW_DEVICE || 'http://rocketshow.local';
const password = process.env.ROCKETSHOW_PASSWORD;

// The session cookie of the device, once logged in
let session;
let pendingLogin;
// The device refused the password -> don't try again with each request and run into its login throttle
let refused = false;

if (!password) {
  console.warn(`[device proxy] ROCKETSHOW_PASSWORD is not set, the requests to ${device} are not logged in`);
}

function login() {
  return new Promise((resolve, reject) => {
    const client = device.startsWith('https:') ? https : http;
    const options = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // The certificate of a device on the local network can't be verified
      rejectUnauthorized: false,
    };

    const request = client.request(new URL('/api/auth/login', device), options, (response) => {
      response.resume();

      if (response.statusCode !== 200) {
        reject(Object.assign(new Error(`HTTP ${response.statusCode}`), { statusCode: response.statusCode }));
        return;
      }

      resolve((response.headers['set-cookie'] || []).map((cookie) => cookie.split(';')[0]).join('; '));
    });

    request.on('error', reject);
    request.end(JSON.stringify({ password }));
  });
}

async function ensureSession() {
  if (session || !password || refused) {
    return;
  }

  // Requests arriving at the same time share one login
  pendingLogin ??= login()
    .then(
      (cookie) => {
        session = cookie;
        console.log(`[device proxy] Logged in to ${device}`);
      },
      (error) => {
        refused = error.statusCode === 401;
        console.error(
          `[device proxy] Could not log in to ${device}: ${error.message}` +
            (refused ? ', check ROCKETSHOW_PASSWORD and restart the dev server' : '')
        );
      }
    )
    .finally(() => (pendingLogin = undefined));

  await pendingLogin;
}

export default {
  '/api': {
    target: device,
    changeOrigin: true,
    secure: false,
    // Runs before each request is forwarded
    bypass: async (req) => {
      await ensureSession();

      if (session) {
        req.headers.cookie = session;
      }

      // Forwarded by the dev server, it's no cross-origin request for the device, whatever port the app runs on
      delete req.headers.origin;
    },
    configure: (proxy) => {
      proxy.on('proxyRes', (proxyRes, req) => {
        // The session expired (e.g. after being idle for a while) -> log in again with the next request
        if (proxyRes.statusCode === 403 && session && req.headers.cookie === session) {
          session = undefined;
        }
      });
    },
  },
};
