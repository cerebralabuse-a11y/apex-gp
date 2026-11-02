export function selectedMap(search){
  return new URLSearchParams(search).get('map')==='city'?'city':'classic';
}
export function mapUrl(href,map){
  const url=new URL(href);
  if(map==='city')url.searchParams.set('map','city');else url.searchParams.delete('map');
  return url.href;
}
