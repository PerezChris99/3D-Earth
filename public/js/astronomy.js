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
function gmstRadians(date){const jd=julian(date),t=(jd-2451545.0)/36525;let degrees=280.46061837+360.98564736629*(jd-2451545.0)+0.000387933*t*t-t*t*t/38710000;degrees=((degrees%360)+360)%360;return degrees*rad}
function moon(date){const d=julian(date)-2451543.5,N=(125.1228-0.0529538083*d)*rad,i=5.1454*rad,w=(318.0634+0.1643573223*d)*rad,e=.0549,M=((115.3654+13.0649929509*d)%360)*rad;let E=M+e*Math.sin(M)*(1+e*Math.cos(M));for(let j=0;j<4;j++)E-=(E-e*Math.sin(E)-M)/(1-e*Math.cos(E));const xv=60.2666*(Math.cos(E)-e),yv=60.2666*Math.sqrt(1-e*e)*Math.sin(E),v=Math.atan2(yv,xv),r=Math.hypot(xv,yv),lon=v+w;const xh=r*(Math.cos(N)*Math.cos(lon)-Math.sin(N)*Math.sin(lon)*Math.cos(i)),yh=r*(Math.sin(N)*Math.cos(lon)+Math.cos(N)*Math.sin(lon)*Math.cos(i)),zh=r*Math.sin(lon)*Math.sin(i),eps=(23.4393-3.563e-7*d)*rad;const xe=xh,ye=yh*Math.cos(eps)-zh*Math.sin(eps),ze=yh*Math.sin(eps)+zh*Math.cos(eps),ra=Math.atan2(ye,xe),dec=Math.asin(ze/r),gmst=gmstRadians(date),subLon=((ra-gmst+3*Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI;const sunM=((357.529+0.98560028*d)%360)*rad,sunL=(280.459+0.98564736*d+1.915*Math.sin(sunM)+.020*Math.sin(2*sunM))*rad,moonLon=Math.atan2(yh,xh),phaseAngle=Math.acos(Math.max(-1,Math.min(1,Math.cos(moonLon-sunL))));return{subLat:dec*deg,subLon:subLon*deg,ra,dec,distanceEarthRadii:r,illumination:(1-Math.cos(phaseAngle))/2}}
function sunDirection(date){const jd=julian(date),n=jd-2451545,g=(357.529+0.98560028*n)*rad,L=(280.459+0.98564736*n+1.915*Math.sin(g)+0.020*Math.sin(2*g))*rad,eps=(23.439-0.00000036*n)*rad;const x=Math.cos(L),y=Math.cos(eps)*Math.sin(L),z=Math.sin(eps)*Math.sin(L);return new THREE.Vector3(x,z,-y).normalize()}
window.PlanetAstronomy={solar,sunDirection,moon,gmstRadians};
})();