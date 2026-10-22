import type { Locale } from './dictionaries';

type Entry = readonly [fr: string, ar: string];

const exact: Record<string, Entry> = {
  'A comment is required to send a result back.': [
    'Un commentaire est requis pour renvoyer un résultat.',
    'يلزم تعليق لإعادة إرسال النتيجة.',
  ],
  'A draft season already exists. Resume it from the admin panel.': [
    'Une saison en brouillon existe déjà. Reprenez-la depuis le panneau admin.',
    'توجد مسودة موسم بالفعل. استأنفها من لوحة الإدارة.',
  ],
  'Already answered.': ['Déjà répondu.', 'تمت الإجابة بالفعل.'],
  'Already claimed.': ['Déjà réclamé.', 'تمت المطالبة بالفعل.'],
  'Already in this squad.': ['Déjà dans cette équipe.', 'موجود بالفعل في هذا الفريق.'],
  'Already taken.': ['Déjà pris.', 'محجوز بالفعل.'],
  'Ask between 5 and 500 GP.': ['Demandez entre 5 et 500 GP.', 'اطلب بين 5 و500 GP.'],
  'Avatar must be JPG, PNG or WEBP.': [
    "L’avatar doit être au format JPG, PNG ou WEBP.",
    'يجب أن تكون الصورة الرمزية بصيغة JPG أو PNG أو WEBP.',
  ],
  'Avatar must be under 5 MB.': [
    "L’avatar doit faire moins de 5 Mo.",
    'يجب أن تكون الصورة الرمزية أقل من 5 ميغابايت.',
  ],
  'Badge must be JPG, PNG or WEBP.': [
    "L’écusson doit être au format JPG, PNG ou WEBP.",
    'يجب أن تكون الشارة بصيغة JPG أو PNG أو WEBP.',
  ],
  'Badge must be under 5 MB.': [
    "L’écusson doit faire moins de 5 Mo.",
    'يجب أن تكون الشارة أقل من 5 ميغابايت.',
  ],
  'Badge render failed.': ["Échec du rendu de l’écusson.", 'فشل إنشاء الشارة.'],
  'Banner must be JPG, PNG or WEBP.': [
    'La bannière doit être au format JPG, PNG ou WEBP.',
    'يجب أن تكون اللافتة بصيغة JPG أو PNG أو WEBP.',
  ],
  'Banner must be under 5 MB.': [
    'La bannière doit faire moins de 5 Mo.',
    'يجب أن تكون اللافتة أقل من 5 ميغابايت.',
  ],
  'Cannot replace players in a finished competition.': [
    'Impossible de remplacer des joueurs dans une compétition terminée.',
    'لا يمكن استبدال اللاعبين في مسابقة منتهية.',
  ],
  'Challenge is not active.': ['Ce défi n’est pas actif.', 'هذا التحدي غير نشط.'],
  'Choose a clan member.': ['Choisissez un membre du clan.', 'اختر عضوًا من العشيرة.'],
  'Competition not found.': ['Compétition introuvable.', 'المسابقة غير موجودة.'],
  'Deadline passed. Contact an admin.': [
    'La date limite est dépassée. Contactez un administrateur.',
    'انتهت المهلة. تواصل مع أحد المشرفين.',
  ],
  'Diffusion returned no image.': ['La diffusion n’a renvoyé aucune image.', 'لم يُرجع النشر أي صورة.'],
  'Evidence must be JPG, PNG or WEBP.': [
    'La preuve doit être au format JPG, PNG ou WEBP.',
    'يجب أن يكون الدليل بصيغة JPG أو PNG أو WEBP.',
  ],
  'Evidence must be under 5 MB.': [
    'La preuve doit faire moins de 5 Mo.',
    'يجب أن يكون الدليل أقل من 5 ميغابايت.',
  ],
  'Fixtures already exist.': ['Le calendrier existe déjà.', 'الجدول موجود بالفعل.'],
  'Fixtures already exist. Delete matches before regenerating.': [
    'Le calendrier existe déjà. Supprimez les matchs avant de régénérer.',
    'الجدول موجود بالفعل. احذف المباريات قبل إعادة التوليد.',
  ],
  'Forfeit already claimed — awaiting moderator.': [
    'Forfait déjà réclamé — en attente d’un modérateur.',
    'تمت المطالبة بالانسحاب بالفعل — بانتظار المشرف.',
  ],
  'Forfeit claim pending moderator review.': [
    'Demande de forfait en attente de révision par un modérateur.',
    'طلب الانسحاب بانتظار مراجعة المشرف.',
  ],
  'Match not found for this dispute.': [
    'Match introuvable pour ce litige.',
    'المباراة غير موجودة لهذا النزاع.',
  ],
  'Maximum players must be >= minimum players.': [
    'Le maximum de joueurs doit être supérieur ou égal au minimum.',
    'يجب أن يكون الحد الأقصى للاعبين أكبر من أو يساوي الحد الأدنى.',
  ],
  'Members cannot be removed — use Suspended or Left instead.': [
    'Les membres ne peuvent pas être supprimés — utilisez Suspendu ou Parti.',
    'لا يمكن حذف الأعضاء — استخدم «موقوف» أو «غادر» بدلًا من ذلك.',
  ],
  'Name is required.': ['Le nom est requis.', 'الاسم مطلوب.'],
  'No pending deletion request.': ['Aucune demande de suppression en attente.', 'لا يوجد طلب حذف معلّق.'],
  'No submitted score to confirm.': ['Aucun score soumis à confirmer.', 'لا توجد نتيجة مرسلة للتأكيد.'],
  'Not logged in.': ['Vous n’êtes pas connecté.', 'لم تسجل الدخول.'],
  'Nothing to confirm.': ['Rien à confirmer.', 'لا شيء للتأكيد.'],
  'Nothing to send back.': ['Rien à renvoyer.', 'لا شيء لإعادته.'],
  'Notifications blocked.': ['Notifications bloquées.', 'الإشعارات محظورة.'],
  'Only Calls for a Head can be unrefusable.': [
    'Seuls les Appels à un Chef peuvent être irrefusables.',
    'فقط نداءات الزعيم يمكن أن تكون غير قابلة للرفض.',
  ],
  'Only friendlies can be open calls.': [
    'Seuls les matchs amicaux peuvent être des appels ouverts.',
    'المباريات الودية فقط يمكن أن تكون نداءات مفتوحة.',
  ],
  'Only moderators and admins can start rounds.': [
    'Seuls les modérateurs et administrateurs peuvent lancer les manches.',
    'يمكن للمشرفين والمديرين فقط بدء الجولات.',
  ],
  'Only participants can submit this result.': [
    'Seuls les participants peuvent soumettre ce résultat.',
    'يمكن للمشاركين فقط إرسال هذه النتيجة.',
  ],
  'Only the challenged player may answer.': [
    'Seul le joueur défié peut répondre.',
    'يمكن للاعب المتحدى فقط الرد.',
  ],
  'Only the opponent can claim forfeit.': [
    'Seul l’adversaire peut réclamer le forfait.',
    'يمكن للخصم فقط المطالبة بالانسحاب.',
  ],
  'Only the opponent can confirm.': [
    'Seul l’adversaire peut confirmer.',
    'يمكن للخصم فقط التأكيد.',
  ],
  'Only the owner can assign Admin roles or manage admins.': [
    'Seul le propriétaire peut attribuer le rôle Admin ou gérer les administrateurs.',
    'يمكن للمالك فقط منح دور المدير أو إدارة المديرين.',
  ],
  'Players cannot modify confirmed results (Rule 8).': [
    'Les joueurs ne peuvent pas modifier des résultats confirmés (Règle 8).',
    'لا يمكن للاعبين تعديل النتائج المؤكدة (القاعدة 8).',
  ],
  'Quest not complete yet.': ['Quête pas encore terminée.', 'المهمة لم تكتمل بعد.'],
  'Render failed.': ['Échec du rendu.', 'فشل العرض.'],
  'Scores must be whole numbers >= 0.': [
    'Les scores doivent être des nombres entiers supérieurs ou égaux à 0.',
    'يجب أن تكون النتائج أعدادًا صحيحة أكبر من أو تساوي 0.',
  ],
  'Scores required.': ['Scores requis.', 'النتائج مطلوبة.'],
  'Screenshot evidence is required — no photo, no result.': [
    'Une capture d’écran est requise — pas de photo, pas de résultat.',
    'يلزم دليل لقطة الشاشة — لا صورة، لا نتيجة.',
  ],
  'Screenshot must be JPG, PNG or WEBP.': [
    'La capture d’écran doit être au format JPG, PNG ou WEBP.',
    'يجب أن تكون لقطة الشاشة بصيغة JPG أو PNG أو WEBP.',
  ],
  'Screenshot must be under 10 MB.': [
    'La capture d’écran doit faire moins de 10 Mo.',
    'يجب أن تكون لقطة الشاشة أقل من 10 ميغابايت.',
  ],
  'Squad logo must be JPG, PNG or WEBP.': [
    'Le logo de l’équipe doit être au format JPG, PNG ou WEBP.',
    'يجب أن يكون شعار الفريق بصيغة JPG أو PNG أو WEBP.',
  ],
  'Squad logo must be under 2 MB.': [
    'Le logo de l’équipe doit faire moins de 2 Mo.',
    'يجب أن يكون شعار الفريق أقل من 2 ميغابايت.',
  ],
  'Squad needs a name.': ['L’équipe a besoin d’un nom.', 'يحتاج الفريق إلى اسم.'],
  'That is your own call.': ['C’est votre propre appel.', 'هذا نداؤك أنت.'],
  'The owner keeps their position — this role cannot be changed.': [
    'Le propriétaire conserve sa position — ce rôle ne peut pas être modifié.',
    'يحتفظ المالك بمنصبه — لا يمكن تغيير هذا الدور.',
  ],
  'The owner role cannot be granted.': [
    'Le rôle de propriétaire ne peut pas être attribué.',
    'لا يمكن منح دور المالك.',
  ],
  'The submitter cannot claim forfeit — opponent must confirm.': [
    'Le soumetteur ne peut pas réclamer le forfait — l’adversaire doit confirmer.',
    'لا يمكن للمرسل المطالبة بالانسحاب — يجب أن يؤكد الخصم.',
  ],
  'The submitter cannot confirm their own result — opponent must confirm.': [
    'Le soumetteur ne peut pas confirmer son propre résultat — l’adversaire doit confirmer.',
    'لا يمكن للمرسل تأكيد نتيجته — يجب أن يؤكد الخصم.',
  ],
  'The submitter cannot confirm — the other warrior must.': [
    'Le soumetteur ne peut pas confirmer — l’autre guerrier doit le faire.',
    'لا يمكن للمرسل التأكيد — يجب أن يؤكد المحارب الآخر.',
  ],
  'The throne is vacant - ask an admin to crown a champion.': [
    'Le trône est vacant — demandez à un administrateur de couronner un champion.',
    'العرش شاغر — اطلب من مشرف تتويج بطل.',
  ],
  'Throne battles must be Honor Duels.': [
    'Les batailles pour le trône doivent être des Duels d’honneur.',
    'معارك العرش يجب أن تكون مبارزات شرف.',
  ],
  'Unrefusable calls require holding 100 GP.': [
    'Les appels irrefusables nécessitent 100 GP.',
    'النداءات غير القابلة للرفض تتطلب امتلاك 100 GP.',
  ],
  'Unrefusable calls target a clan member.': [
    'Les appels irrefusables ciblent un membre du clan.',
    'النداءات غير القابلة للرفض تستهدف عضوًا من العشيرة.',
  ],
  'V1 supports max 32 players.': ['La V1 prend en charge 32 joueurs maximum.', 'يدعم الإصدار الأول 32 لاعبًا كحد أقصى.'],
  'VAPID key missing.': ['Clé VAPID manquante.', 'مفتاح VAPID مفقود.'],
  'You already have an active throne challenge — resolve it first.': [
    'Vous avez déjà un défi pour le trône actif — réglez-le d’abord.',
    'لديك تحدٍ نشط على العرش — قم بحلّه أولًا.',
  ],
  'You are already on the waitlist.': [
    'Vous êtes déjà sur la liste d’attente.',
    'أنت بالفعل على قائمة الانتظار.',
  ],
  'You can only rate warriors you have faced in a confirmed match or battle.': [
    'Vous ne pouvez noter que les guerriers affrontés lors d’un match ou d’une bataille confirmés.',
    'يمكنك تقييم المحاربين الذين واجهتهم فقط في مباراة أو معركة مؤكدة.',
  ],
  'You cannot ask yourself.': ['Vous ne pouvez pas vous demander.', 'لا يمكنك أن تطلب من نفسك.'],
  'You cannot challenge yourself.': ['Vous ne pouvez pas vous défier.', 'لا يمكنك تحدي نفسك.'],
  'You cannot change your own role or status.': [
    'Vous ne pouvez pas modifier votre propre rôle ou statut.',
    'لا يمكنك تغيير دورك أو حالتك بنفسك.',
  ],
  'You cannot rate yourself.': ['Vous ne pouvez pas vous noter.', 'لا يمكنك تقييم نفسك.'],
  'You must be signed in to upload a squad logo.': [
    'Vous devez être connecté pour téléverser un logo d’équipe.',
    'يجب تسجيل الدخول لرفع شعار الفريق.',
  ],
  'A different admin must approve — you requested this deletion.': [
    'Un autre administrateur doit approuver — vous avez demandé cette suppression.',
    'يجب أن يوافق مشرف آخر — أنت من طلب هذا الحذف.',
  ],
  'Invalid login credentials': [
    'Identifiants de connexion invalides.',
    'بيانات تسجيل الدخول غير صحيحة.',
  ],
  'Email not confirmed': [
    'Adresse e-mail non confirmée.',
    'لم يتم تأكيد البريد الإلكتروني.',
  ],
  'User already registered': [
    'Cet utilisateur est déjà inscrit.',
    'هذا المستخدم مسجل بالفعل.',
  ],
  'Password should be at least 6 characters': [
    'Le mot de passe doit contenir au moins 6 caractères.',
    'يجب أن تتكون كلمة المرور من 6 أحرف على الأقل.',
  ],
  'New password should be different from the old password.': [
    "Le nouveau mot de passe doit être différent de l’ancien.",
    'يجب أن تكون كلمة المرور الجديدة مختلفة عن القديمة.',
  ],
  'Sign in to open a dispute.': [
    'Connectez-vous pour ouvrir un litige.',
    'سجّل الدخول لفتح اعتراض.',
  ],
  'Only active members can open a dispute.': [
    'Seuls les membres actifs peuvent ouvrir un litige.',
    'يمكن للأعضاء النشطين فقط فتح اعتراض.',
  ],
  'Only the two match players can open a dispute.': [
    'Seuls les deux joueurs du match peuvent ouvrir un litige.',
    'يمكن لاعبي المباراة فقط فتح اعتراض.',
  ],
  'A dispute can only be opened while a result is waiting for confirmation.': [
    'Un litige ne peut être ouvert que tant qu’un résultat attend confirmation.',
    'لا يمكن فتح اعتراض إلا أثناء انتظار تأكيد النتيجة.',
  ],
  'Give a reason between 3 and 1000 characters.': [
    'Indiquez un motif de 3 à 1000 caractères.',
    'اذكر سببًا من 3 إلى 1000 حرف.',
  ],
  'Dispute description is too long.': [
    'La description du litige est trop longue.',
    'وصف الاعتراض طويل جدًا.',
  ],
  'This match already has an open dispute. Staff must resolve it first.': [
    'Ce match a déjà un litige ouvert. Le staff doit d’abord le résoudre.',
    'هذه المباراة لديها اعتراض مفتوح بالفعل. يجب على staff حله أولاً.',
  ],
  'Email rate limit exceeded': [
    'Trop de tentatives. Réessayez plus tard.',
    'تم تجاوز حد المحاولات. حاول لاحقًا.',
  ],
  'Signups not allowed for this instance': [
    'Les inscriptions sont désactivées.',
    'التسجيل غير مسموح في هذه النسخة.',
  ],
  'Unable to validate email address: invalid format': [
    'Adresse e-mail invalide.',
    'عنوان البريد الإلكتروني غير صالح.',
  ],
  'Auth session missing!': [
    'Session expirée. Reconnectez-vous.',
    'انتهت الجلسة. سجّل الدخول مجددًا.',
  ],
};

const patterns: { re: RegExp; fr: (m: RegExpMatchArray) => string; ar: (m: RegExpMatchArray) => string }[] = [
  {
    re: /^A (\d+)v(\d+) squad holds (\d+) invited warriors plus you\.$/,
    fr: (m) => `Une équipe ${m[1]}v${m[2]} accueille ${m[3]} guerriers invités en plus de vous.`,
    ar: (m) => `فريق ${m[1]} ضد ${m[2]} يضم ${m[3]} محاربًا مدعوًا بالإضافة إليك.`,
  },
  {
    re: /^(\w+) must be 1–5\.$/,
    fr: (m) => `${m[1]} doit être compris entre 1 et 5.`,
    ar: (m) => `يجب أن يكون ${m[1]} بين 1 و5.`,
  },
  {
    re: /^Diffusion HTTP (\d+)\.$/,
    fr: (m) => `Diffusion HTTP ${m[1]}.`,
    ar: (m) => `فشل النشر (HTTP ${m[1]}).`,
  },
  {
    re: /^Knockout needs 4, 8 or 16 players \(§55\)\. Got (\d+)\.$/,
    fr: (m) => `Le tableau à élimination directe nécessite 4, 8 ou 16 joueurs (§55). Reçu : ${m[1]}.`,
    ar: (m) => `يتطلب خروج المغلوب 4 أو 8 أو 16 لاعبًا (§55). العدد الحالي: ${m[1]}.`,
  },
  {
    re: /^Locked after start \(§113\): (.+)\. Confirm override to change\.$/,
    fr: (m) => `Verrouillé après le début (§113) : ${m[1]}. Confirmez le forçage pour modifier.`,
    ar: (m) => `مقفل بعد البدء (§113): ${m[1]}. أكّد التجاوز للتغيير.`,
  },
  {
    re: /^Not enough players: (\d+) \/ (\d+) minimum\.( Extend registration or cancel \(§27\)\.)?$/,
    fr: (m) =>
      `Pas assez de joueurs : ${m[1]} / ${m[2]} minimum.${m[3] ? ' Prolongez les inscriptions ou annulez (§27).' : ''}`,
    ar: (m) =>
      `عدد اللاعبين غير كافٍ: ${m[1]} / ${m[2]} كحد أدنى.${m[3] ? ' مدّد التسجيل أو ألغِ المسابقة (§27).' : ''}`,
  },
  {
    re: /^Round (\d+) has not started yet\.$/,
    fr: (m) => `La manche ${m[1]} n’a pas encore commencé.`,
    ar: (m) => `الجولة ${m[1]} لم تبدأ بعد.`,
  },
  {
    re: /^V1 supports bracket sizes 4\/8\/16, got (\d+)$/,
    fr: (m) => `La V1 prend en charge des tableaux de 4/8/16 joueurs, reçu : ${m[1]}.`,
    ar: (m) => `يدعم الإصدار الأول جداول من 4/8/16 لاعبًا، العدد الحالي: ${m[1]}.`,
  },
  {
    re: /row-level security/i,
    fr: () => 'Vous n’avez pas l’autorisation d’effectuer cette action.',
    ar: () => 'ليس لديك إذن لتنفيذ هذا الإجراء.',
  },
  {
    re: /duplicate key value violates unique constraint/i,
    fr: () => 'Cet élément existe déjà.',
    ar: () => 'هذا العنصر موجود بالفعل.',
  },
  {
    re: /^(Avatar|Badge|Banner|Evidence|Logo|Squad logo|Screenshot|Upload) upload failed: (.+)$/,
    fr: (m) => `Échec du téléversement (${m[1]}) : ${m[2]}`,
    ar: (m) => `فشل رفع ${m[1]}: ${m[2]}`,
  },
];

export function translateError(error: unknown, locale: Locale): string | null {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : error && typeof error === 'object' && 'message' in error
          ? String((error as { message: unknown }).message)
          : '';
  if (!raw) return null;
  if (locale === 'en') return raw;
  const entry = exact[raw];
  if (entry) return locale === 'fr' ? entry[0] : entry[1];
  for (const pattern of patterns) {
    const match = raw.match(pattern.re);
    if (match) return locale === 'fr' ? pattern.fr(match) : pattern.ar(match);
  }
  return raw;
}
