// Web Push subscription helper.
import { supabase } from './supabase.js';

const VAPID_PUBLIC = 'BP9iIN0xgAPUI_kcV6O7FEXD_z9nhMaS-kK3ttOjuUW0pb5-RwNYM2crB8oGndyez0kyxq4TV6kr8k9JVQxQxEU';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

export function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function notificationPermission() {
  return typeof Notification !== 'undefined' ? Notification.permission : 'unsupported';
}

// Request permission + subscribe + store subscription in Supabase. Returns true on success.
export async function enablePush() {
  if (!pushSupported()) throw new Error('Push not supported on this device/browser.');

  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notification permission denied. Enable it in Settings.');

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
    });
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in.');

  const json = sub.toJSON();
  await supabase.from('push_subscriptions').upsert({
    user_id:  user.id,
    endpoint: json.endpoint,
    p256dh:   json.keys.p256dh,
    auth:     json.keys.auth,
  }, { onConflict: 'endpoint' });

  return true;
}

export async function isPushEnabled() {
  if (!pushSupported() || Notification.permission !== 'granted') return false;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return !!sub;
}
