import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL  = process.env.EXPO_PUBLIC_SUPABASE_URL  || '';
const SUPABASE_ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON || '';
const API_BASE      = process.env.EXPO_PUBLIC_API_BASE      || 'http://localhost:3001';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

/* ─── Telegram ID storage (AsyncStorage or a simple module-level var for demo) ─── */
let _telegramId: number | null = null;

export function setTelegramId(id: number) {
  _telegramId = id;
}
export function getTelegramId(): number | null {
  return _telegramId;
}

/* ─── REST API helpers ─── */

export async function fetchMeals(telegramId: number, date?: string) {
  const params = date ? `?date=${date}` : '';
  const res = await fetch(`${API_BASE}/api/meals/${telegramId}${params}`);
  if (!res.ok) throw new Error('Failed to fetch meals');
  return res.json();
}

export async function createMeal(telegramId: number, name: string, calories?: number | null, notes?: string) {
  const res = await fetch(`${API_BASE}/api/meals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ telegram_id: telegramId, name, calories: calories || null, notes }),
  });
  if (!res.ok) throw new Error('Failed to create meal');
  return res.json();
}

export async function updateMeal(id: number, telegramId: number, updates: { name?: string; calories?: number | null; notes?: string }) {
  const res = await fetch(`${API_BASE}/api/meals/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...updates, telegram_id: telegramId }),
  });
  if (!res.ok) throw new Error('Failed to update meal');
  return res.json();
}

export async function deleteMeal(id: number, telegramId: number) {
  const res = await fetch(`${API_BASE}/api/meals/${id}?telegram_id=${telegramId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete meal');
}

export async function registerExpoToken(telegramId: number, expoToken: string) {
  await fetch(`${API_BASE}/api/users/expo-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ telegram_id: telegramId, expo_token: expoToken }),
  });
}

export async function fetchDashboard() {
  const res = await fetch(`${API_BASE}/api/analytics/dashboard`);
  if (!res.ok) throw new Error('Failed to fetch dashboard');
  return res.json();
}
