import test from 'node:test';
import assert from 'node:assert/strict';
import {createCircuit} from '../dist/track.js';
import {verificationTrack} from '../dist/verification-track.js';

const matches=(a,b)=>typeof a==='number'&&typeof b==='number'?Math.abs(a-b)<1e-9:Array.isArray(a)&&Array.isArray(b)?a.length===b.length&&a.every((value,index)=>matches(value,b[index])):a&&b&&typeof a==='object'&&typeof b==='object'?Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(key=>Object.hasOwn(b,key)&&matches(a[key],b[key])):a===b;

test('the headless frozen track matches the playable original circuit within one nanometre',()=>{
  assert.equal(matches(verificationTrack,createCircuit()),true);
});
