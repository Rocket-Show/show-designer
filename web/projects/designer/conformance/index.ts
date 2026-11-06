// Written by record.mjs: the case files and the profiles of the fixture library the cases play.

import case0 from './cases/channel-values-capabilities.json';
import case1 from './cases/channel-values-color-dimmers.json';
import case2 from './cases/channel-values-edges.json';
import case3 from './cases/channel-values-library.json';
import case4 from './cases/channel-values-mixing-edges.json';
import case5 from './cases/channel-values-movements.json';
import case6 from './cases/channel-values-pixel-audio.json';
import case7 from './cases/channel-values-pixel-effects.json';
import case8 from './cases/channel-values-pixel-stage.json';
import case9 from './cases/channel-values-pixel-white.json';
import case10 from './cases/channel-values-scenarios.json';
import case11 from './cases/default-value.json';
import case12 from './cases/effect-curve-edges.json';
import case13 from './cases/effect-curve.json';
import case14 from './cases/hex-color.json';
import case15 from './cases/migration-edges.json';
import case16 from './cases/migration.json';
import case17 from './cases/mix-colors.json';
import case18 from './cases/pixel-group.json';
import case19 from './cases/pixel-pattern.json';
import case20 from './cases/pixels.json';
import case21 from './cases/preset-intensity-edges.json';
import case22 from './cases/preset-intensity.json';
import case23 from './cases/preset-steps-edges.json';
import case24 from './cases/preset-steps.json';
import case25 from './cases/profile-number.json';
import case26 from './cases/transition-curve.json';
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
import profile17 from './profiles/test/pixel-matrix.json';
import profile18 from './profiles/test/rgb-par.json';
import profile19 from './profiles/test/rgb.json';
import profile20 from './profiles/test/shared-dimmer.json';
import profile21 from './profiles/test/strobe-par.json';
import profile22 from './profiles/test/wheels.json';
import profile23 from './profiles/test/white-matrix.json';
import profile24 from './profiles/test/wide-mover.json';
import profile25 from './profiles/varytec/easy-move-xs-hp-wash-7x8w-rgbw.json';

export const caseFiles: { [fileName: string]: any } = {
  'channel-values-capabilities.json': case0,
  'channel-values-color-dimmers.json': case1,
  'channel-values-edges.json': case2,
  'channel-values-library.json': case3,
  'channel-values-mixing-edges.json': case4,
  'channel-values-movements.json': case5,
  'channel-values-pixel-audio.json': case6,
  'channel-values-pixel-effects.json': case7,
  'channel-values-pixel-stage.json': case8,
  'channel-values-pixel-white.json': case9,
  'channel-values-scenarios.json': case10,
  'default-value.json': case11,
  'effect-curve-edges.json': case12,
  'effect-curve.json': case13,
  'hex-color.json': case14,
  'migration-edges.json': case15,
  'migration.json': case16,
  'mix-colors.json': case17,
  'pixel-group.json': case18,
  'pixel-pattern.json': case19,
  'pixels.json': case20,
  'preset-intensity-edges.json': case21,
  'preset-intensity.json': case22,
  'preset-steps-edges.json': case23,
  'preset-steps.json': case24,
  'profile-number.json': case25,
  'transition-curve.json': case26,
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
  'test/pixel-matrix': profile17,
  'test/rgb-par': profile18,
  'test/rgb': profile19,
  'test/shared-dimmer': profile20,
  'test/strobe-par': profile21,
  'test/wheels': profile22,
  'test/white-matrix': profile23,
  'test/wide-mover': profile24,
  'varytec/easy-move-xs-hp-wash-7x8w-rgbw': profile25,
};
