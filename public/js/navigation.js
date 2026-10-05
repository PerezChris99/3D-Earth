(() => {
  'use strict';
  const current = location.pathname.replace(/\/$/, '') || '/';
  document.querySelectorAll('.mobile-bottom-nav a').forEach(link => {
    const href = new URL(link.href, location.origin).pathname.replace(/\/$/, '') || '/';
    if (href === current || (current === '/dashboard.html' && href === '/dashboard.html')) {
      link.setAttribute('aria-current', 'page');
    }
  });

  // Warm the browser cache before navigation without changing the URL or page model.
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
    link.addEventListener('pointerenter', () => prefetch(link), { once: true });
    link.addEventListener('focus', () => prefetch(link), { once: true });
  });
})();