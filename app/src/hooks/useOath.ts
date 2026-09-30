import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';

// Viking's Oath acceptance: one tap writes the timestamp to own profile.
export function useOath() {
  const profile = useAuthStore((s) => s.profile);
  const init = useAuthStore((s) => s.init);
  const sworn = !!profile?.oath_accepted_at;

  async function swear(): Promise<void> {
    if (!profile) throw new Error('Not logged in.');
    const { error } = await supabase
      .from('profiles')
      .update({ oath_accepted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', profile.id);
    if (error) throw new Error(error.message);
    await init();
  }

  return { sworn, swear };
}
