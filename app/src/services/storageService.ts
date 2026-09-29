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

export const storageService = { uploadMatchEvidence, getEvidenceSignedUrl, client: supabase };
