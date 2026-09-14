export type AmbientId =
  | 'rain'
  | 'white'
  | 'lofi'
  | 'forest'
  | 'ocean'
  | 'cafe'
  | 'fire'
  | 'thunder'
  | 'library'
  | 'cabin';

export const AMBIENT_LIBRARY: { id: AmbientId; label: string; desc: string }[] = [
  { id: 'rain', label: 'Rain Sounds', desc: 'Calming rain' },
  { id: 'white', label: 'White Noise', desc: 'Block distractions' },
  { id: 'lofi', label: 'Lo-fi Ambient', desc: 'Low-frequency hum' },
  { id: 'forest', label: 'Forest Ambience', desc: 'Birds & rustling leaves' },
  { id: 'ocean', label: 'Ocean Waves', desc: 'Steady coastal rhythm' },
  { id: 'cafe', label: 'Coffee Shop', desc: 'Café chatter & clinks' },
  { id: 'fire', label: 'Fireplace', desc: 'Crackling warmth' },
  { id: 'thunder', label: 'Thunderstorm', desc: 'Deep rolling thunder' },
  { id: 'library', label: 'Library Ambience', desc: '' },
  { id: 'cabin', label: 'Cabin Hum', desc: '' },
];
