import { supabase } from '../lib/supabase';

// Match evidence upload (§38, §91-93). Bucket: match-evidence (private).
// Path: match-evidence/{competition_id}/{match_id}/{timestamp}_{userId}.ext
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
const MAX_BYTES = 10 * 1024 * 1024;

export async function uploadMatchEvidence(
  file: File,
  competitionId: string,
  matchId: string,
  userId: string,
): Promise<string> {
  if (!ALLOWED.includes(file.type)) throw new Error('Screenshot must be JPG, PNG or WEBP.');
  if (file.size > MAX_BYTES) throw new Error('Screenshot must be under 10 MB.');
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'webp';
  const path = `${competitionId}/${matchId}/${Date.now()}_${userId}.${ext}`;
  const { error: upErr } = await supabase.storage.from('match-evidence').upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
  const { error: dbErr } = await supabase.from('match_evidence').insert({
    match_id: matchId,
    file_path: path,
    file_type: file.type,
    file_size: file.size,
    uploaded_by: userId,
  });
  if (dbErr) throw new Error(dbErr.message);
  return path;
}

export async function getEvidenceSignedUrl(filePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from('match-evidence').createSignedUrl(filePath, 3600);
  if (error) return null;
  return data.signedUrl;
}

// Battle evidence screenshot. Bucket: match-evidence (private).
// Path: battles/{battle_id}/{timestamp}_{userId}.ext
export async function uploadBattleEvidence(file: File, battleId: string, userId: string): Promise<string> {
  if (!ALLOWED.includes(file.type)) throw new Error('Screenshot must be JPG, PNG or WEBP.');
  if (file.size > MAX_BYTES) throw new Error('Screenshot must be under 10 MB.');
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'webp';
  const path = `battles/${battleId}/${Date.now()}_${userId}.${ext}`;
  const { error } = await supabase.storage.from('match-evidence').upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  return path;
}

export async function getBattleEvidenceUrl(filePath: string | null): Promise<string | null> {
  if (!filePath) return null;
  const { data, error } = await supabase.storage.from('match-evidence').createSignedUrl(filePath, 3600);
  if (error) return null;
  return data.signedUrl;
}
export async function uploadAvatar(file: File, userId: string): Promise<string> {
  if (!ALLOWED.includes(file.type)) throw new Error('Avatar must be JPG, PNG or WEBP.');
  if (file.size > 5 * 1024 * 1024) throw new Error('Avatar must be under 5 MB.');
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'webp';
  const path = `${userId}/avatar.${ext}`;
  const { error } = await supabase.storage.from('avatars').upload(path, file, {
    contentType: file.type,
    upsert: true,
  });
  if (error) throw new Error(`Avatar upload failed: ${error.message}`);
  return path;
}

export async function getAvatarUrl(filePath: string | null): Promise<string | null> {
  if (!filePath) return null;
  const { data, error } = await supabase.storage.from('avatars').createSignedUrl(filePath, 7 * 24 * 3600);
  if (error) return null;
  return data.signedUrl;
}

// Profile banner image. Same bucket, separate path so avatar stays intact.
export async function uploadBanner(file: File, userId: string): Promise<string> {
  if (!ALLOWED.includes(file.type)) throw new Error('Banner must be JPG, PNG or WEBP.');
  if (file.size > 5 * 1024 * 1024) throw new Error('Banner must be under 5 MB.');
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'webp';
  const path = `${userId}/banner.${ext}`;
  const { error } = await supabase.storage.from('avatars').upload(path, file, {
    contentType: file.type,
    upsert: true,
  });
  if (error) throw new Error(`Banner upload failed: ${error.message}`);
  return path;
}

export async function getBannerUrl(filePath: string | null): Promise<string | null> {
  if (!filePath) return null;
  const { data, error } = await supabase.storage.from('avatars').createSignedUrl(filePath, 7 * 24 * 3600);
  if (error) return null;
  return data.signedUrl;
}

// Forged badge PNG. Bucket: clan-assets (private). Path: badges/{file}.
export async function uploadBadgeImage(file: File | Blob, fileName: string): Promise<string> {
  const path = `badges/${fileName}`;
  const { error } = await supabase.storage.from('clan-assets').upload(path, file, {
    contentType: 'image/png',
    upsert: false,
  });
  if (error) throw new Error(`Badge upload failed: ${error.message}`);
  return path;
}

export async function getBadgeImageUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const { data, error } = await supabase.storage.from('clan-assets').createSignedUrl(path, 7 * 24 * 3600);
  if (error) return null;
  return data.signedUrl;
}

// Delete a single stored file (best-effort: missing bucket/policy never throws).
export async function deleteStoredFile(bucket: 'avatars' | 'match-evidence' | 'clan-assets', path: string): Promise<void> {
  try {
    await supabase.storage.from(bucket).remove([path]);
  } catch (e) {
    console.warn('storage delete skipped:', e instanceof Error ? e.message : e);
  }
}

// Free storage: delete evidence of matches that have been final
// (CONFIRMED/FORFEIT/CANCELLED) for over 24h. Scores stay forever.
export async function purgeCompletedEvidence(competitionId: string): Promise<number> {
  const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: matches, error } = await supabase
    .from('matches')
    .select('id')
    .eq('competition_id', competitionId)
    .in('status', ['CONFIRMED', 'FORFEIT', 'CANCELLED'])
    .lt('updated_at', cutoff);
  if (error) throw new Error(error.message);
  const ids = ((matches ?? []) as { id: string }[]).map((m) => m.id);
  if (ids.length === 0) return 0;
  const { data: rows } = await supabase.from('match_evidence').select('id,file_path').in('match_id', ids);
  const list = (rows ?? []) as { id: string; file_path: string }[];
  for (const r of list) {
    await deleteStoredFile('match-evidence', r.file_path);
  }
  if (list.length > 0) {
    await supabase.from('match_evidence').delete().in('id', list.map((r) => r.id));
  }
  return list.length;
}

export const storageService = { uploadMatchEvidence, getEvidenceSignedUrl, uploadBattleEvidence, getBattleEvidenceUrl, uploadAvatar, getAvatarUrl, uploadBanner, getBannerUrl, uploadBadgeImage, getBadgeImageUrl, deleteStoredFile, purgeCompletedEvidence, client: supabase };
