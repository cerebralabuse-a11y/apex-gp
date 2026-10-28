import * as THREE from './vendor/three.module.js';
import {sampleTrack} from './physics.js';

export function clipPolygon(points,distance){
  const result=[];
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length],da=distance(a),db=distance(b);
    if(da>=0)result.push({...a});
    if((da>=0)!==(db>=0)){const t=da/(da-db);result.push({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t})}
  }
  return result;
}

export function offsetContour(points,width){
  const area=points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p.x*q.z-q.x*p.z},0),sign=area>=0?1:-1;
  const normals=points.map((p,i)=>{const q=points[(i+1)%points.length],dx=q.x-p.x,dz=q.z-p.z,len=Math.hypot(dx,dz)||1;return{x:sign*dz/len,z:-sign*dx/len}});
  return points.map((p,i)=>{
    const a=normals[(i+points.length-1)%points.length],b=normals[i],len=Math.hypot(a.x+b.x,a.z+b.z)||1,nx=(a.x+b.x)/len,nz=(a.z+b.z)/len;
    const miter=Math.min(width*2,width/Math.max(.5,nx*b.x+nz*b.z));
    return{x:p.x+nx*miter,z:p.z+nz*miter};
  });
}

// Shared endpoints make the concrete, rail bars and kerbs continuous through bends.
export function trackBand(track,inner,outer,bottom,top,material,count=track.points.length-1,colors=null){
  const positions=[],indices=[],vertexColors=[];
  for(let i=0;i<count;i++){
    const base=i*8;
    for(const s of [i*track.length/count,(i+1)*track.length/count]){
      for(const [offset,y] of [[inner,bottom],[outer,bottom],[outer,top],[inner,top]]){
        const p=sampleTrack(track,s,offset);positions.push(p.x,y,p.z);
        if(colors)vertexColors.push(...new THREE.Color(colors[i%colors.length]).toArray());
      }
    }
    for(let j=0;j<4;j++){const k=(j+1)%4;indices.push(base+j,base+4+j,base+k,base+k,base+4+j,base+4+k)}
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);
  if(colors)geometry.setAttribute('color',new THREE.Float32BufferAttribute(vertexColors,3));geometry.computeVertexNormals();
  const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=mesh.receiveShadow=true;return mesh;
}
