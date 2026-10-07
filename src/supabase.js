'use strict';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function isConfigured() { return Boolean(SUPABASE_URL && SUPABASE_KEY); }

async function query(table, params = '') {
  if (!isConfigured()) throw new Error('Supabase server credentials are not configured');
  const url = SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/' + table + (params ? '?' + params : '');
  const response = await fetch(url, { headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY, Accept: 'application/json' } });
  if (!response.ok) throw new Error('Supabase REST ' + response.status);
  return response.json();
}

module.exports = { isConfigured, query };
