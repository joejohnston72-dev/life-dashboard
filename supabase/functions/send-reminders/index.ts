// Supabase Edge Function: send-reminders
// Runs every minute (via pg_cron). Finds reminders due now in Europe/London
// and delivers them as Web Push notifications. DST-safe (matches local HH:MM).

import { createClient } from 'jsr:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC  = Deno.env.get('VAPID_PUBLIC')!;
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE')!;
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:reminders@example.com';

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

// Current time parts in Europe/London
function londonNow() {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', weekday: 'short',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date()).map(p => [p.type, p.value]));
  const dayMap: Record<string, number> = { Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6 };
  const hour = parts.hour === '24' ? '00' : parts.hour;
  return {
    hhmm:       `${hour}:${parts.minute}`,
    dayOfWeek:  dayMap[parts.weekday as string],
    dayOfMonth: parseInt(parts.day),
    date:       `${parts.year}-${parts.month}-${parts.day}`,
  };
}

function isDue(r: any, t: ReturnType<typeof londonNow>): boolean {
  if (r.time !== t.hhmm) return false;
  if (r.last_fired === t.date) return false;     // already fired today
  switch (r.type) {
    case 'daily':   return true;
    case 'weekly':  return (r.days_of_week ?? []).includes(t.dayOfWeek);
    case 'monthly': return r.day_of_month === t.dayOfMonth;
    case 'once':    return r.on_date === t.date;
    default:        return false;
  }
}

Deno.serve(async () => {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
  const t = londonNow();

  const { data: reminders, error } = await supabase
    .from('reminders').select('*').eq('active', true);
  if (error) return new Response(error.message, { status: 500 });

  const due = (reminders ?? []).filter(r => isDue(r, t));
  let sent = 0;

  for (const r of due) {
    const { data: subs } = await supabase
      .from('push_subscriptions').select('*').eq('user_id', r.user_id);

    const payload = JSON.stringify({
      title: r.title || 'Reminder',
      body:  r.text,
      url:   '/life-dashboard/habits/',
      tag:   r.id,
    });

    for (const s of subs ?? []) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
        );
        sent++;
      } catch (err: any) {
        // 404/410 = subscription expired; clean it up
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
        }
      }
    }

    // Update guard / deactivate one-offs
    if (r.type === 'once') {
      await supabase.from('reminders').update({ active: false, last_fired: t.date }).eq('id', r.id);
    } else {
      await supabase.from('reminders').update({ last_fired: t.date }).eq('id', r.id);
    }
  }

  return new Response(JSON.stringify({ checked: reminders?.length ?? 0, fired: due.length, pushes: sent }), {
    headers: { 'content-type': 'application/json' },
  });
});
