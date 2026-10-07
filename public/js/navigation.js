(() => {
'use strict';
const current=(location.pathname.replace(/\/$/,'')||'/');
const hash=location.hash;
document.querySelectorAll('.mobile-bottom-nav a').forEach(link=>{
 const url=new URL(link.href,location.origin),href=url.pathname.replace(/\/$/,'')||'/';
 const active=href===current&&!(current==='/dashboard.html'&&hash==='#satellites') || (current==='/dashboard.html'&&hash==='#satellites'&&link.dataset.nav==='satellites');
 if(active)link.setAttribute('aria-current','page');
});
const prefetched=new Set();
function prefetch(link){try{const url=new URL(link.href,location.href);if(url.origin!==location.origin||prefetched.has(url.href))return;prefetched.add(url.href);const p=document.createElement('link');p.rel='prefetch';p.as='document';p.href=url.href;document.head.appendChild(p)}catch(_){}}
document.querySelectorAll('a[href]').forEach(link=>{if(link.target==='_blank'||link.hasAttribute('download'))return;link.addEventListener('pointerenter',()=>prefetch(link),{once:true});link.addEventListener('focus',()=>prefetch(link),{once:true})});
})();