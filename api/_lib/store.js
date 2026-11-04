import crypto from 'node:crypto';
import { get, put } from '@vercel/blob';

export function json(res, status, body, extra={}) {
  res.statusCode = status;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  for (const [k,v] of Object.entries(extra)) res.setHeader(k,v);
  res.end(JSON.stringify(body));
}

export function cors(req,res) {
  const allowed = new Set([
    'https://alidedeogluarsivi.com',
    'https://www.alidedeogluarsivi.com',
    'https://alidedeogluarsivi.github.io'
  ]);
  const origin = req.headers.origin || '';
  if (allowed.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary','Origin');
  }
  res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if (req.method === 'OPTIONS') { res.statusCode=204; res.end(); return true; }
  return false;
}

export async function readBody(req) {
  const chunks=[]; for await (const c of req) chunks.push(c);
  const raw=Buffer.concat(chunks).toString('utf8');
  const ct=String(req.headers['content-type']||'');
  if (ct.includes('application/json')) return raw ? JSON.parse(raw) : {};
  if (ct.includes('application/x-www-form-urlencoded')) return Object.fromEntries(new URLSearchParams(raw));
  return raw;
}

export function randomId(prefix='ord') {
  return prefix + crypto.randomBytes(18).toString('hex');
}
export function randomToken() {
  return crypto.randomBytes(32).toString('base64url');
}
export function sha256(v) {
  return crypto.createHash('sha256').update(String(v)).digest('hex');
}
export function hmacBase64(key, value) {
  return crypto.createHmac('sha256', key).update(value).digest('base64');
}
export function safeEqual(a,b) {
  const x=Buffer.from(String(a||'')); const y=Buffer.from(String(b||''));
  return x.length===y.length && crypto.timingSafeEqual(x,y);
}
export function orderPath(id){ return `orders/${id}.json`; }

export async function readJsonBlob(path) {
  const r = await get(path,{access:'private'});
  if (!r || r.statusCode !== 200 || !r.stream) return null;
  return await new Response(r.stream).json();
}
export async function writeJsonBlob(path, obj) {
  return put(path, JSON.stringify(obj), {
    access:'private',
    allowOverwrite:true,
    contentType:'application/json',
    cacheControlMaxAge:60
  });
}
