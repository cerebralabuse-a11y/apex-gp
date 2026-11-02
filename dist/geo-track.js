import * as THREE from './vendor/three.module.js';
import {nearestTrack} from './physics.js';

const R=6378137,rad=Math.PI/180;
export function geographicFrame(box){
  if(!Array.isArray(box)||box.length!==4||!box.every(Number.isFinite)||box[0]>=box[2]||box[1]>=box[3])throw new Error('Invalid city boundary');
  const origin=[(box[0]+box[2])/2,(box[1]+box[3])/2],cos=Math.cos(origin[1]*rad),north=Math.log(Math.tan(Math.PI/4+origin[1]*rad/2));
  return {origin,
    toWorld([lng,lat]){return{x:(lng-origin[0])*rad*R*cos,z:(north-Math.log(Math.tan(Math.PI/4+lat*rad/2)))*R*cos}},
    toGeo({x,z}){return[origin[0]+x/(rad*R*cos),(2*Math.atan(Math.exp(north-z/(R*cos)))-Math.PI/2)/rad]}
  };
}

export function createCityCircuit(data,area){
  const frame=geographicFrame(area.bbox),line=data.features.find(f=>f.properties.role==='circuit');
  if(!line||line.geometry.type!=='LineString')throw new Error('City circuit is missing');
  const raw=line.geometry.coordinates.map(p=>frame.toWorld(p)),dense=[];
  for(let i=0;i<raw.length-1;i++){
    const a=raw[i],b=raw[i+1],steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/4));
    for(let j=0;j<steps;j++)dense.push(new THREE.Vector3(a.x+(b.x-a.x)*j/steps,0,a.z+(b.z-a.z)*j/steps));
  }
  const curve=new THREE.CatmullRomCurve3(dense,true,'centripetal');curve.arcLengthDivisions=6000;
  const length=curve.getLength(),count=2400;
  const track={points:curve.getSpacedPoints(count).map(p=>({x:p.x,z:p.z})),length,step:length/count,halfWidth:9,wallOffset:8.3,start:0,id:'navi-mumbai-mapbox-v1',frame};
  track.corners=line.properties.corners.map(([number,lng,lat,name])=>{
    const p=frame.toWorld([lng,lat]);return{number,name,...p,s:nearestTrack(track,p.x,p.z).s};
  });
  return track;
}

export function corridorPolygon(track,width){
  const left=[],right=[];
  for(let i=0;i<track.points.length-1;i+=3){
    const p=track.points[i],next=track.points[i+1],dx=next.x-p.x,dz=next.z-p.z,len=Math.hypot(dx,dz);
    left.push(track.frame.toGeo({x:p.x-dz/len*width,z:p.z+dx/len*width}));
    right.push(track.frame.toGeo({x:p.x+dz/len*width,z:p.z-dx/len*width}));
  }
  const ring=left.concat(right.reverse());ring.push(ring[0]);
  return{type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[ring]}};
}
