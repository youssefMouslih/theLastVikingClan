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

// Avatar upload. Bucket: avatars (private per 0002). Path: avatars/{userId}/avatar.ext
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

export const storageService = { uploadMatchEvidence, getEvidenceSignedUrl, uploadAvatar, getAvatarUrl, uploadBanner, getBannerUrl, client: supabase };
