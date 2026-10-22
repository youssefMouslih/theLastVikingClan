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

// League duel evidence. Bucket: match-evidence (private).
// Path must stay league/{season}/{fixture}/{duel}/{player}-{file}; 0041 validates it.
const LEAGUE_ALLOWED = ['image/jpeg', 'image/png', 'image/webp'] as const;
const LEAGUE_MAX_BYTES = 5 * 1024 * 1024;
const LEAGUE_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export async function uploadLeagueEvidence(
  file: File,
  seasonId: string,
  fixtureId: string,
  duelId: string,
  playerId: string,
): Promise<string> {
  const type = file.type.toLowerCase();
  if (!LEAGUE_ALLOWED.includes(type as (typeof LEAGUE_ALLOWED)[number])) {
    throw new Error('Evidence must be JPG, PNG or WEBP.');
  }
  if (file.size > LEAGUE_MAX_BYTES) throw new Error('Evidence must be under 5 MB.');
  const ext = LEAGUE_EXT[type];
  const path = `league/${seasonId}/${fixtureId}/${duelId}/${playerId}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('match-evidence').upload(path, file, {
    contentType: type,
    upsert: false,
  });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  return path;
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

// Badge template per honour type. Bucket: clan-assets (private).
// Path: badge-templates/{TYPE}.png — fixed path + upsert, so re-uploading
// replaces the picture for every award of that type, past and future.
export function badgeTemplatePath(type: string): string {
  return `badge-templates/${type}.png`;
}

export async function uploadBadgeTemplate(type: string, file: File | Blob): Promise<string> {
  if (file instanceof File && !ALLOWED.includes(file.type)) throw new Error('Badge must be JPG, PNG or WEBP.');
  if (file.size > 5 * 1024 * 1024) throw new Error('Badge must be under 5 MB.');
  const path = badgeTemplatePath(type);
  const { error } = await supabase.storage.from('clan-assets').upload(path, file, {
    contentType: 'image/png',
    upsert: true,
  });
  if (error) throw new Error(`Badge upload failed: ${error.message}`);
  return path;
}

export async function getBadgeTemplateUrl(type: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from('clan-assets').createSignedUrl(badgeTemplatePath(type), 7 * 24 * 3600);
  if (error) return null;
  return data.signedUrl;
}

// Forged badge PNG. Bucket: clan-assets (private). Path: badges/{file}.
export async function uploadBadgeImage(file: File | Blob, fileName: string): Promise<string> {
  const path = `badges/${fileName}`;
  const contentType = file instanceof File && ALLOWED.includes(file.type) ? file.type : 'image/png';
  const { error } = await supabase.storage.from('clan-assets').upload(path, file, {
    contentType,
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

// 4vs4 squad logo. Bucket: league-assets (private).
// Path: league/{team_id}/logo-{timestamp}.{ext}; 0045 validates it.
const LEAGUE_LOGO_ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
const LEAGUE_LOGO_MAX_BYTES = 2 * 1024 * 1024;
const LEAGUE_LOGO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export async function uploadLeagueTeamLogo(file: File, teamId: string): Promise<string> {
  if (!LEAGUE_LOGO_ALLOWED.includes(file.type)) throw new Error('Squad logo must be JPG, PNG or WEBP.');
  if (file.size > LEAGUE_LOGO_MAX_BYTES) throw new Error('Squad logo must be under 2 MB.');
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('You must be signed in to upload a squad logo.');
  const ext = LEAGUE_LOGO_EXT[file.type] ?? 'webp';
  const path = `league/${auth.user.id}/${teamId}/logo-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('league-assets').upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw new Error(`Logo upload failed: ${error.message}`);
  return path;
}

export async function getLeagueTeamLogoUrl(filePath: string | null): Promise<string | null> {
  if (!filePath) return null;
  const { data, error } = await supabase.storage.from('league-assets').createSignedUrl(filePath, 7 * 24 * 3600);
  if (error) return null;
  return data.signedUrl;
}

// Delete a single stored file (best-effort: missing bucket/policy never throws).
export async function deleteStoredFile(bucket: 'avatars' | 'match-evidence' | 'clan-assets' | 'league-assets', path: string): Promise<void> {
  try {
    await supabase.storage.from(bucket).remove([path]);
  } catch (e) {
    console.warn('storage delete skipped:', e instanceof Error ? e.message : e);
  }
}

// Delete match_evidence rows + storage files for the given matches.
// Scores stay forever — only the pictures go.
async function purgeEvidenceForMatchIds(matchIds: string[]): Promise<number> {
  if (matchIds.length === 0) return 0;
  const { data: rows } = await supabase.from('match_evidence').select('id,file_path').in('match_id', matchIds);
  const list = (rows ?? []) as { id: string; file_path: string }[];
  for (const r of list) {
    await deleteStoredFile('match-evidence', r.file_path);
  }
  if (list.length > 0) {
    await supabase.from('match_evidence').delete().in('id', list.map((r) => r.id));
  }
  return list.length;
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
  return purgeEvidenceForMatchIds(ids);
}

// Round purge: delete evidence of a finished round's matches (all final).
// Called automatically when a league round ends — no 24h wait, the round's
// pictures are done serving their purpose once every result is final.
export async function purgeRoundEvidence(competitionId: string, roundId: string): Promise<number> {
  const { data: matches, error } = await supabase
    .from('matches')
    .select('id')
    .eq('competition_id', competitionId)
    .eq('round_id', roundId)
    .in('status', ['CONFIRMED', 'FORFEIT', 'CANCELLED']);
  if (error) throw new Error(error.message);
  const ids = ((matches ?? []) as { id: string }[]).map((m) => m.id);
  return purgeEvidenceForMatchIds(ids);
}

export const storageService = { uploadMatchEvidence, getEvidenceSignedUrl, uploadBattleEvidence, getBattleEvidenceUrl, uploadLeagueEvidence, uploadAvatar, getAvatarUrl, uploadBanner, getBannerUrl, uploadBadgeImage, getBadgeImageUrl, badgeTemplatePath, uploadBadgeTemplate, getBadgeTemplateUrl, uploadLeagueTeamLogo, getLeagueTeamLogoUrl, deleteStoredFile, purgeCompletedEvidence, purgeRoundEvidence, client: supabase };
