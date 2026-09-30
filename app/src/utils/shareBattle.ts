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
