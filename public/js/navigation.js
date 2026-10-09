(() => {
'use strict';
const PAGES=[['home','HOME','/'],['globe','GLOBE','/dashboard.html'],['satellites','SATELLITES','/satellites.html'],['map','MAP','/map.html'],['about','ABOUT','/about.html'],['sources','SOURCES','/data-policy.html']];
const MOBILE=PAGES.slice(0,4);
const ICONS={
 home:'<path d="M3 10.8 12 3l9 7.8v9.2a1 1 0 0 1-1 1h-5.5v-6h-5v6H4a1 1 0 0 1-1-1z"/>',
 globe:'<circle cx="12" cy="12" r="8.5"/><path d="M3.7 9h16.6M3.7 15h16.6M12 3.5c2.2 2.3 3.3 5.1 3.3 8.5s-1.1 6.2-3.3 8.5"/>',
 satellites:'<circle cx="12" cy="12" r="2.5"/><path d="M7.5 7.5a6.4 6.4 0 0 0 0 9M16.5 7.5a6.4 6.4 0 0 1 0 9M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14"/>',
 map:'<path d="m4 6 6-2 4 2 6-2v14l-6 2-4-2-6 2z"/><path d="M10 4v14M14 6v14"/>'
};
const path=location.pathname.replace(/\/$/,'')||'/',hash=location.hash;
function active(id,href){const p=new URL(href,location.origin).pathname.replace(/\/$/,'')||'/';return id==='satellites'?(path==='/satellites.html'||(path==='/dashboard.html'&&hash==='#satellites')):p===path}
function renderDesktop(){
 document.querySelectorAll('.landing-nav > nav,.sat-site-nav > nav,.info-header > nav,.hud-header > nav,.map-header > nav,nav.global-site-nav').forEach(n=>n.remove());
 let cluster=document.querySelector('.site-nav-cluster');if(!cluster){cluster=document.createElement('div');cluster.className='site-nav-cluster';cluster.setAttribute('aria-label','Site navigation');document.body.appendChild(cluster)}
 let nav=cluster.querySelector('.global-site-nav');if(!nav){nav=document.createElement('nav');nav.className='global-site-nav';nav.setAttribute('aria-label','Primary navigation');cluster.appendChild(nav)}
 nav.innerHTML=PAGES.map(([id,label,href])=>'<a href="'+href+'"'+(active(id,href)?' aria-current="page"':'')+'>'+label+'</a>').join('');
 let cta=cluster.querySelector('.global-open-globe');if(!cta){cta=document.createElement('a');cta.className='global-open-globe';cta.href='/dashboard.html';cta.textContent='OPEN GLOBE';cluster.appendChild(cta)}
}
function renderMobile(){let nav=document.querySelector('.mobile-bottom-nav');if(!nav){nav=document.createElement('nav');nav.className='mobile-bottom-nav';nav.setAttribute('aria-label','Primary navigation');document.body.appendChild(nav)}nav.innerHTML=MOBILE.map(([id,label,href])=>'<a href="'+href+'"'+(active(id,href)?' aria-current="page"':'')+'><svg viewBox="0 0 24 24" aria-hidden="true">'+ICONS[id]+'</svg><span>'+label+'</span></a>').join('')}
if(document.querySelector(".info-layout"))document.body.classList.add("light-content-page");
renderDesktop();renderMobile();
const prefetched=new Set();function prefetch(link){try{const url=new URL(link.href,location.href);if(url.origin!==location.origin||prefetched.has(url.href))return;prefetched.add(url.href);const p=document.createElement('link');p.rel='prefetch';p.as='document';p.href=url.href;document.head.appendChild(p)}catch(_){}}
document.querySelectorAll('a[href]').forEach(link=>{if(link.target==='_blank'||link.hasAttribute('download'))return;link.addEventListener('pointerenter',()=>prefetch(link),{once:true});link.addEventListener('focus',()=>prefetch(link),{once:true})});
})();