// ════════════════════════════════════════════════════════════════
// 워드프레스 플러그인 FTP 배포
// ────────────────────────────────────────────────────────────────
// 왜: wordpress-plugin/ 의 파일은 **git push 만으로 서버에 반영되지 않는다.**
//     REST API 로는 페이지·글·미디어까지만 되고, 우리가 만든 .php 를 서버에 놓는 것은
//     막혀 있다(미디어 .php 업로드 403 / 플러그인 설치 API 는 wordpress.org 저장소 한정).
//     그래서 이 한 단계만 FTP 가 필요하다. 여기까지 자동화하면 사람 손이 완전히 빠진다.
//
// 무엇을: 파일을 올린 뒤 **REST API 로 실제 반영 여부(버전)를 되읽어 확인**한다.
//         올렸다는 말만 하고 끝내지 않는다 — 캐시·경로 착오로 조용히 실패할 수 있다.
//
// 실행:
//   node scripts/deploy-wp-plugin.js                      wordpress-plugin/*.php 전부
//   node scripts/deploy-wp-plugin.js xinchao-fx-calculator.php   특정 파일만
//   node scripts/deploy-wp-plugin.js --dry                 올리지 않고 계획만 출력
//
// 필요한 .env: FTP_HOST · FTP_PORT · FTP_USER · FTP_PASS · FTP_BASE
//              (+ 확인용으로 WORDPRESS_URL/USERNAME/APP_PASSWORD 재사용)
//
// 보안 메모:
//   · 비밀번호는 명령줄에 넣지 않고 curl 설정을 **stdin 으로** 넘긴다.
//     명령줄에 두면 작업관리자·프로세스 목록에 그대로 보인다.
//   · FTPS(암호화)를 먼저 시도하고, 서버가 거부할 때만 평문 FTP 로 내려간다.
//     평문으로 내려가면 경고를 크게 남긴다 — 비밀번호가 그대로 흘러가기 때문.
// ════════════════════════════════════════════════════════════════
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const DIR = path.join(__dirname, '..', 'wordpress-plugin');
const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const targets = args.filter((a) => !a.startsWith('--'));

const HOST = process.env.FTP_HOST;
const PORT = process.env.FTP_PORT || '21';
const USER = process.env.FTP_USER;
const PASS = process.env.FTP_PASS;
const BASE = (process.env.FTP_BASE || 'public_html').replace(/\/+$/, '');
const REMOTE = `${BASE}/wp-content/plugins`;

// SFTP 서버의 RSA 호스트키 지문(SHA256, base64). **공개키라 저장소에 있어도 안전하다.**
// .env 가 아니라 여기 두는 이유: 서버 고유값이라 PC 마다 다르지 않고, 다른 PC 에서도
// 그대로 통해야 하기 때문. (.env 는 git 에 안 올라가 다른 PC 에 전달되지 않는다)
// 원본 키는 scripts/known_hosts 에 함께 보관한다.
const SFTP_HOSTKEY = process.env.SFTP_HOSTKEY_SHA256 ||
  '4vWIkuSXXn4DFeWc7DQ8idYr24R/lBQ6jXxzUsAyXjM';

function die(msg) { console.error('\n✖ ' + msg + '\n'); process.exit(1); }

if (!HOST || !USER) die('.env 에 FTP_HOST / FTP_USER 가 없습니다.');
if (!PASS && !DRY) {
  die('.env 의 FTP_PASS 가 비어 있습니다.\n' +
      '  호스팅어 hPanel → 웹사이트 → 파일 → FTP 계정 → "FTP 비밀번호 변경" 에서 정한 값을\n' +
      '  .env 의 FTP_PASS= 뒤에 넣어 주세요. 넣은 뒤 OneDrive dev-secrets 백업도 갱신하세요.');
}

/**
 * 올릴 파일 목록 — 인자가 없으면 wordpress-plugin/*.php 전부.
 *
 * 인자는 두 가지를 다 받는다:
 *   ① 파일명만          xinchao-fx-calculator.php   → wordpress-plugin/ 에서 찾는다
 *   ② 경로 (상대/절대)  ../../chao-vn-app/.../x.php → 그 경로를 그대로 쓴다
 *
 * ⚠️ 왜 ② 가 필요한가 (2026-09-03):
 *    워드프레스 플러그인이 이 저장소에만 있는 게 아니다. chao-vn-app 저장소의
 *    wp-plugins/ 에도 있다(chaovn-seo-boost 등). 그때 파일을 이 저장소로 복사해 오면
 *    같은 플러그인이 두 저장소에 생겨 **반드시 어긋난다.** 원본 자리에 두고 올린다.
 */
function pickFiles() {
  if (targets.length) {
    return targets.map((t) => {
      // 준 경로가 그대로 존재하면 그것을 쓴다 (다른 저장소의 플러그인)
      if (fs.existsSync(t) && fs.statSync(t).isFile()) return path.resolve(t);
      const p = path.join(DIR, path.basename(t));
      if (!fs.existsSync(p)) die(`파일이 없습니다: ${t}
  (${DIR} 에서도 못 찾았습니다)`);
      return p;
    });
  }
  return fs.readdirSync(DIR).filter((f) => f.endsWith('.php')).map((f) => path.join(DIR, f));
}

/** 플러그인 헤더에서 이름·버전을 읽는다 (배포 후 대조용) */
function readHeader(file) {
  const head = fs.readFileSync(file, 'utf8').slice(0, 4000);
  const name = (head.match(/^\s*\*\s*Plugin Name:\s*(.+)$/m) || [])[1];
  const ver = (head.match(/^\s*\*\s*Version:\s*(.+)$/m) || [])[1];
  return { name: (name || '').trim(), version: (ver || '').trim() };
}

/**
 * 이 파일이 서버에서 어디에 놓여야 하는가 — **서버에 물어본다.**
 *
 * ⚠️ 왜 추측하면 안 되나 (2026-09-02 실측):
 *    플러그인마다 배치가 다르다. plugins/ 바로 아래인 것도 있고 하위 폴더인 것도 있다.
 *      jenny-daily-news/jenny-daily-news.php        ← 폴더
 *      xinchao-image-uploader /xinchao-image-uploader.php  ← 폴더 (이름 끝에 공백까지 있다)
 *      xinchao-fx-calculator.php                    ← 평면
 *    전부 평면으로 올리면 **중복 파일이 생겨 플러그인이 두 개로 보인다.**
 *    REST API 의 plugin 필드가 "폴더/파일" 또는 "파일" 을 알려주므로 그걸 따른다.
 *
 * @returns {{dir:string, base:string}} dir = plugins 아래 경로(없으면 ''), base = 파일명
 */
function remoteTarget(file, srv) {
  const localBase = path.basename(file);
  const h = readHeader(file);
  const s = srv.find((p) => p.name === h.name);
  if (!s || !s.plugin.includes('/')) return { dir: '', base: localBase };
  const folder = s.plugin.slice(0, s.plugin.lastIndexOf('/'));   // 끝 공백도 그대로 살린다
  return { dir: folder, base: localBase };
}

/** 경로 각 구간을 인코딩 (폴더명에 공백이 있어도 안전) */
const encPath = (p) => p.split('/').map(encodeURIComponent).join('/');

/**
 * 한 파일 업로드. 설정을 stdin 으로 넘겨 비밀번호를 명령줄에 노출하지 않는다.
 *
 * 프로토콜 우선순위 (2026-09-02 실측으로 정함):
 *   ① sftp  — **기본.** 포트 65002(호스팅어 SSH). 통째로 암호화되고 서버 신원까지
 *             known_hosts 로 검증한다. 경로는 절대경로(SFTP_BASE)를 쓴다.
 *   ② ftps  — IP 로 접속하면 윈도우 schannel 이 "using IP address, SNI is not supported"
 *             로 인증서 검증에 실패한다. 도메인은 다른 IP(CDN)로 가서 FTP 서버에 안 닿는다.
 *             → 사실상 못 쓴다. 그래도 환경이 바뀌면 통할 수 있으니 남겨둔다.
 *   ③ ftp   — **평문. 비밀번호가 그대로 흐른다.** 최후 수단이며 쓰이면 크게 경고한다.
 *
 * @param {'sftp'|'ftps'|'ftp'} proto
 */
function upload(file, target, proto) {
  const local = file.replace(/\\/g, '/');
  const sub = target.dir ? `/${encPath(target.dir)}` : '';
  const leaf = encodeURIComponent(target.base);

  let url, extra = [];
  if (proto === 'sftp') {
    const base = (process.env.SFTP_BASE || '').replace(/\/+$/, '');
    if (!base) return { status: 1, stderr: '.env 에 SFTP_BASE 가 없습니다' };
    url = `sftp://${HOST}:${process.env.SFTP_PORT || 65002}` +
          `${encPath(base)}/wp-content/plugins${sub}/${leaf}`;
    // 서버 신원 고정. 지문이 다르면 curl 이 접속을 거부한다 → 중간자 공격 차단.
    // ⚠️ curl 에는 --known-hosts 옵션이 없다(실측). --hostpubsha256 로 직접 고정한다.
    //    libssh2 가 **RSA** 키로 협상하므로 RSA 지문을 넣는다(ed25519 를 넣으면 mismatch 로 거부됨).
    //    서버 키가 바뀌면 아래 값을 갱신:
    //      ssh-keyscan -p 65002 -t rsa <IP> > k && ssh-keygen -lf k
    extra = [`hostpubsha256 = "${SFTP_HOSTKEY}"`];
  } else {
    const dir = target.dir ? `${REMOTE}/${encPath(target.dir)}` : REMOTE;
    url = `ftp://${HOST}:${PORT}/${encPath(dir)}/${leaf}`;
    extra = ['ftp-create-dirs', proto === 'ftps' ? 'ssl-reqd' : ''];
  }

  const conf = [
    `user = "${USER}:${PASS}"`,
    `upload-file = "${local}"`,
    `url = "${url}"`,
    'silent', 'show-error', 'connect-timeout = 20', 'max-time = 180',
    ...extra,
  ].filter(Boolean).join('\n');

  return spawnSync('curl', ['-K', '-'], { input: conf, encoding: 'utf8' });
}

/** 서버에 설치된 플러그인 목록 (REST API) */
async function serverPlugins() {
  const wp = (process.env.WORDPRESS_URL || 'https://chaovietnam.co.kr').replace(/\/$/, '');
  const auth = 'Basic ' + Buffer.from(
    `${process.env.WORDPRESS_USERNAME}:${process.env.WORDPRESS_APP_PASSWORD}`).toString('base64');
  const r = await fetch(`${wp}/wp-json/wp/v2/plugins?_fields=plugin,name,status,version`,
    { headers: { Authorization: auth } });
  if (!r.ok) throw new Error(`플러그인 목록 조회 실패 HTTP ${r.status}`);
  return r.json();
}

/** "1.2.10" 비교 — 문자열 비교로는 1.2.10 < 1.2.9 가 되어 틀린다 */
function cmpVer(a, b) {
  const A = String(a).split('.').map(Number), B = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(A.length, B.length); i++) {
    const x = A[i] || 0, y = B[i] || 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}

/**
 * 올리기 **전** 안전 점검 — 서버가 더 최신이면 막는다.
 * 왜: 다른 PC 나 서버에서 직접 고친 판이 최신일 수 있다. 낡은 로컬로 덮으면 조용히 되돌아간다.
 *     (시크릿 백업 점검 CHECK.ps1 이 "내용이 다르면 자동으로 안 덮는다"와 같은 이유)
 */
function preflight(files, srv) {
  const blocked = [];
  console.log('\n■ 올리기 전 대조 (로컬 ↔ 서버)');
  for (const f of files) {
    const h = readHeader(f);
    const s = srv.find((p) => p.name === h.name);
    if (!s) { console.log(`   · ${h.name} v${h.version} → 서버에 없음 (새로 설치됨, 활성화 필요)`); continue; }
    const c = cmpVer(h.version, s.version);
    if (c > 0) console.log(`   · ${h.name}  v${s.version} → v${h.version}  올림`);
    else if (c === 0) console.log(`   · ${h.name}  v${h.version}  같음 (그래도 파일은 덮어씀)`);
    else {
      console.log(`   ⚠ ${h.name}  로컬 v${h.version} < 서버 v${s.version}  — 되돌아감!`);
      blocked.push(h);
    }
  }
  if (blocked.length && !args.includes('--force')) {
    die(`서버가 더 최신인 플러그인이 ${blocked.length}개 있어 중단했습니다.\n` +
        '  로컬이 낡았습니다. 서버 판을 먼저 내려받아 반영하거나,\n' +
        '  정말 되돌릴 의도라면 --force 를 붙이세요.');
  }
}

/** 배포 후 서버에 실제로 반영됐는지 REST API 로 되읽는다 */
async function verify(expected) {
  let list;
  try { list = await serverPlugins(); }
  catch (e) { console.log(`  (확인 실패: ${e.message})`); return; }

  console.log('\n■ 서버 반영 확인');
  for (const e of expected) {
    const hit = list.find((p) => p.name === e.name);
    if (!hit) {
      console.log(`  ⚠ ${e.name} — 목록에 없음. 워드프레스 관리자에서 **활성화**가 필요합니다.`);
    } else if (hit.version === e.version) {
      console.log(`  ✅ ${e.name} v${hit.version} [${hit.status}]`);
    } else {
      console.log(`  ⚠ ${e.name} — 서버 v${hit.version} ≠ 올린 v${e.version}` +
                  ' (캐시이거나 다른 경로에 올라갔을 수 있습니다)');
    }
  }
}

(async () => {
  const files = pickFiles();
  const sb = (process.env.SFTP_BASE || '').replace(/\/+$/, '');
  console.log(`■ 대상 ${files.length}개 → ` + (sb
    ? `sftp://${HOST}:${process.env.SFTP_PORT || 65002}${sb}/wp-content/plugins/  (암호화·서버키 고정)`
    : `ftp://${HOST}:${PORT}/${REMOTE}/  ⚠ 평문`));
  const expected = [];
  for (const f of files) {
    const h = readHeader(f);
    expected.push(h);
    console.log(`   ${path.basename(f)}  ${h.name ? `— ${h.name} v${h.version}` : ''}`);
  }
  // 서버와 대조 — 낡은 로컬로 덮어써 되돌리는 사고를 막는다
  let srv = [];
  try { srv = await serverPlugins(); preflight(files, srv); }
  catch (e) { console.log(`\n  (대조 건너뜀: ${e.message})`); }

  // 어디에 놓을지 서버가 알려준 경로대로 정한다 (평면 / 하위폴더가 섞여 있다)
  const plan = files.map((f) => ({ file: f, target: remoteTarget(f, srv) }));
  console.log('\n■ 올릴 위치');
  for (const p of plan) {
    console.log(`   ${path.basename(p.file).padEnd(34)} → ` +
      `wp-content/plugins/${p.target.dir ? p.target.dir + '/' : ''}${p.target.base}`);
  }

  if (DRY) { console.log('\n미리보기였습니다. 실제로 올리려면 --dry 를 빼세요.'); return; }

  let ok = 0, fail = 0, usedPlain = false;
  console.log('');
  for (const { file: f, target } of plan) {
    let r, used;
    for (const proto of ['sftp', 'ftps', 'ftp']) {   // 안전한 것부터
      r = upload(f, target, proto);
      used = proto;
      if (r.status === 0) break;
      const why = (r.stderr || '').trim().split('\n')[0].slice(0, 110);
      if (proto !== 'ftp') console.log(`   … ${proto} 실패(${why || 'unknown'}) → 다음 방식으로 재시도`);
    }
    if (r.status === 0) {
      console.log(`   ✅ ${path.basename(f)}  [${used}]`);
      if (used === 'ftp') usedPlain = true;
      ok++;
    } else {
      console.log(`   ❌ ${path.basename(f)} — ${(r.stderr || '').trim().slice(0, 160)}`);
      fail++;
    }
  }

  console.log(`\n■ 업로드 완료 — 성공 ${ok} · 실패 ${fail}`);
  if (usedPlain) {
    console.log('  🔴 평문 FTP 로 올라갔습니다 — **비밀번호가 네트워크에 그대로 흘렀습니다.**');
    console.log('     SFTP 가 왜 실패했는지 확인하세요 (.env 의 SFTP_BASE·SFTP_PORT,');
    console.log('     scripts/known_hosts 존재 여부). 서버 키가 바뀌었다면 known_hosts 를 갱신해야 합니다:');
    console.log('       ssh-keyscan -p 65002 -t ed25519,rsa <IP> | grep -v "^#" > scripts/known_hosts');
  }
  if (ok) await verify(expected);
})().catch((e) => die(e.message));
