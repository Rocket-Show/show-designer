// Written by record.mjs: the case files and the profiles of the fixture library the cases play.

import case0 from './cases/channel-values-library.json';
import case1 from './cases/channel-values-scenarios.json';
import case2 from './cases/default-value.json';
import case3 from './cases/effect-curve.json';
import case4 from './cases/hex-color.json';
import case5 from './cases/mix-colors.json';
import case6 from './cases/pixel-group.json';
import case7 from './cases/pixels.json';
import case8 from './cases/preset-intensity.json';
import case9 from './cases/preset-steps.json';
import case10 from './cases/profile-number.json';
import case11 from './cases/transition-curve.json';
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
import profile10 from './profiles/test/rgb-par.json';
import profile11 from './profiles/test/rgb.json';
import profile12 from './profiles/varytec/easy-move-xs-hp-wash-7x8w-rgbw.json';

export const caseFiles: { [fileName: string]: any } = {
  'channel-values-library.json': case0,
  'channel-values-scenarios.json': case1,
  'default-value.json': case2,
  'effect-curve.json': case3,
  'hex-color.json': case4,
  'mix-colors.json': case5,
  'pixel-group.json': case6,
  'pixels.json': case7,
  'preset-intensity.json': case8,
  'preset-steps.json': case9,
  'profile-number.json': case10,
  'transition-curve.json': case11,
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
  'test/rgb-par': profile10,
  'test/rgb': profile11,
  'varytec/easy-move-xs-hp-wash-7x8w-rgbw': profile12,
};
