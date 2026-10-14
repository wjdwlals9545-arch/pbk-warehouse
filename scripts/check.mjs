// 배포 전 자동 점검.
//
// 여기 있는 항목은 전부 실제로 한 번씩 터진 것들이다. 추측으로 넣은 건 없다.
// "A를 고쳤는데 B가 꺼졌다" 류는 대개 같은 사실이 여러 곳에 적혀 있어서 생긴다.
// 그 대조를 사람 대신 기계가 한다.
//
//   npm run check
//
// 통과하면 조용히 끝나고, 걸리면 무엇이 왜 어긋났는지 적고 1번으로 종료한다.

import { readFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = join(ROOT, 'src', 'App.jsx');
const DATA = join(ROOT, 'public', 'data');

try { mkdirSync(join(ROOT, 'node_modules', '.cache'), { recursive: true }); } catch { /* 있으면 그만 */ }

const fails = [];
const warns = [];
let passed = 0;

function ok(name) {
  passed++;
  console.log(`  \x1b[32m✓\x1b[0m ${name}`);
}
function fail(name, detail) {
  fails.push({ name, detail });
  console.log(`  \x1b[31m✗\x1b[0m ${name}`);
  for (const d of [].concat(detail)) console.log(`      ${d}`);
}
function warn(name, detail) {
  warns.push({ name, detail });
  console.log(`  \x1b[33m!\x1b[0m ${name}`);
  for (const d of [].concat(detail)) console.log(`      ${d}`);
}

const src = readFileSync(APP, 'utf8');

// ── 괄호를 세어 배열/객체 리터럴 한 덩어리를 떼어낸다 ──
function block(from, open, close) {
  const i = src.indexOf(open, from);
  if (i < 0) return '';
  let depth = 0;
  for (let k = i; k < src.length; k++) {
    if (src[k] === open) depth++;
    else if (src[k] === close) {
      depth--;
      if (depth === 0) return src.slice(i, k + 1);
    }
  }
  return '';
}

console.log('\n[1] 연결이 끊긴 곳');

// ── 탭 레지스트리 3벌 ─────────────────────────────────
// Weight 탭이 설정에는 보이는데 탭 바에 없던 원인. 한 곳만 고치면 반쪽이 된다.
{
  const all = [...block(src.indexOf('ALL_TABS'), '[', ']').matchAll(/id:\s*'([^']+)'/g)].map(m => m[1]);
  const order = [...block(src.indexOf('DEFAULT_TAB_ORDER ='), '[', ']').matchAll(/'([^']+)'/g)].map(m => m[1]);
  const defs = [...block(src.indexOf('const TAB_DEFS = {'), '{', '}').matchAll(/^\s*([a-z0-9]+):\s*\{\s*label:/gm)].map(m => m[1]);

  if (!all.length || !order.length || !defs.length) {
    fail('탭 레지스트리를 읽지 못함', `ALL_TABS ${all.length} / ORDER ${order.length} / TAB_DEFS ${defs.length}`);
  } else {
    const missOrder = all.filter(id => !order.includes(id));
    const missDefs = all.filter(id => !defs.includes(id));
    if (missOrder.length || missDefs.length) {
      fail('탭 3벌이 어긋남', [
        missOrder.length ? `DEFAULT_TAB_ORDER 에 없음: ${missOrder.join(', ')}` : null,
        missDefs.length ? `TAB_DEFS 에 없음(탭 바에 안 나옴): ${missDefs.join(', ')}` : null,
      ].filter(Boolean));
    } else {
      ok(`탭 ${all.length}개가 세 곳 모두에 등록됨`);
    }
  }
}

// ── 감시기가 주인인 파일을 대시보드가 올리려 하는가 ──
// 양쪽이 같은 파일을 밀면 git 이 충돌하고, 한 번 꼬이면 업로드가 통째로 멈춘다.
{
  const owned = ['stock_data', 'qstock_data', 'openpo_data', 'delivery_data', 'po_prices'];
  const bad = [];
  for (const m of src.matchAll(/uploadDataToGitHub\(\s*'public\/data\/([a-z_]+)\.json'[\s\S]{0,400}?'([^']*)'\s*\)/g)) {
    if (owned.includes(m[1]) && /자동/.test(m[2])) bad.push(`${m[1]}.json ← '${m[2]}'`);
  }
  if (bad.length) {
    fail('감시기 소유 파일을 대시보드가 자동 업로드함', [...bad, "주인은 sap_watcher 하나다. 사용자가 직접 올리는 경로만 예외."]);
  } else {
    ok('데이터 파일 업로드 주인이 하나');
  }
}

// ── 같은 기준값이 두 번 적혀 있는가 ───────────────────
// 재고조정 목표가 차트 0.095 / 점수표 0.064 로 갈려 있던 적이 있다.
{
  const lits = [...src.matchAll(/(?<![.\d])0\.(?:064|095)(?![\d])/g)];
  const inTable = (src.match(/\{\s*score:\s*80,\s*max:\s*0\.064\s*\}/g) || []).length;
  const extra = lits.length - inTable;
  if (extra > 0) {
    fail('재고조정 목표값이 여러 곳에 박혀 있음', [
      `점수표 밖에서 ${extra}곳 발견 — INV_ADJ_TARGET 를 쓰십시오`,
    ]);
  } else {
    ok('재고조정 목표값은 점수표 한 곳에서만 나옴');
  }
}

// ── 날짜 정규화가 또 복제되지 않았는가 ────────────────
{
  const inline = (src.match(/const normalizeDate\w*\s*=\s*\(d\)\s*=>\s*\{/g) || []).length;
  if (inline > 0) fail('날짜 정규화 함수가 다시 복제됨', 'normalizeSapDate 한 벌만 쓰십시오');
  else ok('날짜 정규화는 normalizeSapDate 한 벌');
}

// ── 빌드는 되는데 누르면 터지는 오류 ──────────────────
// parseDeliveryExcel is not defined 가 이 부류였다.
{
  // Babel 이 stdout 에 경고를 섞어 보내 JSON 파싱이 깨졌었다. 보고서를 파일로 받는다.
  const rep = join(ROOT, 'node_modules', '.cache', 'pbk-eslint.json');
  // .bin/eslint.cmd 는 윈도우 Node 에서 EINVAL 로 거부된다. JS 진입점을 직접 돌린다.
  const bin = join(ROOT, 'node_modules', 'eslint', 'bin', 'eslint.js');
  try {
    execFileSync(process.execPath, [bin, 'src', '-f', 'json', '-o', rep], { cwd: ROOT, stdio: 'ignore' });
  } catch {
    // eslint 는 지적사항이 있으면 1번으로 끝난다. 보고서는 그래도 남는다.
  }
  let report = null;
  try {
    report = JSON.parse(readFileSync(rep, 'utf8'));
  } catch {
    report = null;
  }
  if (!report) {
    // 못 돌렸으면 통과로 치지 않는다. 점검이 실패를 통과로 보고하면 없느니만 못하다.
    fail('eslint 를 돌리지 못함', '건너뛴 게 아니라 실패로 봅니다 — 환경을 확인하십시오');
  } else {
    const FATAL = new Set(['no-undef', 'no-redeclare', 'no-dupe-keys', 'no-unreachable', 'no-cond-assign']);
    const hits = [];
    for (const f of report) {
      const name = f.filePath.split(/[\\/]/).pop();
      for (const m of f.messages) {
        if (m.fatal) hits.push(`${name}:${m.line} 구문 오류 — ${m.message}`);
        else if (FATAL.has(m.ruleId)) hits.push(`${name}:${m.line} ${m.ruleId} — ${m.message}`);
      }
    }
    if (hits.length) fail(`범위·중복 오류 ${hits.length}건`, hits.slice(0, 10));
    else ok('범위·중복 오류 없음 (no-undef / no-redeclare 등)');
  }
}

console.log('\n[2] 데이터');

// ── JSON 이 멀쩡한가 ──────────────────────────────────
// git 충돌 마커가 박힌 채 남아 업로드가 멈춘 적이 있다.
{
  const files = existsSync(DATA) ? readdirSync(DATA).filter(f => f.endsWith('.json')) : [];
  const broken = [];
  const stale = [];
  const now = Date.now();
  for (const f of files) {
    const raw = readFileSync(join(DATA, f), 'utf8');
    if (/^<{7} |^={7}$|^>{7} /m.test(raw)) { broken.push(`${f} — git 충돌 마커`); continue; }
    let d;
    try { d = JSON.parse(raw); } catch (e) { broken.push(`${f} — ${e.message.slice(0, 60)}`); continue; }
    // SAP 에서 매일 받는 것만 신선도를 본다
    if (/^(stock|openpo|delivery|po_prices|qstock)/.test(f) && d && d.updated) {
      const t = Date.parse(String(d.updated).replace(/\./g, '-').replace(/오전|오후/, ''));
      if (!Number.isNaN(t) && now - t > 7 * 864e5) stale.push(`${f} — ${d.updated}`);
    }
  }
  if (broken.length) fail(`깨진 JSON ${broken.length}개`, broken);
  else ok(`데이터 JSON ${files.length}개 정상`);
  if (stale.length) warn('7일 넘게 안 바뀐 데이터', stale);
}

// ── 납품 데이터가 앞뒤가 맞는가 ───────────────────────
{
  const p = join(DATA, 'delivery_data.json');
  if (!existsSync(p)) {
    warn('delivery_data.json 없음', '점검 건너뜀');
  } else {
    const rows = JSON.parse(readFileSync(p, 'utf8')).data || [];
    const bad = rows.filter(r => !((r.remainQty || 0) > 0)).length;
    const noDate = rows.filter(r => !r.deliveryDate).length;
    const noPrice = rows.filter(r => r.unitPrice == null).length;
    const msgs = [];
    if (bad) msgs.push(`미입고 0 이하인 행 ${bad}개 (전량 입고분은 빠져야 함)`);
    if (noDate) msgs.push(`납기일 없는 행 ${noDate}개`);
    if (msgs.length) fail('납품 데이터 모순', msgs);
    else ok(`납품 ${rows.length}행 — 전부 미입고·납기일 있음`);
    if (noPrice) warn(`단가 없는 행 ${noPrice}개`, '단가 대조에서 빠집니다');
  }
}

// ── 단가 대조의 근거가 되는 발주 단가 ─────────────────
{
  const pp = join(DATA, 'po_prices.json');
  const dd = join(DATA, 'delivery_data.json');
  if (existsSync(pp) && existsSync(dd)) {
    const prices = JSON.parse(readFileSync(pp, 'utf8')).data || {};
    const rows = JSON.parse(readFileSync(dd, 'utf8')).data || [];
    const missing = [...new Set(rows.map(r => String(r.poNo || '')).filter(Boolean))].filter(po => !prices[po]);
    if (missing.length) warn(`발주 단가가 없는 PO ${missing.length}개`, missing.slice(0, 5).join(', '));
    else ok(`발주 단가 ${Object.keys(prices).length}개 PO — 납품 PO 전부 포함`);
  }
}

console.log('\n[3] 배포 산출물');

// ── dist 가 참조하는 파일이 실제로 있는가 ─────────────
{
  const idx = join(ROOT, 'dist', 'index.html');
  if (!existsSync(idx)) {
    warn('dist 없음', 'npm run build 를 아직 안 돌렸습니다');
  } else {
    const html = readFileSync(idx, 'utf8');
    const refs = [...new Set([...html.matchAll(/assets\/[A-Za-z0-9._-]+/g)].map(m => m[0]))];
    const miss = refs.filter(r => !existsSync(join(ROOT, 'dist', r)));
    if (miss.length) fail('index.html 이 없는 파일을 가리킴', miss);
    else ok(`빌드 산출물 ${refs.length}개 참조 모두 존재`);
  }
}

// ── 정리 ──────────────────────────────────────────────
console.log('');
if (fails.length) {
  console.log(`\x1b[31m점검 실패 — 통과 ${passed} / 실패 ${fails.length}${warns.length ? ` / 경고 ${warns.length}` : ''}\x1b[0m`);
  console.log('고치고 다시 돌리십시오. 배포하면 안 됩니다.\n');
  process.exit(1);
}
console.log(`\x1b[32m점검 통과 — ${passed}개 항목${warns.length ? ` (경고 ${warns.length})` : ''}\x1b[0m\n`);
