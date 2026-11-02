import test from 'node:test';
import assert from 'node:assert/strict';
import {selectedMap,mapUrl} from '../dist/map-choice.js';
test('original is always the default and the city beta is an explicit opt-in',()=>{
  for(const search of ['', '?map=classic','?map=unknown','?city-version=example'])assert.equal(selectedMap(search),'classic');
  assert.equal(selectedMap('?map=city'),'city');
  const beta=mapUrl('https://example.com/?mode=free','city');
  assert.equal(beta,'https://example.com/?mode=free&map=city');
  assert.equal(mapUrl(beta,'classic'),'https://example.com/?mode=free');
});
