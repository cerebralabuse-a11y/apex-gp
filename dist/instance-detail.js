// Keep nearby spectators intact while submitting fewer distant instances on phones.
export function createInstanceDetail(mesh,distance=320){
  const count=mesh.count,matrices=mesh.instanceMatrix.array.slice(),colors=mesh.instanceColor?.array.slice();
  let previousX=Infinity,previousZ=Infinity,previousEnabled=false;
  return function update(x,z,enabled){
    if(enabled===previousEnabled&&(!enabled||Math.hypot(x-previousX,z-previousZ)<32))return;
    previousX=x;previousZ=z;previousEnabled=enabled;
    let n=0;
    for(let i=0;i<count;i++){
      if(enabled&&Math.hypot(matrices[i*16+12]-x,matrices[i*16+14]-z)>distance)continue;
      mesh.instanceMatrix.array.set(matrices.subarray(i*16,i*16+16),n*16);
      if(colors)mesh.instanceColor.array.set(colors.subarray(i*3,i*3+3),n*3);n++;
    }
    mesh.count=n;mesh.instanceMatrix.needsUpdate=true;if(colors)mesh.instanceColor.needsUpdate=true;mesh.computeBoundingSphere();
  };
}
