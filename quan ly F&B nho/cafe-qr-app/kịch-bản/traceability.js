// Ma trận truy vết (quy trình 15 bước — mục E, TASK-057): ACT → US → AC (+BR) → UC → MOD → SCR → TC → kết quả test thật.
// Nguồn: tài-liệu/nghiệp-vụ/user-stories.md (backlog), tài-liệu/chức-năng/FEATURE-*.md (AC), tài-liệu/chất-lượng/tc-map.md (AC → test),
// kết quả chạy thật trong kiểm-thử/kết-quả/ (node-junit.xml của `npm test`, e2e.json của `npm run test:e2e`, load.txt của `npm run load`).
// Ghi tài-liệu/chất-lượng/traceability.md. `--check`: thoát mã 1 nếu có bằng chứng hỏng / test FAIL / AC chưa có TC.
// Chạy: npm run trace   (hoặc node kịch-bản/traceability.js --check)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(ROOT, p));
const RESULTS = 'kiểm-thử/kết-quả';
const OUT = 'tài-liệu/chất-lượng/traceability.md';
const check = process.argv.includes('--check');

// ---------- Bảng Markdown ----------
/** Trả về các dòng của bảng có hàng tiêu đề bắt đầu bằng `firstHeader` (ô đã bỏ dấu ` và khoảng trắng). */
function tableRows(text, firstHeader) {
  const lines = text.split(/\r?\n/);
  const cells = (line) =>
    line
      .trim()
      .replace(/^\||\|$/g, '')
      .split(/(?<!\\)\|/)
      .map((c) => c.replace(/\\\|/g, '|').trim());
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const head = lines[i].trim();
    if (!head.startsWith('|') || cells(head)[0] !== firstHeader) continue;
    const header = cells(head);
    for (let j = i + 2; j < lines.length && lines[j].trim().startsWith('|'); j++) {
      const c = cells(lines[j]);
      out.push(Object.fromEntries(header.map((h, k) => [h, (c[k] ?? '').replace(/`/g, '').trim()])));
    }
  }
  return out;
}
const list = (cell) =>
  String(cell ?? '')
    .split(/,\s*/)
    .map((x) => x.trim())
    .filter((x) => x && x !== '—' && x !== '-');

// ---------- Nguồn yêu cầu ----------
const featureFiles = fs.readdirSync(path.join(ROOT, 'tài-liệu/chức-năng')).filter((f) => /^FEATURE-\d{3}\.md$/.test(f));
const acText = new Map(); // AC → { feature, text }
for (const f of featureFiles) {
  const feature = `F-${f.slice(8, 11)}`;
  for (const line of read(`tài-liệu/chức-năng/${f}`).split(/\r?\n/)) {
    const m = line.match(/\b(AC-\d{3}-\d{2})\b\s*[:：]\s*(.*)$/);
    if (m && !acText.has(m[1])) acText.set(m[1], { feature, text: m[2].replace(/\*\*/g, '').slice(0, 140) });
  }
  for (const id of read(`tài-liệu/chức-năng/${f}`).match(/\bAC-\d{3}-\d{2}\b/g) ?? []) if (!acText.has(id)) acText.set(id, { feature, text: '' });
}
const stories = tableRows(read('tài-liệu/nghiệp-vụ/user-stories.md'), 'US');
const brIds = new Set(
  read('tài-liệu/nghiệp-vụ/business-rules.md')
    .match(/\|\s*BR-\d{3}\s*\|/g)
    ?.map((x) => x.replace(/[|\s]/g, '')) ?? [],
);
const sitemap = exists('tài-liệu/giao-diện/sitemap.md') ? read('tài-liệu/giao-diện/sitemap.md') : '';
const scrIds = new Set(sitemap.match(/\bSCR-\d{2}\b/g) ?? []);

// ---------- Bằng chứng kiểm thử ----------
const tcRows = tableRows(read('tài-liệu/chất-lượng/tc-map.md'), 'AC');
const titleCache = new Map();
/** Tên test(...) có trong file nguồn (để phát hiện bằng chứng trỏ tới test không tồn tại). */
function titlesIn(file) {
  if (!titleCache.has(file)) {
    const src = exists(file) ? read(file) : '';
    const set = new Set();
    for (const m of src.matchAll(/\btest\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g)) set.add(m[2].replace(/\\(['"`\\])/g, '$1'));
    titleCache.set(file, set);
  }
  return titleCache.get(file);
}

// Kết quả thật: node:test (JUnit), Playwright (JSON), ép tải (log)
const results = new Map(); // `${file}::${title}` → 'PASS' | 'FAIL' | 'SKIP'
let suiteFailures = 0; // <testsuite failures="N"> của JUnit (gồm cả file test không nạp được)
const runInfo = [];
// Reporter JUnit của node:test mã hóa ký tự hai lần (`&amp;quot;`) → giải mã tới khi ổn định
const xmlUnescape = (s) => {
  for (let prev = null; prev !== s;) {
    prev = s;
    s = s
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
  }
  return s;
};
if (exists(`${RESULTS}/node-junit.xml`)) {
  const xml = read(`${RESULTS}/node-junit.xml`);
  // Thuộc tính có thể chứa ">" thô (node:test không mã hóa) → chỉ dừng ở ">" nằm ngoài dấu ngoặc kép
  const re = /<testcase\s+((?:[^>"]|"[^"]*")*?)(\/>|>([\s\S]*?)<\/testcase>)/g;
  let n = 0;
  for (const m of xml.matchAll(/<testsuite\s[^>]*?\bfailures="(\d+)"/g)) suiteFailures += Number(m[1]);
  for (const m of xml.matchAll(re)) {
    const attr = Object.fromEntries([...m[1].matchAll(/(\w+)="([^"]*)"/g)].map((a) => [a[1], xmlUnescape(a[2])]));
    if (!attr.file || !attr.name) continue;
    const body = m[3] ?? '';
    const status = /<failure/.test(body) ? 'FAIL' : /<skipped/.test(body) ? 'SKIP' : 'PASS';
    results.set(`${rel(attr.file)}::${attr.name}`, status);
    n++;
  }
  runInfo.push(
    `\`npm test\` (JUnit): ${n} test, sửa lúc ${fs
      .statSync(path.join(ROOT, RESULTS, 'node-junit.xml'))
      .mtime.toISOString()
      .slice(0, 16)
      .replace('T', ' ')} UTC`,
  );
}
if (exists(`${RESULTS}/e2e.json`)) {
  const report = JSON.parse(read(`${RESULTS}/e2e.json`));
  const testDir = report.config?.rootDir ? rel(report.config.rootDir) : 'kiểm-thử/e2e';
  let n = 0;
  const walk = (suite) => {
    for (const s of suite.suites ?? []) walk(s);
    for (const spec of suite.specs ?? []) {
      const last = spec.tests?.[0]?.results?.at(-1)?.status;
      const status = last === 'passed' ? 'PASS' : last === 'skipped' || !last ? 'SKIP' : 'FAIL';
      results.set(`${testDir}/${spec.file}::${spec.title}`, status);
      n++;
    }
  };
  for (const s of report.suites ?? []) walk(s);
  runInfo.push(
    `\`npm run test:e2e\` (JSON): ${n} test, sửa lúc ${fs
      .statSync(path.join(ROOT, RESULTS, 'e2e.json'))
      .mtime.toISOString()
      .slice(0, 16)
      .replace('T', ' ')} UTC`,
  );
}
let loadPass = null;
if (exists(`${RESULTS}/load.txt`)) {
  const m = read(`${RESULTS}/load.txt`).match(/NFR-002:\s*(\d+)\/(\d+) vòng PASS/);
  loadPass = m ? m[1] === m[2] : false;
  runInfo.push(`\`npm run load\`: ${m ? `${m[1]}/${m[2]} vòng PASS` : 'không đọc được kết quả'}`);
}

// ---------- Ghép ----------
const storyOf = new Map(); // AC → [story]
for (const s of stories) for (const ac of list(s.AC)) storyOf.set(ac, [...(storyOf.get(ac) ?? []), s]);
const tcOf = new Map(); // AC → [tc rows]
for (const t of tcRows) tcOf.set(t.AC, [...(tcOf.get(t.AC) ?? []), t]);

const problems = { brokenEvidence: [], failing: [], noTc: [], gap: [], noStory: [], storyNoAc: [], unknownAc: [], brUnused: [], scrUnused: [] };
function evidenceStatus(t) {
  const layer = t['Lớp'];
  if (layer === 'GAP') return 'GAP';
  if (layer === 'Manual') return 'MANUAL';
  if (layer === 'Load') return loadPass === null ? 'NOT_RUN' : loadPass ? 'PASS' : 'FAIL';
  if (!titlesIn(t.File).has(t.Test)) return 'BROKEN';
  if (!results.size) return 'NOT_RUN';
  const r = results.get(`${t.File}::${t.Test}`);
  return r === 'SKIP' || !r ? 'NOT_RUN' : r; // test bị bỏ qua = chưa có bằng chứng
}
const acIds = [...acText.keys()].sort();
const rows = acIds.map((ac) => {
  const sts = storyOf.get(ac) ?? [];
  const tcs = tcOf.get(ac) ?? [];
  const ev = tcs.map((t) => ({ t, status: evidenceStatus(t) }));
  for (const e of ev) {
    if (e.status === 'BROKEN') problems.brokenEvidence.push(`${ac}: \`${e.t.File}\` › "${e.t.Test}"`);
    if (e.status === 'FAIL') problems.failing.push(`${ac}: \`${e.t.File}\` › "${e.t.Test}"`);
  }
  const auto = ev.filter((e) => !['GAP', 'MANUAL'].includes(e.status));
  let verdict;
  if (!tcs.length) verdict = 'CHƯA CÓ TC';
  else if (ev.some((e) => e.status === 'FAIL' || e.status === 'BROKEN')) verdict = 'FAIL';
  else if (auto.length && auto.every((e) => e.status === 'PASS')) verdict = 'PASS';
  else if (auto.some((e) => e.status === 'NOT_RUN')) verdict = 'NOT_RUN';
  else if (ev.some((e) => e.status === 'MANUAL')) verdict = 'THỦ CÔNG';
  else verdict = 'GAP';
  if (!tcs.length) problems.noTc.push(ac);
  if (verdict === 'GAP') problems.gap.push(`${ac}: ${tcs.find((t) => t['Lớp'] === 'GAP')?.Test ?? ''}`);
  if (!sts.length) problems.noStory.push(ac);
  const pick = (k) => [...new Set(sts.flatMap((s) => list(s[k])))].join(', ') || '—';
  const tcCell =
    ev
      .map(({ t, status }) =>
        ['GAP', 'MANUAL'].includes(status) ? `${t['Lớp']}: ${t.Test}` : `${t['Lớp']}: \`${path.basename(t.File)}\` › ${t.Test} — **${status}**`,
      )
      .join('<br>') || '—';
  return {
    ac,
    feature: acText.get(ac).feature,
    us: sts.map((s) => s.US).join(', ') || '—',
    act: pick('Actor'),
    uc: pick('UC'),
    mod: pick('MOD'),
    scr: pick('SCR'),
    br: pick('BR'),
    tcCell,
    verdict,
    tcId: tcs[0]?.TC ?? '—',
  };
});
for (const s of stories) {
  if (!list(s.AC).length) problems.storyNoAc.push(s.US);
  for (const ac of list(s.AC)) if (!acText.has(ac)) problems.unknownAc.push(`${s.US} → ${ac}`);
}
// Test có kết quả nhưng không gắn AC nào (bất biến, a11y, header…) — liệt kê; test FAIL dù không gắn AC vẫn chặn --check
const mapped = new Set(tcRows.map((t) => `${t.File}::${t.Test}`));
problems.unmapped = [...results.keys()].filter((k) => !mapped.has(k)).sort();
problems.failingAny = [...results].filter(([, v]) => v === 'FAIL').map(([k]) => k.replace('::', ' › '));
const brUsed = new Set(stories.flatMap((s) => list(s.BR)));
problems.brUnused = [...brIds].filter((b) => !brUsed.has(b)).sort();
const scrUsed = new Set(stories.flatMap((s) => list(s.SCR)));
problems.scrUnused = [...scrIds].filter((s) => !scrUsed.has(s)).sort();

// ---------- Ghi báo cáo ----------
const count = (v) => rows.filter((r) => r.verdict === v).length;
const md = [];
md.push('# Ma trận truy vết yêu cầu → kiểm thử');
md.push('');
md.push(
  '> **Tự sinh — không sửa tay.** Chạy `npm run trace` (script `kịch-bản/traceability.js`, TASK-057). Nguồn: [user-stories.md](../nghiệp-vụ/user-stories.md), `chức-năng/FEATURE-*.md`, [tc-map.md](tc-map.md), kết quả chạy thật trong `kiểm-thử/kết-quả/`.',
);
md.push('> Chuỗi truy vết (sổ tay mục E): **ACT → US → AC (+ BR) → UC → MOD → SCR → TC → kết quả**. Quy ước ID: [TASK-057](../công-việc/TASK-057.md).');
md.push('');
md.push('## Lần chạy làm bằng chứng');
md.push('');
md.push(runInfo.length ? runInfo.map((x) => `- ${x}`).join('\n') : '- Chưa có kết quả chạy trong `kiểm-thử/kết-quả/` → mọi TC tự động là NOT_RUN.');
md.push('');
md.push('## Tổng hợp');
md.push('');
md.push('| Chỉ số | Số lượng |');
md.push('| --- | --- |');
md.push(`| User Story | ${stories.length} |`);
md.push(`| Acceptance Criteria | ${rows.length} |`);
md.push(`| AC **PASS** (mọi test tự động liên quan đạt ở lần chạy trên) | ${count('PASS')} |`);
md.push(`| AC kiểm **thủ công** (UAT / thiết bị thật — xem [uat-plan.md](uat-plan.md)) | ${count('THỦ CÔNG')} |`);
md.push(`| AC **FAIL** | ${count('FAIL')} |`);
md.push(`| AC **NOT_RUN** (chưa có kết quả chạy) | ${count('NOT_RUN')} |`);
md.push(`| AC **GAP** (chưa có test) | ${count('GAP')} |`);
md.push(`| AC **chưa có dòng TC** trong tc-map | ${count('CHƯA CÓ TC')} |`);
md.push('');
md.push('## Phát hiện thiếu sót (sổ tay mục E)');
md.push('');
const sect = (title, arr, ok) => {
  md.push(`- **${title}:** ${arr.length ? `${arr.length}` : `0 — ${ok}`}`);
  for (const x of arr.slice(0, 50)) md.push(`  - ${x}`);
  if (arr.length > 50) md.push(`  - … và ${arr.length - 50} mục nữa`);
};
sect('Story chưa có AC', problems.storyNoAc, 'mọi Story đều có AC');
sect('AC chưa thuộc Story nào', problems.noStory, 'mọi AC đều gắn Story');
sect('Story trỏ tới AC không tồn tại', problems.unknownAc, 'không có');
sect('AC chưa có TC', problems.noTc, 'mọi AC đều có TC');
sect('AC còn GAP (chưa có test tự động, không phải thủ công)', problems.gap, 'không còn');
sect('Bằng chứng hỏng (test không còn tên như tc-map ghi)', problems.brokenEvidence, 'không có');
sect('Test FAIL ở lần chạy gần nhất', problems.failing, 'không có');
sect('BR chưa gắn Story nào', problems.brUnused, 'mọi BR đều có Story');
sect('Màn hình (SCR trong sitemap) chưa gắn Story nào', problems.scrUnused, 'mọi màn hình đều có Story');
sect('Test FAIL bất kỳ (kể cả test không gắn AC, file test không nạp được)', problems.failingAny, 'không có');
if (suiteFailures) md.push(`- **JUnit báo ${suiteFailures} lỗi ở cấp bộ test** — xem log \`npm test\``);
md.push(`- **Test có kết quả nhưng không gắn AC** (kiểm bất biến, khả năng tiếp cận, header… — không phải lỗi, ghi để biết): ${problems.unmapped.length}`);
for (const x of problems.unmapped) md.push(`  - ${x.replace('::', ' › ')}`);
md.push('');
md.push('## Ma trận theo AC');
md.push('');
md.push('| AC | TC | Feature | US | Actor | UC | MOD | SCR | BR | Bằng chứng (Lớp: file › test — kết quả) | Kết luận |');
md.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const r of rows)
  md.push(
    `| ${r.ac} | ${r.tcId} | ${r.feature} | ${r.us} | ${r.act} | ${r.uc} | ${r.mod} | ${r.scr} | ${r.br} | ${r.tcCell.replace(/\|/g, '/')} | **${r.verdict}** |`,
  );
md.push('');
fs.writeFileSync(path.join(ROOT, OUT), `${md.join('\n')}\n`);

const bad =
  problems.brokenEvidence.length +
  problems.failing.length +
  problems.noTc.length +
  problems.noStory.length +
  problems.unknownAc.length +
  problems.failingAny.length +
  suiteFailures;
console.log(
  `traceability: ${stories.length} US, ${rows.length} AC — PASS ${count('PASS')}, thủ công ${count('THỦ CÔNG')}, FAIL ${count('FAIL')}, NOT_RUN ${count('NOT_RUN')}, GAP ${count('GAP')}, chưa có TC ${count('CHƯA CÓ TC')} → ${OUT}`,
);
// --check chặn cả khi THIẾU bằng chứng: AC chưa chạy (không có kết quả / chạy một phần / bị bỏ qua) không được coi là đạt
if (check && (bad || count('GAP') || count('FAIL') || count('NOT_RUN'))) {
  console.error(
    `traceability --check: ${bad} vấn đề truy vết / test FAIL, ${count('GAP')} GAP, ${count('FAIL')} FAIL, ${count('NOT_RUN')} AC chưa có kết quả chạy`,
  );
  process.exit(1);
}
