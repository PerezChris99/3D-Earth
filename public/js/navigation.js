(() => {
'use strict';

const PAGES = [
  ['home','HOME','/'],
  ['globe','GLOBE','/dashboard.html'],
  ['satellites','SATELLITES','/satellites.html'],
  ['map','MAP','/map.html'],
  ['about','ABOUT','/about.html'],
  ['sources','SOURCES','/data-policy.html']
];

const ICONS = {
  home:'<path d="M3 10.8 12 3l9 7.8v9.2a1 1 0 0 1-1 1h-5.5v-6h-5v6H4a1 1 0 0 1-1-1z"/>',
  globe:'<circle cx="12" cy="12" r="8.5"/><path d="M3.7 9h16.6M3.7 15h16.6M12 3.5c2.2 2.3 3.3 5.1 3.3 8.5s-1.1 6.2-3.3 8.5"/>',
  satellites:'<circle cx="12" cy="12" r="2.5"/><path d="M7.5 7.5a6.4 6.4 0 0 0 0 9M16.5 7.5a6.4 6.4 0 0 1 0 9M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14"/>',
  map:'<path d="m4 6 6-2 4 2 6-2v14l-6 2-4-2-6 2z"/><path d="M10 4v14M14 6v14"/>',
  about:'<circle cx="12" cy="7" r="3"/><path d="M5.5 20c.7-3.4 2.9-5 6.5-5s5.8 1.6 6.5 5"/>',
  sources:'<path d="M5 4.5h14v15H5z"/><path d="M8 8h8M8 12h8M8 16h5"/>'
};

const path = location.pathname.replace(/\/$/,'') || '/';
const hash = location.hash;

function active(id, href) {
  const hrefPath = new URL(href, location.origin).pathname.replace(/\/$/,'') || '/';
  if (id === 'satellites') return path === '/satellites.html' || (path === '/dashboard.html' && hash === '#satellites');
  return hrefPath === path;
}

function renderDesktop() {
  let nav = document.querySelector('.global-site-nav');
  if (!nav) {
    nav = document.createElement('nav');
    nav.className = 'global-site-nav';
    nav.setAttribute('aria-label','Primary navigation');
    document.body.appendChild(nav);
  }
  nav.innerHTML = PAGES.map(([id,label,href]) =>
    '<a href="' + href + '"' + (active(id,href) ? ' aria-current="page"' : '') + '>' + label + '</a>'
  ).join('');
}

function renderMobile() {
  let nav = document.querySelector('.mobile-bottom-nav');
  if (!nav) {
    nav = document.createElement('nav');
    nav.className = 'mobile-bottom-nav';
    nav.setAttribute('aria-label','Primary navigation');
    document.body.appendChild(nav);
  }
  nav.innerHTML = PAGES.map(([id,label,href]) =>
    '<a href="' + href + '"' + (active(id,href) ? ' aria-current="page"' : '') + '><svg viewBox="0 0 24 24" aria-hidden="true">' + ICONS[id] + '</svg><span>' + label + '</span></a>'
  ).join('');
}

renderDesktop();
renderMobile();

const prefetched = new Set();
function prefetch(link) {
  try {
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin || prefetched.has(url.href)) return;
    prefetched.add(url.href);
    const p = document.createElement('link');
    p.rel = 'prefetch';
    p.as = 'document';
    p.href = url.href;
    document.head.appendChild(p);
  } catch (_) {}
}
document.querySelectorAll('a[href]').forEach(link => {
  if (link.target === '_blank' || link.hasAttribute('download')) return;
  link.addEventListener('pointerenter', () => prefetch(link), {once:true});
  link.addEventListener('focus', () => prefetch(link), {once:true});
});
})();