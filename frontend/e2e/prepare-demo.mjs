// Prepares the DEMO database for the browser tests and screenshots.
// Run ONLY against a backend whose DATABASE_URL points at chlatvei_demo (see docs/frontend/README.md):
// it approves content as a demo admin through the real API. Never run it against real data.
// Khmer text comes from the Khmer evidence on the MPWT page (S001/S002); fee and location
// labels are short Khmer labels written for the demo.


const API = process.env.API_URL ?? 'http://localhost:3000/api';
const password = process.env.E2E_ADMIN_PASSWORD;
const email = process.env.E2E_ADMIN_EMAIL ?? 'demo-admin@chlatvei.local';
if (!password) throw new Error('Set E2E_ADMIN_PASSWORD');

async function call(method, path, body, token) {
  const res = await fetch(API + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = res.status === 204 ? null : await res.json();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(json)}`);
  return json;
}

const KHMER = {
  'National identity card': 'អត្តសញ្ញាណបណ្ណ',
  'Three 4x6 photos with white background': 'រូបថត ៤x៦ ចំនួន៣សន្លឹក (ផ្ទៃពណ៌ស)',
  'Physical fitness (medical) certificate': 'វិញ្ញាបនបត្របញ្ជាក់កាយសម្បទា',
  'Create an account on driverlicense.mpwt.gov.kh and activate it by e-mail': 'បង្កើតគណនីនៅ driverlicense.mpwt.gov.kh ហើយ Activate គណនីនៅក្នុង E-mail',
  'Submit the driving-test application in the online system': 'ចូលទៅក្នុងប្រព័ន្ធ ដើម្បីដាក់ពាក្យប្រឡង',
  'Pass the computer-based theory test, then the practical driving test': 'ប្រឡងទ្រឹស្តីតាមប្រព័ន្ធកុំព្យូទ័រ បន្ទាប់មកប្រឡងដៃចង្កូត',
  'A failed theory test must be passed before the practical test can be taken': 'ប្រឡងធ្លាក់ទ្រឹស្តីមិនអាចប្រឡងដៃចង្កូតបានទេ',
  'Minimum age 18': 'ត្រូវមានអាយុ១៨ឆ្នាំ យ៉ាងតិច',
  'Foreigners residing legally may take the test for Type A or B': 'ជនបរទេសដែលស្នាក់នៅស្របច្បាប់ អាចប្រឡងយកបណ្ណបើកបរប្រភេទ "ក" ឬ "ខ"',
  'License valid for 10 years': 'មានសុពលភាពរយៈពេល ១០ ឆ្នាំ',
  'Online via the MPWT driving-license system': 'អនឡាញ៖ driverlicense.mpwt.gov.kh',
  'MPWT service centres: Aeon Mall Phnom Penh, Aeon Mall Sen Sok City, provincial one-window units, Heavy Vehicle Training Center, provincial Public Works and Transport departments':
    'ផ្សារទំនើបអ៊ីអន ១ និង ២ មជ្ឈមណ្ឌលបណ្តុះបណ្តាលយានយន្តធុនធំ និងមន្ទីរសាធារណការ និងដឹកជញ្ជូនរាជធានី-ខេត្ត',
};
const FEE_KHMER = {
  'Type A, Cambodian citizen': 'ប្រភេទ ក (ម៉ូតូ) · ពលរដ្ឋខ្មែរ',
  'Type A, foreigner': 'ប្រភេទ ក (ម៉ូតូ) · ជនបរទេស',
  'Type B, Cambodian citizen': 'ប្រភេទ ខ (រថយន្ត) · ពលរដ្ឋខ្មែរ',
  'Type B, foreigner': 'ប្រភេទ ខ (រថយន្ត) · ជនបរទេស',
};
const KM_FIELD = { requirements: 'textKm', steps: 'titleKm', fees: 'labelKm', 'processing-times': 'textKm', locations: 'nameKm' };

const { data: login } = await call('POST', '/auth/login', { email, password });
const T = login.accessToken;

// 1. Verify the official MPWT sources (driver's license EN/KM pages).
const { data: sources } = await call('GET', '/sources?pageSize=100', null, T);
for (const code of ['S001', 'S002']) {
  const s = sources.find((x) => x.code === code);
  await call('POST', `/sources/${s.id}/decision`, { status: 'VERIFIED', comment: 'Demo: official MPWT page' }, T);
}

// 2. Add Khmer text, then approve, for the driver's-license items.
const { data: queue } = await call('GET', '/admin/review?pageSize=100&service=driver_license_ab', null, T);
let approved = 0;
for (const item of queue) {
  const v = item.values;
  const km = item.contentType === 'fees' ? FEE_KHMER[v.appliesTo] : KHMER[v.textEn ?? v.titleEn ?? v.nameEn];
  if (!km) continue;
  await call('PATCH', `/admin/content/${item.contentType}/${item.id}`, { [KM_FIELD[item.contentType]]: km }, T);
  await call('POST', `/admin/review/${item.contentType}/${item.id}/approve`, {}, T);
  approved++;
}

// 3. Link sources to the service and publish it.
const { data: services } = await call('GET', '/admin/services?pageSize=50', null, T);
const dl = services.find((s) => s.slug === 'driver_license_ab');
await call('PATCH', `/admin/services/${dl.id}`, { publishStatus: 'PUBLISHED', summaryKm: 'ប្រឡងយកបណ្ណបើកបរ ម៉ូតូ (ក) និងរថយន្ត (ខ)', summaryEn: 'Driving test for motorbike (A) and car (B) licenses' }, T);

// 4. A demo citizen with a checklist and some feedback.
const citizenEmail = `demo-citizen-${Date.now()}@chlatvei.local`;
const { data: reg } = await call('POST', '/auth/register', { email: citizenEmail, password: 'demo-citizen-pass-2026', displayName: 'Sokha' });
const C = reg.accessToken;
const { data: list } = await call('POST', '/checklists', { serviceSlug: 'driver_license_ab' }, C);
for (const item of list.items.slice(0, 3)) await call('PATCH', `/checklists/${list.id}/items/${item.id}`, { isDone: true }, C);
const { data: detail } = await call('GET', '/services/driver_license_ab');
const step1 = detail.steps[0]?.id;
await call('POST', '/feedback', { serviceSlug: 'driver_license_ab', kind: 'RATING', rating: 4, difficulty: 3, outcome: 'IN_PROGRESS', confusingStepId: step1, comment: 'Demo feedback' }, C);
await call('POST', '/feedback', { serviceSlug: 'driver_license_ab', kind: 'RATING', rating: 3, difficulty: 4 });

console.log(JSON.stringify({ approved, remainingForThisService: queue.length - approved, checklist: list.id, citizenEmail }));
