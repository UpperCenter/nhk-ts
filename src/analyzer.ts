export { detectBlackBoundariesWithMagick } from './analyzer/blackBoundaries.js';
export { getFrameMeansFromBuffers, splitPngFrames, extractFramesToBuffers } from './analyzer/frames.js';
export { detectSilencePeriods } from './analyzer/silence.js';
export { detectAudioLevels } from './analyzer/audioLevels.js';
export { getAudioLevelAt, isFrameSilent } from './analyzer/helpers.js'; 