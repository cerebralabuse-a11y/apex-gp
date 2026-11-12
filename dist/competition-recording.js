import {createVerificationRun,stepVerificationRun,quantizeInput,RULESET,TRACK_ID} from './verification-core.js';
import {verificationTrack} from './verification-track.js';

// Only the opt-in beta drive uses this fixed protocol. Practice keeps its
// existing simulation, setups, input precision and browser personal records.
export function createRecordedAttempt(ticket,car){
  if(ticket?.ruleset!==RULESET||ticket.trackId!==TRACK_ID||typeof ticket.attemptId!=='string')throw new Error('Unsupported beta attempt');
  const run=createVerificationRun(verificationTrack),recording={version:1,ruleset:RULESET,trackId:TRACK_ID,frames:[]};
  if(car){Object.assign(car,run.car);run.car=car}
  return{ticket,run,recording,step(raw){const encoded=quantizeInput(raw);recording.frames.push(encoded);stepVerificationRun(run,encoded);return run.stage},invalidate(reason){if(run.stage==='outlap'||run.stage==='timed'){run.stage='invalid';run.invalidReason=reason}}};
}
