// Written by record.mjs: the case files and the profiles of the fixture library the cases play.

import case0 from './cases/channel-values-capabilities.json';
import case1 from './cases/channel-values-edges.json';
import case2 from './cases/channel-values-library.json';
import case3 from './cases/channel-values-mixing-edges.json';
import case4 from './cases/channel-values-movements.json';
import case5 from './cases/channel-values-scenarios.json';
import case6 from './cases/default-value.json';
import case7 from './cases/effect-curve-edges.json';
import case8 from './cases/effect-curve.json';
import case9 from './cases/hex-color.json';
import case10 from './cases/migration-edges.json';
import case11 from './cases/migration.json';
import case12 from './cases/mix-colors.json';
import case13 from './cases/pixel-group.json';
import case14 from './cases/pixels.json';
import case15 from './cases/preset-intensity-edges.json';
import case16 from './cases/preset-intensity.json';
import case17 from './cases/preset-steps-edges.json';
import case18 from './cases/preset-steps.json';
import case19 from './cases/profile-number.json';
import case20 from './cases/transition-curve.json';
import profile0 from './profiles/adb/alc4.json';
import profile1 from './profiles/chauvet-dj/colorband-pix.json';
import profile2 from './profiles/dts/xr4-spot.json';
import profile3 from './profiles/elation/uni-bar.json';
import profile4 from './profiles/etc/source-four-led-series-2-daylight-hd.json';
import profile5 from './profiles/hong-yi/hy-g60.json';
import profile6 from './profiles/ibiza-light/ls-005led.json';
import profile7 from './profiles/panasonic/pt-rz120.json';
import profile8 from './profiles/stairville/mh-100.json';
import profile9 from './profiles/test/beam.json';
import profile10 from './profiles/test/cmy-spot.json';
import profile11 from './profiles/test/effects-spot.json';
import profile12 from './profiles/test/hazer.json';
import profile13 from './profiles/test/macro-par.json';
import profile14 from './profiles/test/mover.json';
import profile15 from './profiles/test/moving-head.json';
import profile16 from './profiles/test/pixel-bar.json';
import profile17 from './profiles/test/rgb-par.json';
import profile18 from './profiles/test/rgb.json';
import profile19 from './profiles/test/shared-dimmer.json';
import profile20 from './profiles/test/strobe-par.json';
import profile21 from './profiles/test/wheels.json';
import profile22 from './profiles/test/wide-mover.json';
import profile23 from './profiles/varytec/easy-move-xs-hp-wash-7x8w-rgbw.json';

export const caseFiles: { [fileName: string]: any } = {
  'channel-values-capabilities.json': case0,
  'channel-values-edges.json': case1,
  'channel-values-library.json': case2,
  'channel-values-mixing-edges.json': case3,
  'channel-values-movements.json': case4,
  'channel-values-scenarios.json': case5,
  'default-value.json': case6,
  'effect-curve-edges.json': case7,
  'effect-curve.json': case8,
  'hex-color.json': case9,
  'migration-edges.json': case10,
  'migration.json': case11,
  'mix-colors.json': case12,
  'pixel-group.json': case13,
  'pixels.json': case14,
  'preset-intensity-edges.json': case15,
  'preset-intensity.json': case16,
  'preset-steps-edges.json': case17,
  'preset-steps.json': case18,
  'profile-number.json': case19,
  'transition-curve.json': case20,
};

export const profiles: { [name: string]: any } = {
  'adb/alc4': profile0,
  'chauvet-dj/colorband-pix': profile1,
  'dts/xr4-spot': profile2,
  'elation/uni-bar': profile3,
  'etc/source-four-led-series-2-daylight-hd': profile4,
  'hong-yi/hy-g60': profile5,
  'ibiza-light/ls-005led': profile6,
  'panasonic/pt-rz120': profile7,
  'stairville/mh-100': profile8,
  'test/beam': profile9,
  'test/cmy-spot': profile10,
  'test/effects-spot': profile11,
  'test/hazer': profile12,
  'test/macro-par': profile13,
  'test/mover': profile14,
  'test/moving-head': profile15,
  'test/pixel-bar': profile16,
  'test/rgb-par': profile17,
  'test/rgb': profile18,
  'test/shared-dimmer': profile19,
  'test/strobe-par': profile20,
  'test/wheels': profile21,
  'test/wide-mover': profile22,
  'varytec/easy-move-xs-hp-wash-7x8w-rgbw': profile23,
};
