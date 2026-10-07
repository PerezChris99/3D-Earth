(() => {
'use strict';
const rad=Math.PI/180,deg=180/Math.PI;
function julian(date){return date.getTime()/86400000+2440587.5}
function solar(date,lat,lon){
 const jd=julian(date),n=jd-2451545.0,g=(357.529+0.98560028*n)*rad,L=(280.459+0.98564736*n+1.915*Math.sin(g)+0.020*Math.sin(2*g))*rad,eps=(23.439-0.00000036*n)*rad;
 const ra=Math.atan2(Math.cos(eps)*Math.sin(L),Math.cos(L)),dec=Math.asin(Math.sin(eps)*Math.sin(L));
 const gmst=(280.46061837+360.98564736629*(jd-2451545)+0.000387933*((jd-2451545)/36525)**2)%360;
 let ha=(gmst+lon)-ra*deg;ha=((ha+540)%360)-180;
 const phi=lat*rad,H=ha*rad;const altitude=Math.asin(Math.sin(phi)*Math.sin(dec)+Math.cos(phi)*Math.cos(dec)*Math.cos(H))*deg;
 const azimuth=(Math.atan2(Math.sin(H),Math.cos(H)*Math.sin(phi)-Math.tan(dec)*Math.cos(phi))*deg+180)%360;
 const subLon=((ra*deg-gmst+540)%360)-180,subLat=dec*deg;
 return {altitude,azimuth,subLat,subLon,ra,dec};
}
function sunDirection(date){const jd=julian(date),n=jd-2451545,g=(357.529+0.98560028*n)*rad,L=(280.459+0.98564736*n+1.915*Math.sin(g)+0.020*Math.sin(2*g))*rad,eps=(23.439-0.00000036*n)*rad;const x=Math.cos(L),y=Math.cos(eps)*Math.sin(L),z=Math.sin(eps)*Math.sin(L);return new THREE.Vector3(x,z,-y).normalize()}
window.PlanetAstronomy={solar,sunDirection};
})();