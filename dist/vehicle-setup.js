export const SETUPS=Object.freeze({
  balanced:Object.freeze({name:'Balanced',grip:1,drag:1}),
  corner:Object.freeze({name:'High downforce',grip:1.14,drag:1.1}),
  straight:Object.freeze({name:'Low drag',grip:.9,drag:.9})
});
export const setupId=value=>Object.hasOwn(SETUPS,value)?value:'balanced';
export function bestLapKey(trackId,setup){
  const id=setupId(setup);
  return 'best-'+trackId+(id==='balanced'?'':'-setup-'+id);
}
