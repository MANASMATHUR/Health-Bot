import { useState, useEffect, useCallback } from 'react';
import { supabase, fetchMeals } from '../lib/api';

export interface Meal {
  id: number;
  telegram_id: number;
  name: string;
  calories: number | null;
  notes: string | null;
  logged_at: string;
  updated_at: string;
}

export function useMeals(telegramId: number | null) {
  const [meals, setMeals]     = useState<Meal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!telegramId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchMeals(telegramId);
      setMeals(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [telegramId]);

  // Initial load
  useEffect(() => {
    load();
  }, [load]);

  // Realtime subscription
  useEffect(() => {
    if (!telegramId) return;

    const channel = supabase
      .channel(`meals:${telegramId}`)
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'meals',
          filter: `telegram_id=eq.${telegramId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setMeals((prev) => [payload.new as Meal, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setMeals((prev) =>
              prev.map((m) => (m.id === (payload.new as Meal).id ? (payload.new as Meal) : m))
            );
          } else if (payload.eventType === 'DELETE') {
            setMeals((prev) => prev.filter((m) => m.id !== (payload.old as Meal).id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [telegramId]);

  return { meals, loading, error, reload: load };
}
