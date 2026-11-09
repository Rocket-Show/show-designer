// The AI looks: presets and scenes the AI designs for the fixtures of a project, through the API of the online designer
// (ai-looks, see show-designer-api in the spark repository). The designer describes its fixtures in groups (AiRig) and
// sends what the user picked (AiSettings). The answer (AiLooks) says what each preset sets in terms of the designer
// (a dimmer, a color, a fan, a gradient, an aim, a movement, ...), which AiLooksCompiler turns into presets and scenes.

// what a group of fixtures can do
export type AiAbility = 'dimmer' | 'color' | 'pan-tilt' | 'strobe' | 'pixels' | 'zoom' | 'gobo' | 'prism';

// where the fixtures of a group are: on the truss or on the floor, at the front or at the back
export type AiPosition = 'top-front' | 'top-back' | 'floor-front' | 'floor-back' | 'other';

// fixtures which belong together, as the API is told about them
export interface AiRigGroup {
  id: string;
  name: string;
  category: string;
  count: number;
  position: AiPosition;
  abilities: AiAbility[];
  // the colors of the color wheel of a group lighting its colors through one only
  colors?: string[];
  // the size of the pixel grid of pixel bars and matrices
  pixels?: { columns: number; rows: number };
  // the kinds of gobos the gobo wheels of a group have (see aiGoboPatterns)
  gobos?: string[];
}

// a group with the fixtures it is made of, which only the designer knows
export interface AiRigGroupFixtures {
  group: AiRigGroup;
  fixtureUuids: string[];
}

export interface AiRig {
  groups: AiRigGroupFixtures[];
}

export type AiOutput = 'look' | 'song' | 'set';
export type AiMood = 'calm' | 'dreamy' | 'dark' | 'warm' | 'uplifting' | 'aggressive' | 'party';
export type AiMovement = 'off' | 'subtle' | 'big';

export const aiOutputs: AiOutput[] = ['look', 'song', 'set'];
export const aiMoods: AiMood[] = ['calm', 'dreamy', 'dark', 'warm', 'uplifting', 'aggressive', 'party'];
export const aiMovements: AiMovement[] = ['off', 'subtle', 'big'];

// the palettes of the pixel effects the user can pick for the looks (see pixel-palettes)
export const aiPalettes = [
  'rainbow',
  'pink-cyan',
  'fire',
  'ocean',
  'sunset',
  'ice',
  'aurora',
  'neon',
  'lava',
  'forest',
  'candy',
  'whites',
  'signal',
  'red-blue',
];

// The kinds of gobos the AI picks a gobo by, never by a slot of a wheel: the families of the patterns the preview draws
// the gobos with (see preview/models/gobo), the one a user matched to a gobo of a model, or else the one its name brings
export const aiGoboPatterns = ['breakup', 'dots', 'rays', 'star', 'bars', 'grid', 'rings', 'spiral', 'flower', 'polygon', 'checker'];

// what the user picked
export interface AiSettings {
  output: AiOutput;
  colors: string[];
  palette: string;
  mood: AiMood;
  energy: number;
  bpm: number;
  movement: AiMovement;
  contrast: number;
  strobe: boolean;
}

export function defaultAiSettings(bpm = 120): AiSettings {
  return {
    output: 'song',
    colors: [],
    palette: null,
    mood: null,
    energy: 3,
    bpm,
    movement: 'subtle',
    contrast: 0.5,
    strobe: false,
  };
}

// the request to the API: the rig, the settings and what the user asked for, or the looks to change and how
export interface AiLooksRequest {
  rig: { groups: AiRigGroup[] };
  settings: AiSettings;
  prompt: string;
  current?: AiLooks;
  instruction?: string;
  // only this scene of the current looks (its index) is changed, or one scene is added to them
  scene?: number;
  add?: boolean;
}

export interface AiFan {
  shape: 'linear' | 'center';
  from: number;
  to: number;
}

export type AiChase = 'none' | 'spread' | 'alternate';

export interface AiPreset {
  id: string;
  name: string;
  groups: string[];
  order: 'rig' | 'left-right' | 'front-back' | 'bottom-top';
  wings: boolean;
  dimmer: number;
  dimmerFan: AiFan;
  color: string;
  colorGradient: { colors: string[]; blend: 'smooth' | 'steps' };
  colorSequence: { colors: string[]; beatsPerColor: number; fade: 'snap' | 'smooth'; chase: AiChase };
  zoom: number;
  zoomFan: AiFan;
  position: { aim: 'center' | 'front' | 'back' | 'left' | 'right' | 'straight'; fanDegrees: number; fanShape: 'linear' | 'center' };
  movement: {
    shape: string;
    panDegrees: number;
    tiltDegrees: number;
    beats: number;
    chase: AiChase;
    fan: 'none' | 'linear' | 'center' | 'side';
  };
  dimmerEffect: { curve: string; beats: number; depth: number; width: number; chase: AiChase };
  pixel: { pattern: string; palette: string; colors: string[]; beats: number; direction: string; size: number };
  // a gobo of a kind (or 'any'), and how fast and which way it turns: from -1 (fastest anticlockwise) to 1
  gobo: { pattern: string; rotation: number };
  prism: { rotation: number };
  strobe: { effect: string; flashesPerSecond: number };
}

export interface AiScene {
  name: string;
  section: string;
  energy: number;
  presets: string[];
  fadeInBeats: number;
  fadeOutBeats: number;
}

// the answer of the API: the looks, kept to the rig and the settings
export interface AiLooks {
  name: string;
  summary: string;
  presets: AiPreset[];
  scenes: AiScene[];
}

export interface AiLooksResponse {
  looks: AiLooks;
  requestsLast24Hours: number;
  requestsPerUserPerDay: number;
}

export interface AiLooksStatus {
  available: boolean;
  requestsLast24Hours?: number;
  // null: as many as the user likes (an admin)
  requestsPerUserPerDay?: number;
}
