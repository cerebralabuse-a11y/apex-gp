import * as THREE from './vendor/three.module.js';

// Hand-traced from the user's 399 x 501 circuit reference. North stays at -Z.
// Scenery shares these coordinates, keeping the shorelines aligned with the route.
const route=[
  [241,307],[225,306],[207,297],[176,273],[148,249],
  [139,258],[126,261],[114,256],[107,245],
  [106,229],[102,219],[90,207],[78,211],
  [61,231],[37,261],[15,289],[16,300],
  [22,310],[31,317],[39,328],[47,333],
  [59,329],[67,333],[69,346],[65,363],
  [78,384],[105,408],[137,432],[177,450],
  [220,462],[264,471],[291,484],[306,486],
  [321,475],[345,451],[370,425],[391,403],
  [393,373],[390,337],[387,301],[380,292],
  [355,295],[317,301],[277,306]
];
const cornerPixels=[
  [1,235,307,'Jewel Bend'],[2,148,249,'Park Esses'],[3,126,261,'Palm Turn'],
  [4,107,245,'North Kink'],[5,103,221,'Nerul'],[6,80,209,'Gymkhana'],
  [7,15,291,'Coastal Entry'],[8,22,310,'Mangrove Left'],[9,31,317,'Mangrove Right'],
  [10,47,333,'Promenade'],[11,64,332,'Lake Chicane'],[12,65,363,'Flamingo Bend'],
  [13,305,486,'Karave Hairpin'],[14,386,298,'Tandel Corner']
];
const rawCurve=new THREE.CatmullRomCurve3(route.map(([x,z])=>new THREE.Vector3(x-204,0,z-348)),true,'centripetal');
rawCurve.arcLengthDivisions=3000;
export const MAP_SCALE=3753/rawCurve.getLength();
export function mapToWorld(u,v){return{x:(u-204)*MAP_SCALE,z:(v-348)*MAP_SCALE}}
export const lakeOutlines=[
  [[79,277],[99,270],[126,272],[143,283],[148,308],[159,335],[183,355],[207,368],[226,369],[247,358],[266,355],[285,362],[301,378],[310,399],[304,418],[286,435],[262,442],[227,437],[186,426],[150,413],[121,396],[98,373],[84,347],[80,315]],
  [[112,405],[147,422],[188,436],[227,447],[259,451],[277,460],[264,463],[221,454],[179,443],[144,429],[119,418]],
  [[239,476],[257,476],[276,484],[288,495],[283,516],[257,520],[239,509],[230,490]],
  [[326,346],[341,345],[347,355],[341,365],[326,363],[321,354]]
];
export function createCircuit(){
  const curve=new THREE.CatmullRomCurve3(route.map(([u,v])=>{const p=mapToWorld(u,v);return new THREE.Vector3(p.x,0,p.z)}),true,'centripetal');
  curve.arcLengthDivisions=3000;
  const length=curve.getLength(),count=2400,points=curve.getSpacedPoints(count).map(p=>({x:p.x,z:p.z}));
  const closest=p=>{let best=Infinity,index=0;points.forEach((q,i)=>{const d=(q.x-p.x)**2+(q.z-p.z)**2;if(d<best){best=d;index=i}});return index*length/count};
  const corners=cornerPixels.map(([number,u,v,name])=>{const p=mapToWorld(u,v);return{number,name,...p,s:closest(p)}});
  return{points,length,step:length/count,halfWidth:9,wallOffset:8.3,start:closest(mapToWorld(320,301)),id:'palm-beach-3753-v2',corners};
}
