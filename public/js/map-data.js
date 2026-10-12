/* Shared, unit-tested map data contracts for Leaflet and the canvas fallback. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.EarthMapData = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function numberOrNull(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string' && value.trim() === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
  function isValidPoint(item) {
    if (!item || typeof item !== 'object') return false;
    const latitude = numberOrNull(item.latitude);
    const longitude = numberOrNull(item.longitude);
    return latitude !== null && longitude !== null &&
      Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
  }
  function itemKey(item) {
    if (item.id !== null && item.id !== undefined && String(item.id) !== '') return String(item.id);
    return [item.sector || 'unknown', numberOrNull(item.latitude), numberOrNull(item.longitude),
      item.observed_at || item.occurred_at || '', item.label || item.event_type || item.metric || ''].join('|');
  }
  function mergeItems() {
    const merged = new Map();
    for (const collection of arguments) {
      if (!Array.isArray(collection)) continue;
      for (const item of collection) {
        if (!isValidPoint(item)) continue;
        const key = itemKey(item);
        const previous = merged.get(key);
        if (!previous) {
          merged.set(key, { ...item, latitude: numberOrNull(item.latitude), longitude: numberOrNull(item.longitude) });
          continue;
        }
        const next = { ...previous };
        Object.entries(item).forEach(([field, value]) => {
          if (value !== null && value !== undefined && value !== '') next[field] = value;
        });
        merged.set(key, next);
      }
    }
    return Array.from(merged.values());
  }
  function layersFromItems(items, sectors) {
    const source = Array.isArray(items) ? items : [];
    return Object.entries(sectors || {}).map(([sector, config]) => {
      const count = source.reduce((total, item) => total + (item.sector === sector ? 1 : 0), 0);
      return { sector, label: config && config.label ? config.label : sector.replaceAll('_', ' '), loaded_count: count, count };
    });
  }
  return Object.freeze({ isValidPoint, mergeItems, layersFromItems });
});
