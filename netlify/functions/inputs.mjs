// AI사업단 성과관리 대시보드 — 실적 입력값 공유 저장 (Netlify Functions + Netlify Blobs)
// GET  /api/inputs            → { inputs: { <key>: {...} }, log: [ ...최근 40건 ] }
// POST /api/inputs  {op:'set', key, data} | {op:'delete', key} | {op:'log', data}
// 접속코드·권한 확인 없이 누구나 읽고 쓸 수 있습니다(요청 사항).
import { getStore } from '@netlify/blobs';

const STORE = 'ai-dashboard';
const KEY_RE = /^[a-z0-9-]{1,40}$/;
const LOG_KEEP = 300;
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});
const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
const numOrNull = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const isoOrNow = (v) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : new Date().toISOString());

export default async (req) => {
  const store = getStore({ name: STORE, consistency: 'strong' });

  if (req.method === 'GET') {
    const [{ blobs: ib }, { blobs: lb }] = await Promise.all([store.list({ prefix: 'inputs/' }), store.list({ prefix: 'log/' })]);
    const inputs = {};
    await Promise.all(ib.map(async (b) => {
      const v = await store.get(b.key, { type: 'json' });
      if (v) inputs[b.key.slice('inputs/'.length)] = v;
    }));
    const keys = lb.map((b) => b.key).sort().reverse().slice(0, 40);
    const log = (await Promise.all(keys.map((k) => store.get(k, { type: 'json' })))).filter(Boolean);
    return json({ inputs, log });
  }

  if (req.method === 'POST') {
    let body;
    try { body = await req.json(); } catch { return json({ error: 'JSON 형식이 아닙니다.' }, 400); }
    const op = body && body.op;

    if (op === 'set' || op === 'delete') {
      const key = String(body.key || '');
      if (!KEY_RE.test(key)) return json({ error: '잘못된 항목 키입니다.' }, 400);
      if (op === 'delete') { await store.delete(`inputs/${key}`); return json({ ok: true }); }
      const d = body.data || {};
      const value = numOrNull(d.value);
      if (value === null) return json({ error: '입력값은 숫자여야 합니다.' }, 400);
      await store.setJSON(`inputs/${key}`, {
        key, value, label: str(d.label, 120), file: numOrNull(d.file), editor: str(d.editor, 20) || '이름 없음', t: isoOrNow(d.t),
      });
      return json({ ok: true });
    }

    if (op === 'log') {
      const d = body.data || {};
      const t = isoOrNow(d.t);
      const id = `log/${t.replace(/[:.]/g, '-')}-${Math.random().toString(36).slice(2, 8)}`;
      await store.setJSON(id, { t, editor: str(d.editor, 20) || '이름 없음', text: str(d.text, 300) });
      const { blobs } = await store.list({ prefix: 'log/' });
      if (blobs.length > LOG_KEEP) {
        const old = blobs.map((b) => b.key).sort().slice(0, blobs.length - LOG_KEEP);
        await Promise.all(old.map((k) => store.delete(k)));
      }
      return json({ ok: true });
    }
    return json({ error: '알 수 없는 요청입니다.' }, 400);
  }

  return json({ error: '허용되지 않은 방식입니다.' }, 405);
};

export const config = { path: '/api/inputs' };
