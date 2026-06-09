// Supabase Edge Function: bank
// Free real-bank data via GoCardless Bank Account Data (formerly Nordigen).
// One function, routed by `action` in the JSON body:
//   { action: 'institutions' }                  -> list GB banks
//   { action: 'connect', institution_id }        -> create a bank-link, return its URL
//   { action: 'sync' }                            -> pull transactions for linked banks
//
// Secrets required: GC_SECRET_ID, GC_SECRET_KEY  (SUPABASE_URL / SERVICE_ROLE auto-injected)

import { createClient } from 'jsr:@supabase/supabase-js@2';

const GC = 'https://bankaccountdata.gocardless.com/api/v2';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GC_SECRET_ID = Deno.env.get('GC_SECRET_ID')!;
const GC_SECRET_KEY = Deno.env.get('GC_SECRET_KEY')!;
const REDIRECT = 'https://joejohnston72-dev.github.io/life-dashboard/finance/?bankreturn=1';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });

async function gcToken(): Promise<string> {
  const r = await fetch(`${GC}/token/new/`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ secret_id: GC_SECRET_ID, secret_key: GC_SECRET_KEY }),
  });
  if (!r.ok) throw new Error('GoCardless auth failed: ' + (await r.text()));
  return (await r.json()).access;
}

const gcGet = (path: string, token: string) =>
  fetch(`${GC}${path}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    // Identify the caller from their JWT
    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'unauthenticated' }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { action, institution_id } = await req.json().catch(() => ({}));
    const token = await gcToken();

    // ── List GB banks ──
    if (action === 'institutions') {
      const list = await gcGet('/institutions/?country=gb', token);
      const banks = (Array.isArray(list) ? list : []).map((b: any) => ({
        id: b.id, name: b.name, logo: b.logo,
      }));
      return json({ banks });
    }

    // ── Start a bank connection ──
    if (action === 'connect') {
      if (!institution_id) return json({ error: 'institution_id required' }, 400);
      const reference = crypto.randomUUID();
      const r = await fetch(`${GC}/requisitions/`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ redirect: REDIRECT, institution_id, reference }),
      });
      const req2 = await r.json();
      if (!req2.link) return json({ error: 'connect failed', detail: req2 }, 400);
      await admin.from('bank_connections').insert({
        user_id: user.id, requisition_id: req2.id, institution_id, reference, status: 'pending',
      });
      return json({ link: req2.link });
    }

    // ── Sync transactions for all linked banks ──
    if (action === 'sync') {
      const { data: conns } = await admin.from('bank_connections')
        .select('*').eq('user_id', user.id);

      let imported = 0, accountsLinked = 0;
      for (const c of conns ?? []) {
        const reqn = await gcGet(`/requisitions/${c.requisition_id}/`, token);
        const accounts: string[] = reqn.accounts ?? [];
        await admin.from('bank_connections')
          .update({ status: reqn.status, accounts }).eq('id', c.id);
        if (reqn.status !== 'LN' || !accounts.length) continue;
        accountsLinked += accounts.length;

        for (const acc of accounts) {
          const tx = await gcGet(`/accounts/${acc}/transactions/`, token);
          const booked = tx?.transactions?.booked ?? [];
          for (const t of booked) {
            const id = t.transactionId || `${acc}-${t.bookingDate}-${t.transactionAmount?.amount}`;
            const amount = parseFloat(t.transactionAmount?.amount ?? '0');
            const desc = t.remittanceInformationUnstructured
              || t.creditorName || t.debtorName || 'Transaction';
            const { error } = await admin.from('bank_transactions').upsert({
              id, user_id: user.id, account_id: acc,
              date: t.bookingDate || t.valueDate,
              amount, currency: t.transactionAmount?.currency || 'GBP',
              description: String(desc).slice(0, 140),
            }, { onConflict: 'id' });
            if (!error) imported++;
          }
        }
      }
      return json({ accountsLinked, imported });
    }

    return json({ error: 'unknown action' }, 400);
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
