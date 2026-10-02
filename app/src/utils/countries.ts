// ISO country list + flag helpers. Stored value is the 2-letter code;
// legacy free-text names resolve best-effort.

const ENTRIES: [string, string][] = [
  ['AF', 'Afghanistan'], ['AL', 'Albania'], ['DZ', 'Algeria'], ['AD', 'Andorra'],
  ['AO', 'Angola'], ['AG', 'Antigua and Barbuda'], ['AR', 'Argentina'], ['AM', 'Armenia'],
  ['AU', 'Australia'], ['AT', 'Austria'], ['AZ', 'Azerbaijan'], ['BS', 'Bahamas'],
  ['BH', 'Bahrain'], ['BD', 'Bangladesh'], ['BB', 'Barbados'], ['BY', 'Belarus'],
  ['BE', 'Belgium'], ['BZ', 'Belize'], ['BJ', 'Benin'], ['BT', 'Bhutan'],
  ['BO', 'Bolivia'], ['BA', 'Bosnia and Herzegovina'], ['BW', 'Botswana'], ['BR', 'Brazil'],
  ['BN', 'Brunei'], ['BG', 'Bulgaria'], ['BF', 'Burkina Faso'], ['BI', 'Burundi'],
  ['KH', 'Cambodia'], ['CM', 'Cameroon'], ['CA', 'Canada'], ['CV', 'Cape Verde'],
  ['CF', 'Central African Republic'], ['TD', 'Chad'], ['CL', 'Chile'], ['CN', 'China'],
  ['CO', 'Colombia'], ['KM', 'Comoros'], ['CG', 'Congo'], ['CD', 'DR Congo'],
  ['CR', 'Costa Rica'], ['CI', "Côte d'Ivoire"], ['HR', 'Croatia'], ['CU', 'Cuba'],
  ['CY', 'Cyprus'], ['CZ', 'Czechia'], ['DK', 'Denmark'], ['DJ', 'Djibouti'],
  ['DM', 'Dominica'], ['DO', 'Dominican Republic'], ['EC', 'Ecuador'], ['EG', 'Egypt'],
  ['SV', 'El Salvador'], ['GQ', 'Equatorial Guinea'], ['ER', 'Eritrea'], ['EE', 'Estonia'],
  ['SZ', 'Eswatini'], ['ET', 'Ethiopia'], ['FJ', 'Fiji'], ['FI', 'Finland'],
  ['FR', 'France'], ['GA', 'Gabon'], ['GM', 'Gambia'], ['GE', 'Georgia'],
  ['DE', 'Germany'], ['GH', 'Ghana'], ['GR', 'Greece'], ['GD', 'Grenada'],
  ['GT', 'Guatemala'], ['GN', 'Guinea'], ['GW', 'Guinea-Bissau'], ['GY', 'Guyana'],
  ['HT', 'Haiti'], ['HN', 'Honduras'], ['HU', 'Hungary'], ['IS', 'Iceland'],
  ['IN', 'India'], ['ID', 'Indonesia'], ['IR', 'Iran'], ['IQ', 'Iraq'],
  ['IE', 'Ireland'], ['IT', 'Italy'], ['JM', 'Jamaica'], ['JP', 'Japan'],
  ['JO', 'Jordan'], ['KZ', 'Kazakhstan'], ['KE', 'Kenya'], ['KI', 'Kiribati'],
  ['KP', 'North Korea'], ['KR', 'South Korea'], ['KW', 'Kuwait'], ['KG', 'Kyrgyzstan'],
  ['LA', 'Laos'], ['LV', 'Latvia'], ['LB', 'Lebanon'], ['LS', 'Lesotho'],
  ['LR', 'Liberia'], ['LY', 'Libya'], ['LI', 'Liechtenstein'], ['LT', 'Lithuania'],
  ['LU', 'Luxembourg'], ['MG', 'Madagascar'], ['MW', 'Malawi'], ['MY', 'Malaysia'],
  ['MV', 'Maldives'], ['ML', 'Mali'], ['MT', 'Malta'], ['MH', 'Marshall Islands'],
  ['MR', 'Mauritania'], ['MU', 'Mauritius'], ['MX', 'Mexico'], ['FM', 'Micronesia'],
  ['MD', 'Moldova'], ['MC', 'Monaco'], ['MN', 'Mongolia'], ['ME', 'Montenegro'],
  ['MA', 'Morocco'], ['MZ', 'Mozambique'], ['MM', 'Myanmar'], ['NA', 'Namibia'],
  ['NR', 'Nauru'], ['NP', 'Nepal'], ['NL', 'Netherlands'], ['NZ', 'New Zealand'],
  ['NI', 'Nicaragua'], ['NE', 'Niger'], ['NG', 'Nigeria'], ['MK', 'North Macedonia'],
  ['NO', 'Norway'], ['OM', 'Oman'], ['PK', 'Pakistan'], ['PW', 'Palau'],
  ['PS', 'Palestine'], ['PA', 'Panama'], ['PG', 'Papua New Guinea'], ['PY', 'Paraguay'],
  ['PE', 'Peru'], ['PH', 'Philippines'], ['PL', 'Poland'], ['PT', 'Portugal'],
  ['QA', 'Qatar'], ['RO', 'Romania'], ['RU', 'Russia'], ['RW', 'Rwanda'],
  ['KN', 'Saint Kitts and Nevis'], ['LC', 'Saint Lucia'], ['VC', 'Saint Vincent and the Grenadines'],
  ['WS', 'Samoa'], ['SM', 'San Marino'], ['ST', 'Sao Tome and Principe'], ['SA', 'Saudi Arabia'],
  ['SN', 'Senegal'], ['RS', 'Serbia'], ['SC', 'Seychelles'], ['SL', 'Sierra Leone'],
  ['SG', 'Singapore'], ['SK', 'Slovakia'], ['SI', 'Slovenia'], ['SB', 'Solomon Islands'],
  ['SO', 'Somalia'], ['ZA', 'South Africa'], ['SS', 'South Sudan'], ['ES', 'Spain'],
  ['LK', 'Sri Lanka'], ['SD', 'Sudan'], ['SR', 'Suriname'], ['SE', 'Sweden'],
  ['CH', 'Switzerland'], ['SY', 'Syria'], ['TW', 'Taiwan'], ['TJ', 'Tajikistan'],
  ['TZ', 'Tanzania'], ['TH', 'Thailand'], ['TL', 'Timor-Leste'], ['TG', 'Togo'],
  ['TO', 'Tonga'], ['TT', 'Trinidad and Tobago'], ['TN', 'Tunisia'], ['TR', 'Turkey'],
  ['TM', 'Turkmenistan'], ['TV', 'Tuvalu'], ['UG', 'Uganda'], ['UA', 'Ukraine'],
  ['AE', 'United Arab Emirates'], ['GB', 'United Kingdom'], ['US', 'United States'],
  ['UY', 'Uruguay'], ['UZ', 'Uzbekistan'], ['VU', 'Vanuatu'], ['VA', 'Vatican City'],
  ['VE', 'Venezuela'], ['VN', 'Vietnam'], ['YE', 'Yemen'], ['ZM', 'Zambia'],
  ['ZW', 'Zimbabwe'],
];

export interface Country {
  code: string;
  name: string;
  flag: string;
}

export function flagFor(code: string): string {
  return String.fromCodePoint(...code.toUpperCase().split('').map((c) => 127397 + c.charCodeAt(0)));
}

export const COUNTRIES: Country[] = ENTRIES.map(([code, name]) => ({ code, name, flag: flagFor(code) }));

const BY_NAME = new Map(ENTRIES.map(([code, name]) => [name.toLowerCase(), code]));

// Resolve any stored value (code like "MA" or legacy name like "morocco").
export function parseCountry(value: string | null): Country | null {
  if (!value) return null;
  const v = value.trim();
  if (/^[A-Za-z]{2}$/.test(v)) {
    const code = v.toUpperCase();
    const found = ENTRIES.find(([c]) => c === code);
    if (found) return { code, name: found[1], flag: flagFor(code) };
    return null;
  }
  const code = BY_NAME.get(v.toLowerCase());
  if (!code) return { code: '', name: v, flag: '' };
  return { code, name: ENTRIES.find(([c]) => c === code)![1], flag: flagFor(code) };
}
