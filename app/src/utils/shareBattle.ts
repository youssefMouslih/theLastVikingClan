// Shareable battle poster (WhatsApp-ready PNG, generated on-device).
// 1080x1080, clan emblem, challenger vs opponent, battle type.

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export async function battlePoster(args: {
  challenger: string;
  opponent: string;
  typeLabel: string;
  forced?: boolean;
}): Promise<File> {
  const W = 1080;
  const H = 1080;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // Background + diagonal stripes
  ctx.fillStyle = '#0f0f23';
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(W / 2, H * 0.32);
  ctx.rotate(-0.35);
  ctx.fillStyle = '#ffe500';
  for (let x = -900; x < 900; x += 260) ctx.fillRect(x, -260, 90, 520);
  ctx.fillStyle = '#2540ff';
  for (let x = -810; x < 900; x += 260) ctx.fillRect(x, -260, 150, 520);
  ctx.restore();
  const shade = ctx.createLinearGradient(0, 0, 0, H);
  shade.addColorStop(0, 'rgba(15,15,35,0.25)');
  shade.addColorStop(0.55, 'rgba(15,15,35,0.88)');
  shade.addColorStop(1, '#0f0f23');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, W, H);

  // Emblem
  try {
    const logo = await loadImg('/logo.png');
    ctx.drawImage(logo, W / 2 - 130, 120, 260, 260);
  } catch { /* emblem optional */ }

  ctx.textAlign = 'center';
  ctx.fillStyle = '#a78bfa';
  ctx.font = '700 34px "Chakra Petch", sans-serif';
  ctx.fillText('THE LAST VIKING', W / 2, 440);

  ctx.fillStyle = '#ffffff';
  ctx.font = '64px "Russo One", sans-serif';
  const top = args.challenger.toUpperCase().slice(0, 18);
  ctx.fillText(top, W / 2, 540);
  ctx.fillStyle = '#f43f5e';
  ctx.font = '700 40px "Chakra Petch", sans-serif';
  ctx.fillText(args.forced ? '⚔ MUST ANSWER ⚔' : 'CALLS UPON', W / 2, 610);
  ctx.fillStyle = '#ffffff';
  ctx.font = '64px "Russo One", sans-serif';
  ctx.fillText(args.opponent.toUpperCase().slice(0, 18), W / 2, 690);

  ctx.fillStyle = '#e2e8f0';
  ctx.font = '600 38px "Chakra Petch", sans-serif';
  ctx.fillText(args.typeLabel.slice(0, 40), W / 2, 800);

  ctx.fillStyle = 'rgba(226,232,240,0.6)';
  ctx.font = '500 30px "Chakra Petch", sans-serif';
  ctx.fillText('VIK CLAN • eFOOTBALL', W / 2, 990);

  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
  if (!blob) throw new Error('Render failed.');
  return new File([blob], 'vik-battle.png', { type: 'image/png' });
}

export async function shareFile(file: File, text: string): Promise<'shared' | 'downloaded'> {
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: 'VIK Clan Battle', text });
    return 'shared';
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return 'downloaded';
}

// Profile card poster: avatar, name, W/D/L, win rate, division, clan emblem.
export async function profilePoster(args: {
  name: string;
  wins: number;
  draws: number;
  losses: number;
  winRate: number;
  division: string | null;
  titles: number;
  avatarUrl: string | null;
}): Promise<File> {
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#12121f';
  ctx.fillRect(0, 0, W, H);

  // Banner stripes
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, 300);
  ctx.clip();
  ctx.translate(0, 0);
  ctx.rotate(-0.12);
  ctx.fillStyle = '#ffe500';
  for (let x = -300; x < 1400; x += 300) ctx.fillRect(x, -200, 100, 700);
  ctx.fillStyle = '#2540ff';
  for (let x = -200; x < 1400; x += 300) ctx.fillRect(x, -200, 170, 700);
  ctx.restore();
  const shade = ctx.createLinearGradient(0, 0, 0, 420);
  shade.addColorStop(0, 'rgba(18,18,31,0.15)');
  shade.addColorStop(1, 'rgba(18,18,31,0.92)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, W, 420);

  // Clan emblem
  try {
    const logo = await loadImg('/logo.png');
    ctx.drawImage(logo, W / 2 - 90, 40, 180, 180);
  } catch { /* optional */ }

  // Avatar
  const ax = 140;
  const ay = 300;
  ctx.save();
  ctx.beginPath();
  ctx.arc(ax, ay + 80, 80, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#27273b';
  ctx.fillRect(ax - 80, ay, 160, 160);
  if (args.avatarUrl) {
    try {
      const av = await loadImg(args.avatarUrl);
      const s = Math.max(160 / av.width, 160 / av.height);
      ctx.drawImage(av, ax - (av.width * s) / 2, ay + 80 - (av.height * s) / 2, av.width * s, av.height * s);
    } catch { /* fallback initial */ }
  }
  if (!args.avatarUrl) {
    ctx.fillStyle = '#a78bfa';
    ctx.font = '90px "Russo One", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(args.name.slice(0, 1).toUpperCase(), ax, ay + 110);
  }
  ctx.restore();
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath();
  ctx.arc(ax, ay + 80, 80, 0, Math.PI * 2);
  ctx.stroke();

  // Name + division
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = '64px "Russo One", sans-serif';
  ctx.fillText(args.name.slice(0, 16).toUpperCase(), 260, ay + 70);
  ctx.fillStyle = '#eab308';
  ctx.font = '700 34px "Chakra Petch", sans-serif';
  ctx.fillText(args.division ?? 'VIK CLAN', 260, ay + 120);

  // W/D/L bar
  const total = args.wins + args.draws + args.losses || 1;
  const bx = 90;
  const bw = W - 180;
  const by = 560;
  const bh = 64;
  ctx.fillStyle = '#22c55e';
  ctx.fillRect(bx, by, (bw * args.wins) / total, bh);
  ctx.fillStyle = '#71717a';
  ctx.fillRect(bx + (bw * args.wins) / total, by, (bw * args.draws) / total, bh);
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(bx + (bw * (args.wins + args.draws)) / total, by, (bw * args.losses) / total, bh);
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 40px "Chakra Petch", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${args.wins}W  •  ${args.draws}D  •  ${args.losses}L`, W / 2, by + bh + 70);
  ctx.fillStyle = '#f43f5e';
  ctx.font = '90px "Russo One", sans-serif';
  ctx.fillText(`${args.winRate}%`, W / 2, by + bh + 190);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '500 32px "Chakra Petch", sans-serif';
  ctx.fillText(`WIN RATE  •  ${args.titles} TITLES`, W / 2, by + bh + 245);

  ctx.fillStyle = 'rgba(226,232,240,0.6)';
  ctx.font = '500 30px "Chakra Petch", sans-serif';
  ctx.fillText('THE LAST VIKING • eFOOTBALL CLAN', W / 2, H - 80);

  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
  if (!blob) throw new Error('Render failed.');
  return new File([blob], 'vik-profile.png', { type: 'image/png' });
}
