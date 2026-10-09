'use strict';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function isConfigured() { return Boolean(SUPABASE_URL && SUPABASE_KEY); }

async function query(table, params = '') {
  if (!isConfigured()) throw new Error('Supabase server credentials are not configured');
  const url = SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/' + table + (params ? '?' + params : '');
  let response;
  try {
    response = await fetch(url, {
      headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY, Accept: 'application/json' },
      signal: AbortSignal.timeout(12_000),
    });
  } catch (error) {
    if (error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      throw new Error('Supabase REST request timed out after 12000ms (' + table + ')');
    }
    throw new Error('Supabase REST network request failed (' + table + '): ' + (error?.message || 'unknown network error'));
  }
  if (!response.ok) {
    // Keep credentials and response bodies out of logs; the table and HTTP status are enough to diagnose most PostgREST failures.
    throw new Error('Supabase REST ' + response.status + ' (' + table + ')');
  }
  const payload = await response.json();
  if (!Array.isArray(payload)) throw new Error('Supabase REST returned an unexpected payload (' + table + ')');
  return payload;
}

module.exports = { isConfigured, query };
