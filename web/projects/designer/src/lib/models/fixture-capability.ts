export enum FixtureCapabilityType {
  NoFunction = 'NoFunction',
  ShutterStrobe = 'ShutterStrobe',
  StrobeSpeed = 'StrobeSpeed',
  StrobeDuration = 'StrobeDuration',
  Intensity = 'Intensity',
  ColorIntensity = 'ColorIntensity',
  ColorPreset = 'ColorPreset',
  ColorTemperature = 'ColorTemperature',
  Pan = 'Pan',
  PanContinuous = 'PanContinuous',
  Tilt = 'Tilt',
  TiltContinuous = 'TiltContinuous',
  PanTiltSpeed = 'PanTiltSpeed',
  WheelSlot = 'WheelSlot',
  WheelShake = 'WheelShake',
  WheelSlotRotation = 'WheelSlotRotation',
  WheelRotation = 'WheelRotation',
  EffectSpeed = 'EffectSpeed',
  EffectDuration = 'EffectDuration',
  EffectParameter = 'EffectParameter',
  SoundSensitivity = 'SoundSensitivity',
  Focus = 'Focus',
  Zoom = 'Zoom',
  Iris = 'Iris',
  IrisEffect = 'IrisEffect',
  Frost = 'Frost',
  FrostEffect = 'FrostEffect',
  Prism = 'Prism',
  PrismRotation = 'PrismRotation',
  BladeInsertion = 'BladeInsertion',
  BladeRotation = 'BladeRotation',
  BladeSystemRotation = 'BladeSystemRotation',
  Fog = 'Fog',
  FogOutput = 'FogOutput',
  FogType = 'FogType',
  BeamAngle = 'BeamAngle',
  Rotation = 'Rotation',
  Speed = 'Speed',
  Time = 'Time',
  Maintenance = 'Maintenance',
  Generic = 'Generic',
  Effect = 'Effect',
  BeamPosition = 'BeamPosition',
}

export enum FixtureCapabilityColor {
  Red = 'Red',
  Green = 'Green',
  Blue = 'Blue',
  Cyan = 'Cyan',
  Magenta = 'Magenta',
  Yellow = 'Yellow',
  Amber = 'Amber',
  White = 'White',
  'Warm White' = 'Warm White',
  'Cold White' = 'Cold White',
  UV = 'UV',
  Lime = 'Lime',
  Indigo = 'Indigo',
}

export class FixtureCapability {
  type: FixtureCapabilityType;
  color: FixtureCapabilityColor;
  dmxRange: number[] = [];
  slotNumber: number;
  comment: string;
  soundControlled: boolean;
  shutterEffect: string;
  randomTiming: boolean;

  // may be empty. in this case, the channel name points to the wheel
  wheel: any;

  angle: string;
  angleStart: string;
  angleEnd: string;
  speed: string;
  speedStart: string;
  speedEnd: string;
  brightness: string;
  brightnessStart: string;
  brightnessEnd: string;
  duration: string;
  durationStart: string;
  durationEnd: string;
  colorTemperature: string;
  colorTemperatureStart: string;
  colorTemperatureEnd: string;
  soundSensitivity: string;
  soundSensitivityStart: string;
  soundSensitivityEnd: string;
  horizontalAngle: string;
  horizontalAngleStart: string;
  horizontalAngleEnd: string;
  verticalAngle: string;
  verticalAngleStart: string;
  verticalAngleEnd: string;
  distance: string;
  distanceStart: string;
  distanceEnd: string;
  openPercent: string;
  openPercentStart: string;
  openPercentEnd: string;
  frostIntensity: string;
  frostIntensityStart: string;
  frostIntensityEnd: string;
  fogOutput: string;
  fogOutputStart: string;
  fogOutputEnd: string;
  time: string;
  timeStart: string;
  timeEnd: string;
  insertion: string;
  insertionStart: string;
  insertionEnd: string;
  colors: string[];
  colorsStart: string[];
  colorsEnd: string[];

  constructor(data?: any) {
    if (!data) {
      return;
    }

    this.type = FixtureCapabilityType[data.type as string];
    this.color = data.color;
    if (data.dmxRange) {
      this.dmxRange = data.dmxRange;
    }
    this.wheel = data.wheel;
    this.slotNumber = data.slotNumber ?? undefined;
    this.comment = data.comment;
    this.soundControlled = data.soundControlled;
    this.shutterEffect = data.shutterEffect;
    this.randomTiming = data.randomTiming;

    this.angle = data.angle;
    this.angleStart = data.angleStart;
    this.angleEnd = data.angleEnd;
    this.speed = data.speed;
    this.speedStart = data.speedStart;
    this.speedEnd = data.speedEnd;
    this.brightness = data.brightness;
    this.brightnessStart = data.brightnessStart;
    this.brightnessEnd = data.brightnessEnd;
    this.duration = data.duration;
    this.durationStart = data.durationStart;
    this.durationEnd = data.durationEnd;
    this.colorTemperature = data.colorTemperature;
    this.colorTemperatureStart = data.colorTemperatureStart;
    this.colorTemperatureEnd = data.colorTemperatureEnd;
    this.soundSensitivity = data.soundSensitivity;
    this.soundSensitivityStart = data.soundSensitivityStart;
    this.soundSensitivityEnd = data.soundSensitivityEnd;
    this.horizontalAngle = data.horizontalAngle;
    this.horizontalAngleStart = data.horizontalAngleStart;
    this.horizontalAngleEnd = data.horizontalAngleEnd;
    this.verticalAngle = data.verticalAngle;
    this.verticalAngleStart = data.verticalAngleStart;
    this.verticalAngleEnd = data.verticalAngleEnd;
    this.distance = data.distance;
    this.distanceStart = data.distanceStart;
    this.distanceEnd = data.distanceEnd;
    this.openPercent = data.openPercent;
    this.openPercentStart = data.openPercentStart;
    this.openPercentEnd = data.openPercentEnd;
    this.frostIntensity = data.frostIntensity;
    this.frostIntensityStart = data.frostIntensityStart;
    this.frostIntensityEnd = data.frostIntensityEnd;
    this.fogOutput = data.fogOutput;
    this.fogOutputStart = data.fogOutputStart;
    this.fogOutputEnd = data.fogOutputEnd;
    this.time = data.time;
    this.timeStart = data.timeStart;
    this.timeEnd = data.timeEnd;
    this.insertion = data.insertion;
    this.insertionStart = data.insertionStart;
    this.insertionEnd = data.insertionEnd;
    this.colors = data.colors;
    this.colorsStart = data.colorsStart;
    this.colorsEnd = data.colorsEnd;
  }
}
