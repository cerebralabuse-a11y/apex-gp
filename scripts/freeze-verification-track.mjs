import {writeFile} from 'node:fs/promises';
import {createCircuit} from '../dist/track.js';

// Run explicitly when issuing a new verification ruleset, never at client boot.
const track=createCircuit();
const output='// Frozen numeric circuit for independent replay. Regenerate only with a new ruleset.\nexport const verificationTrack='+JSON.stringify(track)+';\n';
await writeFile(new URL('../dist/verification-track.js',import.meta.url),output);
console.log('Frozen '+track.id+' with '+track.points.length+' points.');
