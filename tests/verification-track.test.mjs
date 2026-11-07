import test from 'node:test';
import assert from 'node:assert/strict';
import {createCircuit} from '../dist/track.js';
import {verificationTrack} from '../dist/verification-track.js';

test('the headless frozen track exactly matches the playable original circuit',()=>{
  assert.deepEqual(verificationTrack,createCircuit());
});
