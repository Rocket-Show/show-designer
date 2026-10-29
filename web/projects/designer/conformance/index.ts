// Written by record.mjs: the case files and the profiles of the fixture library the cases play.

import case0 from './cases/channel-values-edges.json';
import case1 from './cases/channel-values-library.json';
import case2 from './cases/channel-values-scenarios.json';
import case3 from './cases/default-value.json';
import case4 from './cases/effect-curve.json';
import case5 from './cases/hex-color.json';
import case6 from './cases/mix-colors.json';
import case7 from './cases/pixel-group.json';
import case8 from './cases/pixels.json';
import case9 from './cases/preset-intensity-edges.json';
import case10 from './cases/preset-intensity.json';
import case11 from './cases/preset-steps-edges.json';
import case12 from './cases/preset-steps.json';
import case13 from './cases/profile-number.json';
import case14 from './cases/transition-curve.json';
import profile0 from './profiles/adb/alc4.json';
import profile1 from './profiles/chauvet-dj/colorband-pix.json';
import profile2 from './profiles/dts/xr4-spot.json';
import profile3 from './profiles/elation/uni-bar.json';
import profile4 from './profiles/etc/source-four-led-series-2-daylight-hd.json';
import profile5 from './profiles/hong-yi/hy-g60.json';
import profile6 from './profiles/ibiza-light/ls-005led.json';
import profile7 from './profiles/panasonic/pt-rz120.json';
import profile8 from './profiles/stairville/mh-100.json';
import profile9 from './profiles/test/moving-head.json';
import profile10 from './profiles/test/pixel-bar.json';
import profile11 from './profiles/test/rgb-par.json';
import profile12 from './profiles/test/rgb.json';
import profile13 from './profiles/test/shared-dimmer.json';
import profile14 from './profiles/test/wheels.json';
import profile15 from './profiles/varytec/easy-move-xs-hp-wash-7x8w-rgbw.json';

export const caseFiles: { [fileName: string]: any } = {
  'channel-values-edges.json': case0,
  'channel-values-library.json': case1,
  'channel-values-scenarios.json': case2,
  'default-value.json': case3,
  'effect-curve.json': case4,
  'hex-color.json': case5,
  'mix-colors.json': case6,
  'pixel-group.json': case7,
  'pixels.json': case8,
  'preset-intensity-edges.json': case9,
  'preset-intensity.json': case10,
  'preset-steps-edges.json': case11,
  'preset-steps.json': case12,
  'profile-number.json': case13,
  'transition-curve.json': case14,
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
  'test/moving-head': profile9,
  'test/pixel-bar': profile10,
  'test/rgb-par': profile11,
  'test/rgb': profile12,
  'test/shared-dimmer': profile13,
  'test/wheels': profile14,
  'varytec/easy-move-xs-hp-wash-7x8w-rgbw': profile15,
};
