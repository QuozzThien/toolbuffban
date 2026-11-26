/* Azota Assistant v4.9 — chạy bằng bookmark (nạp từ GitHub/jsDelivr), không cần Tampermonkey.
 * Lần đầu bấm bookmark: nạp script → màn mở đầu → menu. Bấm lại: mở/đóng menu. */

(function () {
  'use strict';
  if (!/(^|\.)azota\.vn$/i.test(location.hostname)) { alert('Azota Assistant chỉ chạy trên azota.vn'); return; }
  if (window.__AZA4_LOADED__) { window.dispatchEvent(new CustomEvent('aza-menu')); return; }
  window.__AZA4_LOADED__ = true;
  const SELF_SRC = (document.currentScript && document.currentScript.src) || '';

  /* =====================================================================
   * PHẦN 1 — TIỆN ÍCH CHUNG & BANK ENGINE
   * ===================================================================== */
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const norm = s => String(s == null ? '' : s).normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/đ/g, 'd').replace(/([+=<>%^\/*])/g, ' $1 ')
    .replace(/[^a-z0-9\s+=<>%^\/*]/g, ' ').replace(/\s+/g, ' ').trim();
  const stripLabel = s => String(s == null ? '' : s).replace(/^\s*(?:[A-Da-d])\s*[\.\):]\s*/, '').trim();
  const cut = (s, n) => s.length > n ? s.slice(0, n - 1) + '…' : s;

  function tok(s) {
    const t = norm(s).replace(/\bcau \d+\b/g, '').trim();
    const raw = t ? t.split(' ') : [], mg = [];
    for (let i = 0; i < raw.length; i++) {
      if (/^[a-z]$/.test(raw[i])) { let j = i, run = ''; while (j < raw.length && /^[a-z]$/.test(raw[j])) run += raw[j++]; if (j - i >= 2) { mg.push(run); i = j - 1; continue; } }
      mg.push(raw[i]);
    }
    const w = mg.filter(x => x.length > 1 || /\d/.test(x)), o = w.slice();
    for (let i = 0; i < w.length - 1; i++) o.push(w[i] + '_' + w[i + 1]);
    const f = []; let changed = false;
    for (let i = 0; i < raw.length; i++) {
      if (/^[a-z]$/.test(raw[i]) && i + 1 < raw.length && /^\d{1,3}$/.test(raw[i + 1])) { f.push(raw[i] + raw[i + 1]); i++; changed = true; } else f.push(raw[i]);
    }
    const G = /^[a-z]\d{1,3}$/;
    for (const x of f) if (G.test(x)) o.push(x);
    for (let i = 0; i < f.length; i++) {
      if (!G.test(f[i])) continue; let j = i, run = ''; while (j < f.length && G.test(f[j])) run += f[j++];
      if (j - i >= 2) o.push(run); i = j - 1;
    }
    for (const x of raw) { const m = /^(?:[a-z]\d{1,3}){2,}$/.test(x) && x.match(/[a-z]\d{1,3}/g); if (m) o.push(...m); }
    if (changed) { const ff = f.filter(x => x.length > 1 || /\d/.test(x)); for (let i = 0; i < ff.length - 1; i++) o.push(ff[i] + '_' + ff[i + 1]); }
    return o;
  }

  function parseAzotaReview(raw) {
    const NOISE = /^(?:Giải thích|Thí sinh chọn\b.*|Thí sinh trả lời|Thí sinh không nhập.*|Câu làm sai\b.*|error\.\.\.|Đề đảo|Bỏ quảng cáo|Trắc nghiệm|Đúng\s*&\s*sai|Phần\s*\d+\..*)$/i;
    const lines = String(raw).replace(/\r/g, '').split('\n').map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const L = [];
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^([A-Ha-h])\s*[\.\)]$/);
      if (m && i + 1 < lines.length && !/^[A-Ha-h]\s*[\.\)]$/.test(lines[i + 1])) { L.push(m[1] + (/[A-H]/.test(m[1]) ? '. ' : ') ') + lines[i + 1]); i++; }
      else L.push(lines[i]);
    }
    const heads = [];
    L.forEach((x, i) => { if (/^Câu\s*\d+\b.*\bID\s*:\s*\d+/i.test(x)) heads.push(i); });
    if (!heads.length) return [];
    heads.push(L.length);
    const clean = x => x.replace(/\s+/g, ' ').trim();
    const stripTag = t => { t = t.trim(); for (let k = 0; k < 3; k++) { const m = t.match(/^\(([^)]{1,25})\)\s*/); if (!m) break; t = t.slice(m[0].length); } return t.trim(); };
    const out = [];
    for (let k = 0; k < heads.length - 1; k++) {
      const b = L.slice(heads[k], heads[k + 1]);
      const q = [], opts = [], stmts = [], tfAns = {}, sa = [];
      let letters = [], cur = null, mode = 'q', ansFirst = false, m;
      const head = b[0].replace(/^Câu\s*\d+\s*(?:ID\s*:\s*\d+)?\s*/i, '').trim(); if (head) q.push(head);
      for (const line of b.slice(1)) {
        if (mode === 'done') break;
        if (mode === 'ans') {
          if (/^Thí sinh/i.test(line)) { mode = 'done'; continue; }
          if ((m = line.match(/^([a-d])\s*[\)\.]\s*(Đúng|Sai)\s*$/i))) tfAns[m[1].toLowerCase()] = /^đúng$/i.test(m[2]);
          else if (/^[A-H](?:\s*[,;&]\s*[A-H])*$/.test(line) && ansFirst && !letters.length) letters = line.match(/[A-H]/g);
          ansFirst = false;
          continue;
        }
        if (mode === 'sa') { if (/^Thí sinh/i.test(line)) { mode = 'done'; continue; } sa.push(line); continue; }
        if (/^Đáp án được chấp nhận/i.test(line)) { mode = 'sa'; continue; }
        if ((m = line.match(/^Đáp án đúng\s*:?\s*(.*)$/i))) { mode = 'ans'; ansFirst = true; if (m[1] && /^[A-H](?:\s*[,;&]\s*[A-H])*$/.test(m[1].trim())) letters = m[1].match(/[A-H]/g); continue; }
        if (NOISE.test(line)) { cur = null; continue; }
        if ((m = line.match(/^([A-H])\s*[\.\):]\s*(.+)$/))) { cur = { t: m[2] }; opts.push(cur); continue; }
        if ((m = line.match(/^([a-d])\s*[\.\)]\s*(.+)$/))) { cur = { t: m[2] }; stmts.push(cur); continue; }
        if (/^[A-H]$/.test(line)) { cur = null; continue; }
        if (cur) cur.t += ' ' + line; else if (!opts.length && !stmts.length) q.push(line);
      }
      const qt = stripTag(clean(q.join(' ')));
      if (!qt) continue;
      if (stmts.length >= 2 && Object.keys(tfAns).length) {
        const st = stmts.map((s, i) => ({ t: stripTag(clean(s.t)), v: tfAns['abcd'[i]] })).filter(s => s.t && typeof s.v === 'boolean');
        if (st.length) out.push({ type: 'tf', q: qt, stmts: st });
      } else if (opts.length >= 2 && letters.length) {
        const a = [...new Set(letters.map(x => x.charCodeAt(0) - 65).filter(i => i < opts.length))];
        if (a.length) out.push({ type: 'mc', q: qt, opts: opts.map(o => clean(o.t)), a });
      } else if (sa.length) {
        out.push({ type: 'sa', q: qt, answers: sa.map(clean).filter(Boolean) });
      }
    }
    return out;
  }
  const unglue = t => t.replace(/([^\n])(Câu\s*\d+\s*ID\s*:\s*\d+)/g, '$1\n$2').replace(/([^\n])(Đáp án đúng\s*:)/g, '$1\n$2').replace(/([^\n])(Đáp án được chấp nhận)/g, '$1\n$2').replace(/([^\n])(Thí sinh (?:chọn|trả lời))/g, '$1\n$2');

  function parseGeneric(input) {
    const raw = String(input || '').replace(/\r/g, '').trim();
    if (!raw) throw new Error('Dữ liệu trống.');
    try {
      const j = JSON.parse(raw);
      if (Array.isArray(j)) return j;
      if (j && Array.isArray(j.questions)) return j.questions;
    } catch (_) {}
    const lines = raw.split('\n').map(x => x.trim()).filter(Boolean);
    const starts = [];
    for (let i = 0; i < lines.length; i++) if (/^(?:Câu|Cau)\s*\d+\b/i.test(lines[i])) starts.push(i);
    if (!starts.length) throw new Error('Không tìm thấy "Câu 1, Câu 2..."');
    starts.push(lines.length);
    const out = [];
    const answerLine = /(?:đáp\s*án(?:\s*đúng)?|đáp\s*án\s*chính\s*xác|answer\s*key|correct\s*answer)\s*[:：\-]?\s*(.*)$/i;
    const optLine = /^\s*([A-H])\s*[\).:]\s*(.+)$/i;
    const stmtLine = /^\s*([a-d])\s*[\).:]\s*(.+)$/i;
    const clean = x => x.replace(/\s+/g, ' ').trim();
    for (let k = 0; k < starts.length - 1; k++) {
      const block = lines.slice(starts[k], starts[k + 1]);
      if (!block.length) continue;
      let qHead = clean(block[0].replace(/^(?:Câu|Cau)\s*\d+\s*[:.)-]?\s*/i, '').replace(/\bID\s*:\s*\d+\b/i, ''));
      const qLines = qHead ? [qHead] : [];
      let answer = null;
      const opts = [], stmts = [];
      let explicitTF = false, answerSection = false;
      for (const line of block.slice(1)) {
        const am = line.match(answerLine);
        if (am) { answer = clean(am[1]); answerSection = true; continue; }
        if (answerSection) continue;
        const sm = line.match(stmtLine);
        if (sm && /(đúng|sai)\s*$/i.test(sm[2])) {
          explicitTF = true;
          const v = /đúng\s*$/i.test(sm[2]);
          stmts.push({ t: clean(sm[2].replace(/\s*(đúng|sai)\s*$/i, '')), v });
          continue;
        }
        const om = line.match(optLine);
        if (om) {
          let value = clean(om[2]);
          const marked = /(?:✓|✔|☑|\[x\]|\(đúng\)|\bđáp án đúng\b)/i.test(value);
          value = clean(value.replace(/(?:✓|✔|☑|\[x\]|\(đúng\)|\bđáp án đúng\b)/ig, ''));
          opts.push({ key: om[1].toUpperCase(), text: value, correct: marked });
          continue;
        }
        if (!opts.length && !stmts.length && !/^ID\s*:/i.test(line)) qLines.push(line);
      }
      const q = clean(qLines.join(' '));
      if (!q) continue;
      if (explicitTF && stmts.length) { out.push({ type: 'tf', q, stmts }); continue; }
      if (opts.length >= 2) {
        let keys = [];
        if (answer) {
          const letters = answer.match(/\b[A-H]\b/gi);
          if (letters) keys = letters.map(x => x.toUpperCase());
          if (!keys.length) keys = opts.filter(o => answer.toLowerCase().includes(o.text.toLowerCase())).map(o => o.key);
        }
        if (!keys.length) keys = opts.filter(o => o.correct).map(o => o.key);
        const indices = [...new Set(keys.map(x => opts.findIndex(o => o.key === x)).filter(x => x >= 0))];
        if (indices.length) out.push({ type: 'mc', q, opts: opts.map(o => o.text), a: indices });
      }
    }
    if (!out.length) throw new Error('Không nhận diện được đáp án.');
    return out;
  }

  function parseAny(input) {
    const raw = String(input || '').replace(/\r/g, '').trim();
    if (!raw) throw new Error('Dữ liệu trống.');
    try {
      const j = JSON.parse(raw);
      if (Array.isArray(j)) return j;
      if (j && Array.isArray(j.questions)) return j.questions;
    } catch (_) {}
    const a = parseAzotaReview(unglue(raw));
    return a.length ? a : parseGeneric(raw);
  }

  function resolveAns(a, opts) {
    const arr = Array.isArray(a) ? a : [a], out = [];
    for (const x of arr) {
      if (typeof x === 'number') { if (opts[x] != null) out.push(x); continue; }
      const s = String(x).trim();
      if (/^[A-Ha-h]$/.test(s)) { const i = s.toUpperCase().charCodeAt(0) - 65; if (opts[i] != null) out.push(i); continue; }
      const n = norm(stripLabel(s)), i = opts.findIndex(o => norm(o) === n);
      if (i >= 0) out.push(i);
    }
    return [...new Set(out)];
  }

  function canon(raw) {
    const out = [];
    for (const r of raw || []) {
      if (!r || !r.q) continue;
      if (r.type === 'sa' || r.answers) {
        const ans = (r.answers || [].concat(r.a == null ? [] : r.a)).map(x => String(x).trim()).filter(Boolean);
        if (ans.length) out.push({ type: 'sa', q: String(r.q), ans, parts: [String(r.q)] });
        continue;
      }
      if (r.type === 'tf' || r.stmts) {
        const st = (r.stmts || []).map(s => ({ t: stripLabel(s.t), v: !!s.v })).filter(s => s.t);
        if (st.length) out.push({ type: 'tf', q: String(r.q), st, parts: [String(r.q), ...st.map(s => s.t)] });
      } else {
        const opts = (r.opts || []).map(stripLabel), a = resolveAns(r.a, opts);
        if (opts.length >= 2 && a.length) out.push({ type: 'mc', q: String(r.q), opts, a, parts: [String(r.q), ...opts] });
      }
    }
    return out;
  }

  const fingerprint = it => it.type + '|' + norm(it.q) + '|' + (it.type === 'tf' ? it.st.map(s => norm(s.t)) : it.type === 'mc' ? it.opts.map(norm) : []).sort().join('|');
  const answerSig = it => it.type === 'sa' ? it.ans.map(norm).sort().join('|') : it.type === 'tf' ? it.st.map(s => norm(s.t) + ' ' + (s.v ? 1 : 0)).sort().join('|') : it.a.map(i => norm(it.opts[i])).sort().join('|');
  const toRaw = it => it.type === 'sa' ? { type: 'sa', q: it.q, answers: it.ans.slice() } : it.type === 'tf' ? { type: 'tf', q: it.q, stmts: it.st.map(s => ({ t: s.t, v: s.v })) } : { type: 'mc', q: it.q, opts: it.opts.slice(), a: it.a.slice() };

  let IDF = new Map(), IDFMAX = 1, BK = [];
  let INV = new Map(), TOT = new Float64Array(0);

  function vec(s) {
    const m = new Map();
    for (const t of tok(s)) m.set(t, (m.get(t) || 0) + 1);
    for (const [k, v] of m) m.set(k, (1 + Math.log(v)) * (IDF.get(k) || IDFMAX));
    return m;
  }

  function loadBank(raw) {
    const items = [], dup = new Set();
    for (const it of canon(raw)) { const k = fingerprint(it); if (!dup.has(k)) { dup.add(k); items.push(it); } }
    const df = new Map(); let N = 0;
    for (const it of items) for (const p of it.parts) { N++; for (const t of new Set(tok(p))) df.set(t, (df.get(t) || 0) + 1); }
    IDF = new Map();
    for (const [k, v] of df) IDF.set(k, Math.log((N + 1) / (v + 1)) + 1);
    IDFMAX = Math.log(N + 1) + 1;
    for (const it of items) {
      const m = new Map();
      for (const p of it.parts) for (const [k, v] of vec(p)) m.set(k, (m.get(k) || 0) + v);
      it.fv = m;
      it.nums = new Set(tok(it.parts.join(' ')).filter(t => /^\d+$/.test(t)));
    }
    INV = new Map(); TOT = new Float64Array(items.length);
    items.forEach((it, i) => { let t = 0; for (const [k, v] of it.fv) { t += v; let a = INV.get(k); if (!a) INV.set(k, a = []); a.push(i, v); } TOT[i] = t; });
    BK = items;
    return items.length;
  }

  const tset = it => it._ts || (it._ts = new Set(tok(it.parts.join(' '))));
  function jaccard(a, b) {
    const A = tset(a), B = tset(b); let c = 0;
    const [s, l] = A.size < B.size ? [A, B] : [B, A];
    for (const t of s) if (l.has(t)) c++;
    return c / (A.size + B.size - c || 1);
  }
  const jacStr = (a, b) => { const A = new Set(tok(a)), B = new Set(tok(b)); let c = 0; for (const t of A) if (B.has(t)) c++; return c / (A.size + B.size - c || 1); };
  const CFG = { COV: .82, NEAR: .9, SOFT: .65, GAP: .25, REV: .5 };

  function filterNew(raw, existing) {
    const seen = new Map(existing.map(it => [fingerprint(it), it]));
    const fresh = [], bucket = new Map(), stat = { added: 0, dup: 0, near: 0, conflict: 0, invalid: 0 };
    const cand = canon(raw); stat.invalid = (raw || []).length - cand.length;
    for (const it of cand) {
      const fp = fingerprint(it), old = seen.get(fp);
      if (old) { stat.dup++; if (answerSig(old) !== answerSig(it)) stat.conflict++; continue; }
      let twin = null;
      for (const r of rank(it.parts.join(' ')).slice(0, 5)) { const e = BK[r.i]; if (e.type === it.type && jaccard(e, it) >= CFG.NEAR) { twin = e; break; } }
      const bk = it.type + norm(it.q).slice(0, 30);
      if (!twin) for (const e of bucket.get(bk) || []) if (jaccard(e, it) >= CFG.NEAR) { twin = e; break; }
      if (twin) { stat.near++; if (jacStr(answerSig(twin), answerSig(it)) < .8) stat.conflict++; continue; }
      seen.set(fp, it); fresh.push(it); if (!bucket.has(bk)) bucket.set(bk, []); bucket.get(bk).push(it); stat.added++;
    }
    return { fresh, stat };
  }
  const exportBank = () => '[\n' + BK.map(it => ' ' + JSON.stringify(toRaw(it))).join(',\n') + '\n]';

  function rank(text) {
    const set = new Set(tok(text)), hit = new Float64Array(BK.length), touched = [];
    for (const t of set) {
      const a = INV.get(t); if (!a) continue;
      for (let k = 0; k < a.length; k += 2) { const i = a[k]; if (!hit[i]) touched.push(i); hit[i] += a[k + 1]; }
    }
    const out = touched.map(i => ({ i, c: TOT[i] ? hit[i] / TOT[i] : 0 }));
    out.sort((a, b) => b.c - a.c);
    out.screen = set;
    return out;
  }

  function decide(rk) {
    const acc = [], seen = new Set();
    for (const r of rk) {
      if (r.c < CFG.COV) break;
      const it = BK[r.i]; let t = 0, e = 0;
      for (const [k, v] of it.fv) { t += v; if (!seen.has(k)) e += v; }
      if (acc.length && e / t < .3) continue;
      acc.push(r.i); for (const k of it.fv.keys()) seen.add(k);
    }
    if (!acc.length && rk.length && rk.screen) {
      const t = rk[0], n = rk[1], it = BK[t.i], set = rk.screen;
      let a = 0, b = 0; for (const x of set) { const w = IDF.get(x) || IDFMAX; b += w; if (it.fv.has(x)) a += w; }
      let h = 0; for (const x of it.nums) if (set.has(x)) h++;
      if (t.c >= CFG.SOFT && (!n || t.c - n.c >= CFG.GAP) && b && a / b >= CFG.REV && (!it.nums.size || h / it.nums.size >= .6)) acc.push(t.i);
    }
    return acc;
  }

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  let userBank = store.get('apa_bank', []); if (!Array.isArray(userBank)) userBank = [];
  let on = store.get('apa_on', true);
  let autoOn = store.get('apa_auto', false);
  // Tốc độ (chỉnh trong menu → Tốc độ). mult càng lớn càng nhanh; net = chờ mạng tối đa (giây)
  const SPD_DEF = { mult: 1, pick: 400, tf: 600, next: 500, net: 8 };
  const SPD = Object.assign({}, SPD_DEF, store.get('apa_speed', {}));
  const sp = ms => Math.max(60, ms / (SPD.mult > 0 ? SPD.mult : 1));
  let bankCount = 0;   // nạp trong start()

  function isReviewPage() {
    return /\/(review|result|ket-qua|xem-dap-an|view-answer)/i.test(location.pathname) || /Đáp án đúng/i.test(document.body.innerText) || document.querySelectorAll('[class*="review"], [class*="result"]').length > 0;
  }
  // Đọc chữ trên trang theo dòng: bỏ lớp KaTeX ẩn (tránh công thức bị lặp), bỏ nhãn ✓ ĐÚNG của script
  function domText(root) {
    const out = [];
    const nl = () => { if (out.length && out[out.length - 1] !== '\n') out.push('\n'); };
    const walk = el => {
      for (const n of el.childNodes) {
        if (n.nodeType === 3) { out.push(n.nodeValue.replace(/\s+/g, ' ')); continue; }
        if (n.nodeType !== 1) continue;
        if (n.matches('script,style,noscript,textarea,svg') || n.matches(MATH_SKIP) || inUi(n)) continue;
        if (n.classList.contains('katex')) { out.push(' ' + textOf(n).replace(/\s+/g, ' ').trim() + ' '); continue; }
        if (n.tagName === 'BR') { nl(); continue; }
        const d = getComputedStyle(n).display;
        if (d === 'none') continue;
        const blk = d !== 'inline' && d !== 'contents';
        if (blk) nl();
        walk(n);
        if (blk) nl();
      }
    };
    walk(root);
    return out.join('').split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
  }
  function extractFromReviewDOM() {
    const text = domText(document.body);
    let items = parseAzotaReview(unglue(text));
    if (items.length) return { items, source: 'azota-review' };
    try { items = parseGeneric(text); } catch (_) {}
    if (items.length) return { items, source: 'generic' };
    return { items: [], source: 'none' };
  }

  /* =====================================================================
   * PHẦN 2 — TÔ ĐÁP ÁN
   * ===================================================================== */
  const MATH_SKIP = '.katex-mathml,annotation,mjx-assistive-mml,.MJX_Assistive_MathML';
  const inUi = el => !!(el && el.closest && el.closest('.aza-ui,.aza-badge,.aza-splash'));
  function textOf(el) {
    let s = '';
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) { const p = n.parentElement; if (p && !p.closest('.aza-badge,script,style,' + MATH_SKIP)) s += n.nodeValue + ' '; }
    return s;
  }
  const NM = new Map();
  const normOf = el => { let v = NM.get(el); if (v === undefined) { v = norm(textOf(el)); NM.set(el, v); } return v; };
  const PERF = { nodes: 0, full: 0, scans: 0 };
  const TIMER_NODE = /^\s*\d{1,2}\s*:\s*\d{2}(?:\s*:\s*\d{2})?\s*$/, TIMER_RE = /\b\d{1,2}\s*:\s*\d{2}(?:\s*:\s*\d{2})?\b/g;

  function screenNodes(root) {
    const nodes = [], vis = new Map(); let text = '';
    const w = document.createTreeWalker(root || document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      const v = n.nodeValue; if (!v || !v.trim() || TIMER_NODE.test(v)) continue;
      const p = n.parentElement;
      if (!p || /^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA)$/.test(p.tagName)) continue;
      let ok = vis.get(p);
      if (ok === undefined) {
        ok = !inUi(p) && !p.closest(MATH_SKIP);
        if (ok) { const r = p.getBoundingClientRect(); ok = r.height > 0 && r.bottom >= 0 && r.top <= window.innerHeight * 1.2; }
        vis.set(p, ok);
      }
      if (!ok) continue;
      nodes.push({ n, nt: norm(v) }); text += v.trim() + ' ';
    }
    text = text.replace(TIMER_RE, ' ');
    PERF.nodes = nodes.length; if (!root) PERF.full++;
    return { nodes, text, norm: norm(text) };
  }

  function pickRoot(els, b) {
    if (!els.length || !b) return null;
    const qk = norm(b.q).slice(0, 30); let a = els[0];
    for (let d = 0; d < 14 && a && a !== document.body; d++) {
      if (els.every(e => a.contains(e)) && normOf(a).includes(qk)) { const up = a.parentElement; return up && up !== document.body ? up : a; }
      a = a.parentElement;
    }
    return null;
  }

  const CMM = new Map();
  const cm = el => { let v = CMM.get(el); if (v === undefined) { v = normOf(el).replace(/[ \/]/g, ''); CMM.set(el, v); } return v; };
  function locate(t, nodes, others) {
    if (!t) return null;
    const tc = t.replace(/[ \/]/g, ''); if (!tc) return null;
    const oth = (others || []).map(o => o.replace(/[ \/]/g, '')).filter(o => o && o !== tc);
    const lim = tc.length + (tc.length < 12 ? 6 : 20), short = tc.length < 8, found = new Set();
    const rival = el => oth.some(o => !tc.includes(o) && cm(el).includes(o));
    for (const x of nodes) {
      const c = x.c !== undefined ? x.c : (x.c = x.nt.replace(/[ \/]/g, ''));
      if (!c || !(tc.startsWith(c) || (!short && c.includes(tc)))) continue;
      let el = x.n.parentElement, d = 0;
      while (el && el !== document.body && d < 8 && !cm(el).includes(tc)) { el = el.parentElement; d++; }
      if (!el || el === document.body || cm(el).length > lim || rival(el)) continue;
      while (el.parentElement && el.parentElement !== document.body && cm(el.parentElement).length <= lim && !rival(el.parentElement)) el = el.parentElement;
      if (oth.length) {
        let p = el.parentElement; while (p && p.children.length === 1 && p.parentElement) p = p.parentElement;
        if (!p || !oth.every(o => tc.includes(o) || cm(p).includes(o))) continue;
      }
      found.add(el);
    }
    let arr = [...found].filter(a => ![...found].some(b => b !== a && a.contains(b)));
    if (arr.length > 1) { arr.sort((a, b) => cm(a).length - cm(b).length); if (cm(arr[0]).length < cm(arr[1]).length) arr = [arr[0]]; }
    return arr.length === 1 ? arr[0] : null;
  }

  function clearMarks() {
    document.querySelectorAll('.aza-ok,.aza-t,.aza-f2').forEach(e => e.classList.remove('aza-ok', 'aza-t', 'aza-f2'));
    document.querySelectorAll('.aza-badge').forEach(b => b.remove());
  }
  function badge(el, text, cls) { const s = document.createElement('span'); s.className = 'aza-badge ' + cls; s.textContent = text; el.appendChild(s); }
  let marking = false, lastEls = [];

  function paint(ids, S, keep) {
    const lines = []; if (!keep) lastEls = []; marking = true;
    try {
      if (!keep) clearMarks();
      for (const i of ids) {
        const b = BK[i];
        if (b.type === 'sa') {
          const el = locate(norm(b.q), S.nodes) || (S.head && S.head.parentElement);
          if (el) { lastEls.push(el); badge(el, 'Đáp án: ' + b.ans.join(' | '), 'aza-b-ok'); }
          lines.push('✎ Điền: ' + b.ans.join(' | '));
        } else if (b.type === 'mc') {
          for (const j of b.a) {
            const el = locate(norm(b.opts[j]), S.nodes, b.opts.filter((_, k) => k !== j).map(norm)); if (el) lastEls.push(el);
            if (el) { el.classList.add('aza-ok'); badge(el, '✓ ĐÚNG', 'aza-b-ok'); }
            lines.push('✓ ' + cut(b.opts[j], 80) + (el ? '' : ' (?)'));
          }
        } else {
          for (const s of b.st) {
            const el = locate(norm(s.t), S.nodes, b.st.filter(x => x !== s).map(x => norm(x.t))); if (el) lastEls.push(el);
            if (el) { el.classList.add(s.v ? 'aza-t' : 'aza-f2'); badge(el, s.v ? 'ĐÚNG' : 'SAI', s.v ? 'aza-b-ok' : 'aza-b-no'); }
            lines.push((s.v ? 'ĐÚNG' : 'SAI') + ' – ' + cut(s.t, 60) + (el ? '' : ' (?)'));
          }
        }
      }
    } finally { marking = false; obsTake(); }
    return lines;
  }

  const cache = new Map(), matched = new Set(), missed = new Set();
  let timer = null, rootEl = null, lastPaintKey = '';
  const hash = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return h + ':' + s.length; };
  const sigOf = S => hash(S.norm.slice(0, 1500));

  function resolveIds(S, key) {
    let ids = cache.get(key);
    if (ids === undefined) { const rk = rank(S.text); ids = decide(rk); cache.set(key, ids); }
    return ids;
  }

  const HEAD_RE = /^\s*Câu\s*\d+\s*$/i;
  function findBlocks() {
    const heads = [], w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      if (!HEAD_RE.test(n.nodeValue)) continue;
      const p = n.parentElement;
      if (!p || inUi(p) || /^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA)$/.test(p.tagName)) continue;
      heads.push(n);
    }
    const cnt = el => { let c = 0; for (const h of heads) if (el.contains(h)) c++; return c; };
    return heads.map(h => {
      let el = h.parentElement;
      while (el.parentElement && el.parentElement !== document.body && cnt(el.parentElement) === 1) el = el.parentElement;
      return { head: h, el, no: h.nodeValue.replace(/\D+/g, '') };
    });
  }

  function blockNodes(el) {
    const nodes = [], ok = new Map(); let text = '';
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      const v = n.nodeValue; if (!v || !v.trim() || TIMER_NODE.test(v)) continue;
      const p = n.parentElement; if (!p || /^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA)$/.test(p.tagName)) continue;
      let g = ok.get(p); if (g === undefined) { g = !p.closest('.aza-badge,.aza-ui,.aza-splash,' + MATH_SKIP); ok.set(p, g); }
      if (!g) continue;
      nodes.push({ n, nt: norm(v) }); text += v.trim() + ' ';
    }
    text = text.replace(TIMER_RE, ' ');
    return { nodes, text, norm: norm(text) };
  }

  function scanBlocks(blocks) {
    const items = blocks.map(b => { const S = blockNodes(b.el), key = sigOf(S); S.head = b.head; return { b, S, key, ids: S.norm ? resolveIds(S, key) : [] }; });
    const pageKey = items.map(x => x.key).join(',') + '#' + bankCount;
    if (pageKey === lastPaintKey && document.querySelector('.aza-badge')) return;
    marking = true; clearMarks(); marking = false;
    const lines = [], bad = []; let ok = 0; lastEls = [];
    for (const x of items) {
      if (!x.ids.length) { bad.push(x.b.no); missed.add(x.key); marking = true; badge(x.b.head.parentElement, 'Chưa khớp', 'aza-b-un'); marking = false; continue; }
      ok++; x.ids.forEach(i => matched.add(i)); missed.delete(x.key);
      paint(x.ids, x.S, true).forEach(l => lines.push('Câu ' + x.b.no + ': ' + l));
    }
    lastPaintKey = pageKey; obsTake();
    setResults(lines);
    setStatus('Đã đối chiếu ' + ok + '/' + items.length + ' câu' + (bad.length ? ' · Chưa khớp: Câu ' + bad.join(', ') : '') + '.');
    renderStats();
  }

  function finish(key, S) {
    const ids = cache.get(key) || [];
    if (!ids.length) { rootEl = null; missed.add(key); setResults([]); marking = true; clearMarks(); marking = false; obsTake(); setStatus('Chưa khớp.'); renderStats(); return; }
    ids.forEach(i => matched.add(i)); missed.delete(key);
    const lines = paint(ids, S);
    rootEl = lines.length ? pickRoot(lastEls, BK[ids[0]]) : null;
    if (!lines.length) { missed.add(key); setResults([]); setStatus('Không định vị được.'); renderStats(); return; }
    setResults(lines); setStatus('Đã đối chiếu ' + ids.length + ' câu.'); renderStats();
  }

  function scan() {
    if (!on || !started) return;
    try {
      if (!bankCount) { setStatus('Ngân hàng trống.'); return; }
      PERF.scans++; NM.clear(); CMM.clear();
      const blocks = findBlocks();
      if (blocks.length) { scanBlocks(blocks); return; }
      lastPaintKey = '';
      const root = rootEl && document.body.contains(rootEl) ? rootEl : null;
      let S = screenNodes(root);
      if (!S.norm && root) { rootEl = null; S = screenNodes(null); }
      if (!S.norm) { setStatus('Không thấy nội dung.'); return; }
      let key = sigOf(S), ids = resolveIds(S, key);
      if (!ids.length && root) {
        const S2 = screenNodes(null), k2 = sigOf(S2), ids2 = resolveIds(S2, k2);
        if (ids2.length) cache.set(key, ids2);
        S = S2; key = k2;
      }
      finish(key, S);
    } catch (e) { setStatus('Lỗi: ' + e.message); }
  }
  const schedule = () => { clearTimeout(timer); timer = setTimeout(scan, 80); };

  /* =====================================================================
   * PHẦN 3 — AUTO ANSWER (chọn theo nội dung, chỉ chạy ở chế độ luyện tập)
   * ===================================================================== */
  function getProgress() {
    const b = [...document.querySelectorAll('button')].find(x => /^Câu\s+\d+\s*\/\s*\d+$/.test(x.textContent.trim()));
    if (!b) return null;
    const m = b.textContent.match(/Câu\s+(\d+)\s*\/\s*(\d+)/);
    return m ? { cur: +m[1], total: +m[2] } : null;
  }

  // Tìm nút theo chữ (Angular bọc chữ trong <span>)
  function findBtn(re) {
    const c = [];
    for (const s of document.querySelectorAll('button span, button')) {
      if (!re.test(s.textContent.replace(/\s+/g, ' ').trim().normalize('NFC'))) continue;
      const b = s.closest('button');
      if (!b || inUi(b) || c.some(x => x.b === b)) continue;
      const r = b.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) c.push({ b, top: r.top });
    }
    c.sort((x, y) => y.top - x.top);   // nút thấp nhất màn hình = nút ở thanh dưới
    return c.length ? c[0].b : null;
  }

  // Chế độ luyện tập = có nút Kiểm tra / Thử lại / Câu tiếp
  const isPractice = () => true;
    !!document.querySelector('[azt-track-service^="take-training"]') &&
    !!getProgress() &&   // chế độ từng câu có nút "Câu x/y"; bài làm cả trang (có đồng hồ + Nộp bài) thì không chạy
    (!!findBtn(/^(Kiểm tra|Thử lại|Câu tiếp|Tiếp theo|Xem kết quả)$/i) || !!primaryBtn());

  const isLetter = x => /^[A-D]$/.test(x.textContent.trim()) && x.offsetHeight > 20 && !inUi(x);
  const isSel = b => b.classList.contains('selected-answer');

  // Từ phần tử chứa chữ của đáp án, tìm nút chữ cái (A/B/C/D) cùng hàng
  function optionLetterBtn(el) {
    let a = el;
    for (let d = 0; d < 6 && a && a !== document.body; d++, a = a.parentElement) {
      const bs = [...a.querySelectorAll('button')].filter(isLetter);
      if (bs.length === 1) return bs[0];
      if (bs.length > 1) return null; // lên quá cao, chứa nhiều đáp án
    }
    return null;
  }

  async function pick(btn, row) {
    if (isSel(btn)) return true;            // đã chọn thì không bấm lại (tránh bỏ chọn)
    btn.click();
    await sleep(sp(SPD.pick));
    if (isSel(btn)) return true;
    if (row) { row.click(); await sleep(sp(SPD.pick)); }
    return isSel(btn);
  }

  function getDomAnswers() {
    const tf = [];
    for (const b of document.querySelectorAll('button, [role="button"], .mat-mdc-button-base')) {
      const t = b.textContent.trim();
      if (/^(Đúng|Sai)$/i.test(t) && !inUi(b)) tf.push({ text: t, btn: b, isTrue: /đúng/i.test(t) });
    }
    return { tf };
  }

  function pressEnter() {
    const keyCode = 13;
    const ev = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode, which: keyCode, bubbles: true, cancelable: true });
    document.dispatchEvent(ev);
    (document.activeElement || document.body).dispatchEvent(ev);
    const ev2 = new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode, which: keyCode, bubbles: true, cancelable: true });
    document.dispatchEvent(ev2);
  }

  // Lấy text/node của CẢ khối câu hỏi hiện tại (không giới hạn trong màn hình, không dính toast)
  function currentS(prog) {
    const blocks = findBlocks();
    if (blocks.length) {
      const b = blocks.find(x => +x.no === prog.cur) || blocks[0];
      return blockNodes(b.el);
    }
    return screenNodes(document.body);
  }

  const isTF = x => /^(Đúng|Sai)$/i.test(x.textContent.trim()) && x.offsetHeight > 0 && !inUi(x);
  // Từ phần tử chứa câu phát biểu, tìm đúng cặp nút Đúng/Sai của hàng đó
  function tfRowBtn(el, want) {
    let a = el;
    for (let d = 0; d < 8 && a && a !== document.body; d++, a = a.parentElement) {
      const bs = [...a.querySelectorAll('button,[role="button"]')].filter(isTF);
      if (bs.length === 2) return bs.find(x => /^đúng$/i.test(x.textContent.trim()) === want) || null;
      if (bs.length > 2) return null;
    }
    return null;
  }

  /* ---------- Chờ điều kiện, chịu được mạng chậm ---------- */
  async function waitFor(cond, timeout, step) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      if (autoStop) return null;
      let v = null;
      try { v = cond(); } catch (_) {}
      if (v) return v;
      await sleep(step || 250);
    }
    return null;
  }

  const CHECK_RE = /^Kiểm tra$/i, RETRY_RE = /^Thử lại$/i, NEXT_RE = /^(Câu tiếp|Tiếp theo)$/i;
  const SUBMIT_RE = /^(Nộp bài|Hoàn thành|Kết thúc|Nộp|Xem kết quả)$/i;
  const CONFIRM_RE = /^(Xác nhận|Đồng ý|Nộp bài|Nộp|Có|OK|Hoàn thành)$/i;
  const btnText = b => b ? b.textContent.replace(/\s+/g, ' ').trim().normalize('NFC') : '';

  // Nút xanh chính ở thanh dưới (Kiểm tra / Câu tiếp / Xem kết quả...), nút thấp nhất màn hình
  function primaryBtn() {
    // bỏ nút nhỏ btn-sm (nút "Nộp bài" ở thanh trên) để không bấm nhầm giữa chừng
    const c = [...document.querySelectorAll('button.btn-primary:not(.btn-sm)')]
      .filter(b => !inUi(b) && b.getBoundingClientRect().height > 0)
      .map(b => ({ b, top: b.getBoundingClientRect().top }));
    c.sort((x, y) => y.top - x.top);
    return c.length ? c[0].b : null;
  }
  // Nút sang câu tiếp: theo chữ, hoặc nút chính đã đổi chữ khác "Kiểm tra"/"Thử lại"
  function nextBtn() {
    const n = findBtn(NEXT_RE);
    if (n) return n;
    const p = primaryBtn(), t = btnText(p);
    return p && t && !CHECK_RE.test(t) && !RETRY_RE.test(t) ? p : null;
  }

  function findInDialog(re) {
    for (const d of document.querySelectorAll('[role="dialog"],.modal,.swal2-popup,.cdk-overlay-pane,[class*="modal"]')) {
      if (!d.offsetHeight) continue;
      for (const b of d.querySelectorAll('button')) {
        if (re.test(btnText(b)) && b.offsetHeight > 0 && !inUi(b)) return b;
      }
    }
    return null;
  }

  // Bấm Kiểm tra và chờ kết quả: 'ok' | 'wrong' | null (hết thời gian)
  async function doCheck(prog) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const check = findBtn(CHECK_RE);
      if (check) check.click();
      const r = await waitFor(() => {
        if (findBtn(RETRY_RE)) return 'wrong';
        if (nextBtn()) return 'ok';   // nút chính đã đổi chữ khỏi "Kiểm tra"
        return null;
      }, (SPD.net + attempt * 4) * 1000);
      if (r) return r;
      logAuto(`Câu ${prog.cur}: mạng chậm, bấm Kiểm tra lại (${attempt})`);
    }
    return null;
  }

  // Bấm sang câu tiếp và chờ số câu đổi (thử lại nếu mạng chậm)
  async function goNext(prog) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      const nb = nextBtn();
      if (nb) nb.click();
      const p = await waitFor(() => { const g = getProgress(); return g && g.cur !== prog.cur ? g : null; }, (SPD.net - 2 + attempt * 4) * 1000);
      if (p) { await sleep(sp(SPD.next)); return true; }
      logAuto(`Câu ${prog.cur}: mạng chậm, bấm Câu tiếp lại (${attempt})`);
    }
    return false;
  }

  // Nộp bài sau câu cuối: chờ nút xuất hiện (tối đa 15 giây), bấm, xác nhận nếu có hộp thoại
  async function submitAll() {
    const sb = await waitFor(() => {
      const p = primaryBtn();
      return (p && SUBMIT_RE.test(btnText(p))) ? p : (findBtn(SUBMIT_RE) || nextBtn());
    }, 15000);
    if (!sb) return false;
    logAuto('Bấm "' + btnText(sb) + '"');
    sb.click();
    const cf = await waitFor(() => findInDialog(CONFIRM_RE), 4000);
    if (cf) { logAuto('Xác nhận "' + btnText(cf) + '"'); cf.click(); await sleep(800); }
    return true;
  }

  let autoRunning = false, autoStop = false;
  let autoStartOn = store.get('apa_autostart', true);
  let blockedHref = null, retryAt = 0, restarts = 0;

  async function autoLoop() {
    if (autoRunning) return;
    if (!isPractice()) { logAuto('Lỗi: Không phải chế độ luyện tập, đã dừng'); return; }
    autoRunning = true; autoStop = false;
    const href = location.href;
    let soft = 0, end = 'stopped', lastCur = -1, lastSig = '', lastErr = '';

    // true = thử lại tiếp; false = bỏ cuộc (perm = lỗi không thể tự khỏi)
    const bail = async (msg, perm) => {
      soft++;
      if (soft > 6) { lastErr = 'Lỗi: ' + msg + ' (đã thử lại ' + (soft - 1) + ' lần)'; logAuto(lastErr); end = perm ? 'perm' : 'transient'; return false; }
      logAuto('Thử lại ' + soft + '/6: ' + msg);
      await sleep(Math.min(1500 * soft, 6000));
      return true;
    };

    while (autoRunning && !autoStop) {
      if (location.href !== href) { logAuto('Trang đã đổi, dừng'); break; }
      if (!isPractice()) { if (await bail('trang chưa sẵn sàng / không phải luyện tập')) continue; break; }

      const prog = getProgress();
      if (!prog) { if (await bail('chưa thấy "Câu X/Y"')) continue; break; }

      // Lấy câu hỏi hiện tại, chờ nội dung tải xong (không lấy nhầm câu cũ)
      NM.clear(); CMM.clear();
      const S = currentS(prog);
      const sig = hash(S.norm.slice(0, 300));
      if (prog.cur !== lastCur && sig === lastSig) { if (await bail('nội dung câu ' + prog.cur + ' chưa tải')) continue; break; }
      const ids = decide(rank(S.text));
      const m = ids.length ? BK[ids[0]] : null;
      if (!m) { if (await bail(`Câu ${prog.cur} không có trong Bank`, true)) continue; break; }

      let ok = true;
      if (m.type === 'mc') {
        const j = m.a[0];
        const el = locate(norm(m.opts[j]), S.nodes, m.opts.filter((_, k) => k !== j).map(norm));
        const btn = el && optionLetterBtn(el);
        if (!btn) ok = false;
        else {
          logAuto(`Câu ${prog.cur}: chọn "${cut(m.opts[j], 30)}"`);
          if (!(await pick(btn, btn.closest('.item-answer') || el))) ok = false;
          else if (document.querySelectorAll('button.selected-answer').length !== 1) ok = false;
        }
        if (!ok) { if (await bail('chưa chọn được đáp án câu ' + prog.cur)) continue; break; }
      } else if (m.type === 'tf') {
        logAuto(`Câu ${prog.cur}: xử lý Đúng/Sai`);
        for (const s of m.st) {
          const el = locate(norm(s.t), S.nodes, m.st.filter(x => x !== s).map(x => norm(x.t)));
          const b = el && tfRowBtn(el, s.v);
          if (!b) { ok = false; break; }
          if (!isSel(b)) { b.click(); await sleep(rnd(sp(SPD.tf) * 0.7, sp(SPD.tf) * 1.3)); }
        }
        if (!ok) { if (await bail('không định vị được nút Đúng/Sai câu ' + prog.cur)) continue; break; }
        await sleep(sp(SPD.tf));
      } else {
        lastErr = `Lỗi: Chưa hỗ trợ loại ${m.type}`; logAuto(lastErr); end = 'perm'; break;
      }

      // Kiểm tra
      logAuto(`Câu ${prog.cur}: Kiểm tra`);
      const res = await doCheck(prog);
      if (autoStop) break;
      if (res === 'wrong') { logAuto(`Lỗi: Câu ${prog.cur} bị sai, đã dừng để kiểm tra`); end = 'wrong'; break; }
      if (res !== 'ok') { if (await bail('Kiểm tra chưa phản hồi ở câu ' + prog.cur)) continue; break; }

      // Câu cuối: nộp bài
      if (prog.cur >= prog.total) {
        if (await submitAll()) { end = 'done'; break; }
        if (await bail('chưa thấy nút nộp / xem kết quả')) continue;
        break;
      }

      // Câu tiếp
      logAuto(`Câu ${prog.cur}: Câu tiếp`);
      if (!(await goNext(prog))) { if (autoStop) break; if (await bail('chưa sang được câu ' + (prog.cur + 1))) continue; break; }
      lastCur = prog.cur; lastSig = sig; soft = 0;
    }

    autoRunning = false;
    if (end === 'done') { logAuto('Đã hoàn thành.'); blockedHref = href; }
    else if (end === 'transient') {
      restarts++;
      if (restarts <= 3) { retryAt = Date.now() + 15000; logAuto(lastErr + ' → tự chạy lại sau 15 giây (lần ' + restarts + '/3)'); }
      else blockedHref = href;
    } else blockedHref = href;           // dừng tay / câu sai / lỗi cố định: không tự chạy lại ở trang này
    renderStats();
  }


  /* =====================================================================
   * PHẦN 4 — GIAO DIỆN HACKER (menu gọn, đi sâu) + MÀN MỞ ĐẦU
   * ===================================================================== */
  let started = false;
  let ui = null, tab = null, titleEl = null, bBack = null, status = null, res = null, stats = null, dInfo = null, autoLog = null;
  let bOn = null, bAutoMode = null, marq = null, marqSpan = null, styleEl = null, obs = null, watchId = 0;
  const pagesMap = {}, homeSubs = {}, speedInputs = {}, themeCtl = {};
  let stack = ['home'];
  const obsTake = () => { if (obs) obs.takeRecords(); };

  // ---- Giao diện: chữ hiển thị, màu, hiệu ứng (chỉnh trong menu → Giao diện) ----
  const COLORS = [['Xanh lá', '#00ff9c'], ['Lam', '#00e5ff'], ['Hồng', '#ff2bd6'], ['Hổ phách', '#ffb000'], ['Đỏ', '#ff3b3b']];
  const THEME_DEF = { text: 'ACCESS GRANTED', color: '#00ff9c', splash: true, rain: true };
  const THEME = Object.assign({}, THEME_DEF, store.get('apa_theme', {}));
  const saveTheme = () => { store.set('apa_theme', THEME); applyTheme(); };

  const css = `
.aza-ui{--aza-c:#00ff9c;position:fixed;right:0;z-index:2147483647;display:flex;align-items:flex-start;font:12px/1.35 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;touch-action:none}
.aza-ui button,.aza-ui input{font-family:inherit}
.aza-ui button{cursor:pointer}
.aza-tab{width:30px;height:30px;border:1px solid var(--aza-c);border-right:0;border-radius:8px 0 0 8px;background:#02130b;color:var(--aza-c);font-size:14px;padding:0;box-shadow:0 0 8px var(--aza-c);text-shadow:0 0 6px var(--aza-c)}
.aza-tab.on{background:#04281a}.aza-tab.auto{animation:azaPulse 1s ease-in-out infinite}
.aza-body{display:none;flex-direction:column;position:relative;width:min(86vw,290px);height:min(56vh,330px);background:rgba(2,10,6,.95);color:var(--aza-c);border:1px solid var(--aza-c);border-radius:10px 0 0 10px;box-shadow:0 0 14px var(--aza-c),inset 0 0 18px rgba(0,255,156,.07);overflow:hidden}
.aza-body::after{content:"";position:absolute;left:0;top:0;right:0;bottom:0;pointer-events:none;background:repeating-linear-gradient(0deg,rgba(255,255,255,.035) 0,rgba(255,255,255,.035) 1px,transparent 1px,transparent 3px)}
.aza-ui.open .aza-body{display:flex}
.aza-head{display:flex;align-items:center;gap:6px;padding:5px 7px;border-bottom:1px solid var(--aza-c);flex:0 0 auto}
.aza-title{flex:1;font-weight:700;letter-spacing:.5px;text-shadow:0 0 6px var(--aza-c);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.aza-title::after{content:"\\25AE";margin-left:2px;animation:azaBlink 1s steps(1) infinite}
.aza-back,.aza-close{width:24px;height:24px;border:1px solid var(--aza-c);background:transparent;color:var(--aza-c);border-radius:4px;font-size:13px;line-height:1;padding:0}
.aza-marq{overflow:hidden;white-space:nowrap;height:16px;line-height:16px;font-size:10px;border-bottom:1px solid rgba(255,255,255,.08);flex:0 0 auto;text-shadow:0 0 5px var(--aza-c)}
.aza-marq span{display:inline-block;padding-left:100%;animation:azaMarq 12s linear infinite}
.aza-stage{position:relative;flex:1 1 auto;overflow:hidden}
.aza-page{position:absolute;top:0;left:0;right:0;bottom:0;overflow-y:auto;padding:7px;transform:translateX(100%);visibility:hidden;transition:transform .2s ease,visibility .2s;touch-action:pan-y}
.aza-page.cur{transform:none;visibility:visible}
.aza-page.under{transform:translateX(-25%);visibility:hidden}
.aza-foot{flex:0 0 auto;border-top:1px solid var(--aza-c);padding:3px 7px;font-size:10px;min-height:14px;max-height:30px;overflow:hidden;opacity:.9}
.aza-item{display:flex;align-items:center;gap:6px;width:100%;padding:7px 8px;margin-bottom:5px;border:1px solid var(--aza-c);background:rgba(0,0,0,.35);color:var(--aza-c);border-radius:5px;text-align:left;font-size:12px;text-shadow:0 0 5px var(--aza-c)}
.aza-il{flex:1;font-weight:700}.aza-is{opacity:.7;font-size:10px}.aza-ic{opacity:.8}
.aza-btn{display:block;width:100%;padding:6px;margin-bottom:5px;border:1px solid var(--aza-c);background:rgba(0,0,0,.35);color:var(--aza-c);border-radius:5px;font-size:11px;box-sizing:border-box;text-shadow:0 0 4px var(--aza-c)}
.aza-btn.go{color:#00ff9c;border-color:#00ff9c}.aza-btn.no{color:#ff3b3b;border-color:#ff3b3b}
.aza-btn.sel{background:var(--aza-c);color:#000;text-shadow:none}
.aza-r2{display:flex;gap:5px}.aza-r2 .aza-btn{flex:1}
.aza-grid{display:grid;grid-template-columns:1fr 1fr;gap:5px}.aza-grid .aza-btn{margin-bottom:0}
.aza-card{border:1px dashed var(--aza-c);border-radius:5px;padding:5px 7px;margin-bottom:6px;font-size:11px;white-space:pre-wrap}
.aza-note{opacity:.7;font-size:10px;margin:2px 0 6px}
.aza-f{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:5px;font-size:11px}
.aza-f input{width:70px;padding:4px 5px;border:1px solid var(--aza-c);border-radius:4px;font-size:12px;box-sizing:border-box;background:#000;color:var(--aza-c);text-align:right}
.aza-in{width:100%;padding:6px;border:1px solid var(--aza-c);border-radius:5px;font-size:12px;box-sizing:border-box;margin-bottom:6px;background:#000;color:var(--aza-c)}
.aza-sw{display:flex;gap:6px;margin-bottom:6px}
.aza-sw button{flex:1;height:24px;border:2px solid transparent;border-radius:12px;padding:0}
.aza-sw button.sel{border-color:#fff;box-shadow:0 0 8px currentColor}
.aza-res{font-size:10px;max-height:90px;overflow:auto;border:1px solid rgba(255,255,255,.12);border-radius:5px;padding:4px 6px;margin:0 0 6px;display:none;white-space:pre-wrap}
.aza-ok{outline:3px solid #2e7d32!important;background:rgba(46,125,50,.18)!important}
.aza-t{outline:2px solid #2e7d32!important}.aza-f2{outline:2px solid #c62828!important}
.aza-badge{display:inline-block;margin-left:6px;padding:0 6px;border-radius:8px;font-size:12px;font-weight:700;color:#fff;pointer-events:none;vertical-align:middle}
.aza-b-ok{background:#2e7d32}.aza-b-no{background:#c62828}.aza-b-un{background:#78909c}
.aza-auto-log{font-size:11px;margin:4px 0;min-height:14px;font-weight:700}
.aza-splash{--aza-c:#00ff9c;position:fixed;left:0;top:0;right:0;bottom:0;z-index:2147483647;background:#000;color:var(--aza-c);font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;display:flex;align-items:center;justify-content:center;opacity:1;transition:opacity .35s;overflow:hidden}
.aza-splash.out{opacity:0}
.aza-splash canvas{position:absolute;left:0;top:0;width:100%;height:100%;opacity:.55}
.aza-sbox{position:relative;max-width:92vw;padding:16px 18px;background:rgba(0,0,0,.74);border:1px solid var(--aza-c);box-shadow:0 0 22px var(--aza-c)}
.aza-slog{margin:0 0 10px;white-space:pre-wrap;min-height:9em;font:inherit;text-shadow:0 0 6px var(--aza-c)}
.aza-sbig{position:relative;font-weight:800;font-size:clamp(20px,8vw,40px);letter-spacing:3px;text-align:center;text-transform:uppercase;text-shadow:0 0 12px var(--aza-c);opacity:0;transform:scale(.92);transition:opacity .3s,transform .3s;word-break:break-word}
.aza-sbig.show{opacity:1;transform:none;animation:azaGlitch 1.1s infinite}
.aza-sbig::before,.aza-sbig::after{content:attr(data-t);position:absolute;left:0;top:0;width:100%;overflow:hidden}
.aza-sbig::before{color:#ff2bd6;clip-path:inset(0 0 55% 0);animation:azaG1 1.3s infinite steps(2)}
.aza-sbig::after{color:#00e5ff;clip-path:inset(55% 0 0 0);animation:azaG2 1.7s infinite steps(2)}
.aza-ssub{margin-top:10px;text-align:center;opacity:.6;font-size:11px;animation:azaBlink 1.2s steps(1) infinite}
@keyframes azaBlink{50%{opacity:0}}
@keyframes azaPulse{50%{box-shadow:0 0 16px var(--aza-c)}}
@keyframes azaMarq{from{transform:translateX(0)}to{transform:translateX(-100%)}}
@keyframes azaGlitch{0%,100%{transform:none}92%{transform:translate(1px,-1px)}94%{transform:translate(-2px,1px)}96%{transform:none}}
@keyframes azaG1{0%{transform:translate(-2px,0)}50%{transform:translate(2px,-1px)}100%{transform:translate(-1px,1px)}}
@keyframes azaG2{0%{transform:translate(2px,0)}50%{transform:translate(-2px,1px)}100%{transform:translate(1px,-1px)}}
@media (prefers-reduced-motion:reduce){.aza-splash *,.aza-ui *{animation:none!important;transition:none!important}}
`;

  const h = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt) e.textContent = txt; return e; };
  const r2 = (...c) => { const r = h('div', 'aza-r2'); r.append(...c); return r; };
  const btn = (txt, fn, cls) => { const b = h('button', 'aza-btn' + (cls ? ' ' + cls : ''), txt); if (fn) b.onclick = fn; return b; };

  function setStatus(t) { if (status) status.textContent = t; }
  function setResults(lines) { if (!res) return; res.style.display = lines.length ? 'block' : 'none'; res.textContent = lines.join('\n'); }
  function logAuto(t) {
    console.log('[AzaAuto]', t);
    if (!autoLog) return;
    autoLog.textContent = t;
    autoLog.style.color = (t.includes('Lỗi') || t.includes('Kẹt')) ? '#ff3b3b' : '#00ff9c';
  }
  function renderStats() {
    if (!ui) return;
    stats.textContent = '✓ ' + matched.size + ' khớp · ✗ ' + missed.size + ' chưa · bank ' + bankCount;
    dInfo.textContent = 'Bank: ' + bankCount + ' câu';
    bOn.textContent = on ? 'PAINT: ON' : 'PAINT: OFF';
    bAutoMode.textContent = 'Tự chạy khi vào luyện tập: ' + (autoStartOn ? 'ON' : 'OFF');
    homeSubs.auto.textContent = autoRunning ? 'đang chạy' : (autoStartOn ? 'tự chạy' : 'tắt');
    homeSubs.speed.textContent = '×' + SPD.mult;
    homeSubs.data.textContent = bankCount + ' câu';
    homeSubs.theme.textContent = THEME.splash ? 'intro ON' : 'intro OFF';
    tab.classList.toggle('on', on); tab.classList.toggle('auto', autoOn || autoRunning);
  }
  function applyTheme() {
    if (!ui) return;
    ui.style.setProperty('--aza-c', THEME.color);
    marqSpan.textContent = THEME.text || '';
    marq.style.display = THEME.text ? '' : 'none';
    COLORS.forEach((c, i) => themeCtl.sw[i].classList.toggle('sel', c[1] === THEME.color));
    themeCtl.splash.textContent = 'Màn mở đầu: ' + (THEME.splash ? 'ON' : 'OFF');
    themeCtl.rain.textContent = 'Mưa ký tự: ' + (THEME.rain ? 'ON' : 'OFF');
  }

  // ---- điều hướng đi sâu ----
  function paintNav() {
    const cur = stack[stack.length - 1];
    for (const id in pagesMap) {
      const i = stack.lastIndexOf(id);
      pagesMap[id].el.className = 'aza-page' + (id === cur ? ' cur' : (i >= 0 ? ' under' : ''));
    }
    titleEl.textContent = pagesMap[cur].title;
    bBack.style.visibility = stack.length > 1 ? 'visible' : 'hidden';
  }
  const go = id => { if (pagesMap[id] && stack[stack.length - 1] !== id) { stack.push(id); paintNav(); } };
  const back = () => { if (stack.length > 1) { stack.pop(); paintNav(); } };

  const toClip = (t, ok) => (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => setStatus(ok), () => prompt('Copy:', t));

  // ---- Màn mở đầu kiểu hacker (hiện đè lên trang khi chạy bookmark MENU) ----
  let splashEl = null, splashRaf = 0, splashTimer = 0, splashType = 0;
  function endSplash(openMenu) {
    if (!splashEl) return;
    cancelAnimationFrame(splashRaf); clearTimeout(splashTimer); clearInterval(splashType);
    const el = splashEl; splashEl = null;
    el.classList.add('out'); setTimeout(() => el.remove(), 380);
    if (openMenu && ui) ui.classList.add('open');
  }
  function startRain(cv) {
    const ctx = cv.getContext && cv.getContext('2d'); if (!ctx) return;
    const W = cv.width = window.innerWidth, H = cv.height = window.innerHeight;
    const fs = 16, cols = Math.ceil(W / fs), drops = Array.from({ length: cols }, () => Math.random() * -30);
    const chars = '01ABCDEF<>/{}[]#$%&アイウエオカキクケコサシスセソ'.split('');
    let last = 0;
    const tick = t => {
      if (!splashEl) return;
      splashRaf = requestAnimationFrame(tick);
      if (t - last < 40) return; last = t;
      ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = THEME.color; ctx.font = fs + 'px monospace';
      for (let i = 0; i < cols; i++) {
        ctx.fillText(chars[(Math.random() * chars.length) | 0], i * fs, drops[i] * fs);
        if (drops[i] * fs > H && Math.random() > 0.96) drops[i] = 0;
        drops[i]++;
      }
    };
    splashRaf = requestAnimationFrame(tick);
  }
  function showSplash() {
    if (splashEl) return;
    const reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const el = h('div', 'aza-splash');
    el.style.setProperty('--aza-c', THEME.color);
    const box = h('div', 'aza-sbox'), log = h('pre', 'aza-slog'), big = h('div', 'aza-sbig'), sub = h('div', 'aza-ssub', '[ chạm để vào ]');
    big.textContent = THEME.text || ''; big.setAttribute('data-t', THEME.text || '');
    box.append(log, big, sub);
    let cv = null;
    if (THEME.rain && !reduce) { cv = document.createElement('canvas'); el.append(cv); }
    el.append(box);
    document.body.appendChild(el); splashEl = el;
    el.onclick = () => endSplash(true);
    if (cv) startRain(cv);

    const prac = isPractice();
    const lines = [
      '> AZOTA//ASSISTANT v4.8',
      '> khởi tạo mô-đun ........... [ OK ]',
      '> ngân hàng đáp án: ' + bankCount + ' câu',
      '> chế độ luyện tập ........... [ ' + (prac ? 'CÓ' : 'KHÔNG') + ' ]',
      '> auto-engine ............... [ ' + (autoStartOn ? 'TỰ CHẠY' : 'THỦ CÔNG') + ' ]',
      '> sẵn sàng.'
    ];
    let i = 0;
    const step = () => {
      if (i < lines.length) { log.textContent += (i ? '\n' : '') + lines[i++]; return; }
      clearInterval(splashType);
      if (THEME.text) big.classList.add('show');
    };
    step();
    splashType = setInterval(step, reduce ? 60 : 230);
    splashTimer = setTimeout(() => endSplash(true), reduce ? 1200 : 3600);
  }

  async function extractReviewV2(report) {
    if (!location.pathname.includes('/test/answer-test/')) throw Error('Chỉ hỗ trợ trang xem đáp án.');
    const href = location.href, selector = 'app-question-for-student-at-review-page';
    const blocks = () => [...document.querySelectorAll(selector)];
    const clean = el => {
      if (!el) return '';
      const c = el.cloneNode(true);
      c.querySelectorAll('.aza-badge,.aza-ui,script,style,.katex-mathml,mjx-assistive-mml').forEach(x => x.remove());
      return c.textContent.normalize('NFC').replace(/\s+/g, ' ').trim();
    };
    const id = (b,i) => b.getAttribute('data-sticky-question-id') || b.querySelector('[data-sticky-question-id]')?.getAttribute('data-sticky-question-id') || 'index-'+i;
    function read(b) {
      const q = clean(b.querySelector('app-question-content-box'));
      const keys = [...b.querySelectorAll('.keyText')].map(clean);
      const answer = keys.filter(t => /^Đáp án đúng\s*:/i.test(t)).map(t => t.replace(/^Đáp án đúng\s*:\s*/i,'')).join(' ');
      const opts = [...b.querySelectorAll('.answers .answer')].map(e => ({label:clean(e.querySelector('.answer-label')).replace(/[^a-h]/gi,'').toUpperCase(),text:clean(e.querySelector('azt-dynamic-hook'))}));
      if (!q) return null;
      const tf = new Map([...answer.matchAll(/([a-d])\s*[.):]\s*(Đúng|Sai)/gi)].map(m => [m[1].toUpperCase(), /^đúng$/i.test(m[2])]));
      if (tf.size) {
        if (opts.length !== tf.size || opts.length < 2 || opts.some(o => !o.text || !tf.has(o.label)) || new Set(opts.map(o=>o.label)).size !== opts.length) return null;
        return {type:'tf',q,stmts:opts.map(o=>({t:o.text,v:tf.get(o.label)}))};
      }
      if (opts.length >= 2 && opts.every(o=>o.label && o.text) && /^[A-H](?:\s*[,;& ]\s*[A-H])*$/i.test(answer)) {
        const a = [...new Set((answer.match(/[A-H]/gi)||[]).map(l=>opts.findIndex(o=>o.label===l.toUpperCase())))];
        if (a.length && a.every(i=>i>=0)) return {type:'mc',q,opts:opts.map(o=>o.text),a};
      }
      const answers = keys.filter(t=>/^Đáp án được chấp nhận/i.test(t)).map(t=>t.replace(/^Đáp án được chấp nhận\s*:?\s*/i,'')).filter(Boolean);
      return answers.length ? {type:'sa',q,answers} : null;
    }
    const found = new Map(), known = new Map(), positions = new Map();
    const x = window.scrollX, y = window.scrollY;
    function collect() {
      if (location.href !== href) throw Error('Trang đã thay đổi.');
      const list = blocks();
      list.forEach((b,i)=>{
        const k=id(b,i); known.set(k,i+1);
        for(let p=b.parentElement;p;p=p.parentElement) if(!positions.has(p)) positions.set(p,[p.scrollLeft,p.scrollTop]);
        if (!found.has(k)) { const item=read(b); if(item) found.set(k,item); }
      });
      report('Đã đọc '+found.size+'/'+known.size+' câu');
      return list;
    }
    try {
      if (!collect().length) throw Error('Không tìm thấy câu hỏi.');
      for(let pass=0;pass<2;pass++) {
        const list=collect();
        if(found.size===known.size) break;
        for(let i=0;i<list.length;i++) {
          const b=blocks()[i]; if(!b) continue;
          const k=id(b,i); if(found.has(k)) continue;
          b.scrollIntoView({behavior:'instant',block:'center'});
          const until=Date.now()+5000;
          do { await sleep(250); collect(); } while(!found.has(k)&&Date.now()<until);
        }
      }
      collect();
      return {items:[...found.values()],total:known.size,skipped:[...known].filter(([k])=>!found.has(k)).map(([,n])=>n)};
    } finally {
      if(location.href===href) { for(const [p,pos] of positions) if(p.isConnected) {p.scrollLeft=pos[0];p.scrollTop=pos[1];} window.scrollTo(x,y); }
    }
  }

  async function importReviewV2() {
    try {
      const result = await extractReviewV2(setStatus);
      if (!result.items.length) throw Error('Không đọc được đáp án.');
      const {fresh,stat}=filterNew(result.items,BK);
      const next=userBank.concat(fresh.map(toRaw));
      localStorage.setItem('apa_bank',JSON.stringify(next));
      userBank=next; bankCount=loadBank(userBank);
      cache.clear(); lastPaintKey=''; renderStats();
      setStatus('Đọc '+result.items.length+'/'+result.total+' · Thêm '+stat.added+' · Thiếu '+result.skipped.join(','));
      await toClip(JSON.stringify(result.items,null,2),'Đã copy JSON · Bank '+bankCount+' câu · Thêm '+stat.added);
    } catch(e) {setStatus('Lỗi V2: '+e.message);}
  }


  function buildUI() {
    styleEl = document.createElement('style'); styleEl.textContent = css; document.head.appendChild(styleEl);
    ui = h('div', 'aza-ui'); tab = h('button', 'aza-tab', '🎯');
    const body = h('div', 'aza-body');
    ui.style.top = store.get('apa_top', 40) + '%';

    const head = h('div', 'aza-head');
    bBack = h('button', 'aza-back', '‹'); titleEl = h('div', 'aza-title', 'AZOTA//ASSISTANT');
    const bClose = h('button', 'aza-close', '✕');
    head.append(bBack, titleEl, bClose);
    marq = h('div', 'aza-marq'); marqSpan = h('span'); marq.appendChild(marqSpan);
    const stage = h('div', 'aza-stage');
    status = h('div', 'aza-foot');
    body.append(head, marq, stage, status); ui.append(body, tab);

    const addPage = (id, title, ...nodes) => { const el = h('div', 'aza-page'); el.append(...nodes); stage.appendChild(el); pagesMap[id] = { el, title }; return el; };
    const item = (label, id) => {
      const b = h('button', 'aza-item'), l = h('span', 'aza-il', '› ' + label), s = h('span', 'aza-is'), c = h('span', 'aza-ic', '›');
      b.append(l, s, c); b.onclick = () => go(id); homeSubs[id] = s; return b;
    };

    // ---- Trang chủ ----
    stats = h('div', 'aza-card'); res = h('div', 'aza-res');
    bOn = btn('', () => {
      on = !on; store.set('apa_on', on);
      if (on) scan(); else { marking = true; clearMarks(); marking = false; obsTake(); setResults([]); setStatus('Đã tắt paint.'); }
      renderStats();
    });
    addPage('home', 'AZOTA//ASSISTANT', stats,
      r2(bOn, btn('QUÉT LẠI', () => { cache.clear(); matched.clear(); missed.clear(); rootEl = null; lastPaintKey = ''; scan(); })),
      res, item('AUTO', 'auto'), item('TỐC ĐỘ', 'speed'), item('DỮ LIỆU', 'data'), item('GIAO DIỆN', 'theme'));

    // ---- Auto ----
    bAutoMode = btn('', () => {
      autoStartOn = !autoStartOn; store.set('apa_autostart', autoStartOn);
      if (autoStartOn) { blockedHref = null; restarts = 0; retryAt = 0; }
      renderStats();
    });
    const bStart = btn('▶ START', () => {
      if (autoRunning) return;
      if (!bankCount) { logAuto('Lỗi: Bank trống, không thể chạy'); return; }
      autoOn = true; store.set('apa_auto', true);
      blockedHref = null; restarts = 0; retryAt = 0;
      logAuto('Bắt đầu...'); renderStats();
      autoLoop();
    }, 'go');
    const bStop = btn('■ STOP', () => {
      autoStop = true; autoOn = false; store.set('apa_auto', false);
      blockedHref = location.href;   // dừng tay thì không tự chạy lại ở trang này
      logAuto('Đã bấm Dừng'); renderStats();
    }, 'no');
    autoLog = h('div', 'aza-auto-log', 'Trạng thái: Sẵn sàng');
    addPage('auto', 'AUTO',
      h('div', 'aza-note', 'Tự chạy khi vào bài luyện tập, tự thử lại khi mạng chậm, nộp bài ở câu cuối. Dừng khi gặp câu sai.'),
      bAutoMode, r2(bStart, bStop), autoLog);

    // ---- Tốc độ ----
    const saveSpd = () => { store.set('apa_speed', SPD); renderStats(); };
    const field = (label, key, min, max, step) => {
      const w = h('label', 'aza-f'), t = h('span', '', label), i = document.createElement('input');
      i.type = 'number'; i.inputMode = 'decimal'; i.min = min; i.max = max; i.step = step; i.value = SPD[key];
      i.onchange = () => {
        let v = parseFloat(i.value); if (!isFinite(v)) v = SPD_DEF[key];
        v = Math.min(max, Math.max(min, v)); SPD[key] = v; i.value = v; saveSpd();
      };
      w.append(t, i); speedInputs[key] = i; return w;
    };
    const syncSpd = () => { for (const k in speedInputs) speedInputs[k].value = SPD[k]; };
    const preset = m => btn('×' + m, () => { SPD.mult = m; syncSpd(); saveSpd(); });
    addPage('speed', 'TỐC ĐỘ',
      r2(preset(0.5), preset(1), preset(2), preset(3)),
      field('Hệ số tốc độ ×', 'mult', 0.25, 5, 0.25),
      field('Sau chọn đáp án (ms)', 'pick', 100, 3000, 50),
      field('Giữa ý Đúng/Sai (ms)', 'tf', 100, 3000, 50),
      field('Sau khi sang câu (ms)', 'next', 100, 3000, 50),
      field('Chờ mạng tối đa (giây)', 'net', 4, 60, 1),
      btn('VỀ MẶC ĐỊNH', () => { Object.assign(SPD, SPD_DEF); syncSpd(); saveSpd(); }),
      h('div', 'aza-note', 'Hệ số lớn = nhanh (chia các mốc ms). Chờ mạng không bị chia. Quá nhanh dễ bấm trước khi trang kịp cập nhật.'));

    // ---- Dữ liệu ----
    dInfo = h('div', 'aza-card');
    addPage('data', 'DỮ LIỆU', dInfo,
      btn('📥 TRÍCH XUẤT TRANG ĐÁP ÁN NÀY', () => {
        try {
          const { items } = extractFromReviewDOM();
          if (!items.length) { setStatus('Không thấy đáp án. Cần trang xem đáp án (có dòng "Đáp án đúng"). Thử "Copy văn bản trang".'); return; }
          const { fresh, stat } = filterNew(items, BK);
          userBank = userBank.concat(fresh.map(toRaw));
          store.set('apa_bank', userBank);
          bankCount = loadBank(userBank);
          cache.clear(); lastPaintKey = '';
          setStatus(`Đọc ${items.length} · thêm ${stat.added}, trùng ${stat.dup}, gần giống ${stat.near}, xung đột ${stat.conflict}. Tổng ${bankCount}.`);
          renderStats();
        } catch (e) { setStatus('Lỗi trích xuất: ' + e.message); }
      }),
      btn('⚡ TRÍCH XUẤT DOM V2', importReviewV2),
      btn('📄 COPY VĂN BẢN TRANG', () => { const t = domText(document.body); toClip(t, 'Đã copy văn bản trang (' + t.length + ' ký tự).'); }),
      btn('📋 DÁN & NẠP TỪ CLIPBOARD', async () => {
        try {
          if (!navigator.clipboard || !navigator.clipboard.readText) throw new Error('Trình duyệt chưa cho đọc clipboard.');
          const incoming = parseAny(await navigator.clipboard.readText());
          const { fresh, stat } = filterNew(incoming, BK);
          userBank = userBank.concat(fresh.map(toRaw));
          store.set('apa_bank', userBank);
          bankCount = loadBank(userBank);
          cache.clear(); lastPaintKey = '';
          if (on) scan();
          setStatus(`Thêm ${stat.added} câu. Tổng ${bankCount}.`);
          renderStats();
        } catch (e) { setStatus('Không nạp: ' + e.message); }
      }),
      (() => {
        const g = h('div', 'aza-grid');
        g.append(
          btn('XUẤT JSON', () => { if (!BK.length) toClip('[]', 'Bank trống.'); else toClip(exportBank(), 'Đã copy ' + BK.length + ' câu.'); }),
          btn('TẢI .JSON', () => {
            const text = BK.length ? exportBank() : '[]', a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
            a.download = 'azota-bank-' + new Date().toISOString().slice(0, 10) + '.json';
            document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
            setStatus('Đã tải file.');
          }),
          btn('MẪU', () => toClip('[\n {"type":"mc","q":"Thủ đô VN?","opts":["Huế","Hà Nội","Đà Nẵng","Hải Phòng"],"a":1}\n]', 'Đã copy mẫu.')),
          btn('XÓA HẾT', () => { userBank = []; store.set('apa_bank', []); bankCount = loadBank([]); cache.clear(); matched.clear(); missed.clear(); rootEl = null; lastPaintKey = ''; renderStats(); scan(); }, 'no'));
        return g;
      })());

    // ---- Giao diện ----
    const txtIn = h('input', 'aza-in'); txtIn.type = 'text'; txtIn.maxLength = 60; txtIn.autocomplete = 'off';
    txtIn.placeholder = 'Dòng chữ hiện trên màn hình...'; txtIn.value = THEME.text;
    txtIn.oninput = () => { THEME.text = txtIn.value; saveTheme(); };
    const sw = h('div', 'aza-sw'); themeCtl.sw = [];
    COLORS.forEach(c => {
      const b = h('button'); b.title = c[0]; b.style.background = c[1]; b.style.color = c[1];
      b.onclick = () => { THEME.color = c[1]; saveTheme(); };
      sw.appendChild(b); themeCtl.sw.push(b);
    });
    themeCtl.splash = btn('', () => { THEME.splash = !THEME.splash; saveTheme(); renderStats(); });
    themeCtl.rain = btn('', () => { THEME.rain = !THEME.rain; saveTheme(); });
    addPage('theme', 'GIAO DIỆN',
      h('div', 'aza-note', 'Dòng chữ này hiện to ở màn mở đầu và chạy ngang trên đầu menu.'),
      txtIn, sw, r2(themeCtl.splash, themeCtl.rain),
      btn('▶ XEM THỬ MÀN MỞ ĐẦU', () => { ui.classList.remove('open'); showSplash(); }, 'go'),
      btn('COPY BOOKMARK (NẠP + MỞ MENU)', () => {
        const src = SELF_SRC || 'https://cdn.jsdelivr.net/gh/TEN/REPO@main/azota-assistant.js';
        toClip("javascript:(function(){if(window.__AZA4_LOADED__){window.dispatchEvent(new CustomEvent('aza-menu'));return}var s=document.createElement('script');s.src='" + src + "';document.head.appendChild(s)})();",
          SELF_SRC ? 'Đã copy bookmark.' : 'Đã copy bookmark — nhớ thay TEN/REPO bằng địa chỉ file của bạn.');
      }),
      h('div', 'aza-note', 'Bấm bookmark lần đầu: nạp script + màn mở đầu + menu. Bấm lại: đóng/mở menu.'));

    // sự kiện chung
    bBack.onclick = back;
    bClose.onclick = () => ui.classList.remove('open');
    let drag = null;
    tab.addEventListener('pointerdown', e => { drag = { y: e.clientY, top: ui.getBoundingClientRect().top, moved: false }; if (tab.setPointerCapture) tab.setPointerCapture(e.pointerId); });
    tab.addEventListener('pointermove', e => {
      if (!drag) return;
      if (Math.abs(e.clientY - drag.y) > 6) drag.moved = true;
      if (drag.moved) ui.style.top = Math.max(0, Math.min(window.innerHeight - 34, drag.top + e.clientY - drag.y)) + 'px';
    });
    tab.addEventListener('pointerup', () => {
      if (drag && !drag.moved) ui.classList.toggle('open');
      else if (drag) store.set('apa_top', Math.round(100 * ui.getBoundingClientRect().top / window.innerHeight));
      drag = null;
    });
    document.body.appendChild(ui);
    paintNav(); applyTheme();
  }

  function autoWatch() {
    if (!autoStartOn || autoRunning || !bankCount) return;
    if (blockedHref === location.href || Date.now() < retryAt) return;
    if (!isPractice() || !getProgress()) return;
    logAuto('Tự chạy: đã vào bài luyện tập');
    autoOn = true; renderStats();
    autoLoop();
  }

  function start() {
    if (started) return;
    started = true;
    bankCount = loadBank(userBank);
    buildUI();

    obs = new MutationObserver(recs => {
      if (marking) return;
      if (!document.body.contains(ui)) document.body.appendChild(ui);
      const ignorable = r => inUi(r.target) || (r.type === 'characterData' ? /^[\d\s:.]{1,16}$/.test(r.target.nodeValue || '') : (r.addedNodes.length + r.removedNodes.length > 0 && [...r.addedNodes, ...r.removedNodes].every(n => n.nodeType === 1 && inUi(n))));
      if (recs.every(ignorable)) return;
      schedule();
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.addEventListener('scroll', () => schedule(), { passive: true, capture: true });
    window.addEventListener('resize', () => schedule(), { passive: true });
    watchId = setInterval(autoWatch, 2000);

    renderStats();
    if (on) scan(); else setStatus('Paint tắt.');
    if (isReviewPage()) setStatus('Trang đáp án: vào DỮ LIỆU → Trích xuất để nạp bank.');
    window.__AZA4__ = { parseAny, extractFromReviewDOM, loadBank, filterNew, exportBank, rank, decide, getBK: () => BK };
  }

  // Bookmark MENU: gửi sự kiện 'aza-menu' → hiện màn mở đầu rồi mở menu; chạy lại để đóng
  window.addEventListener('aza-menu', () => {
    if (!started || !ui) return;
    if (splashEl) { endSplash(true); return; }
    if (ui.classList.contains('open')) { ui.classList.remove('open'); return; }
    if (THEME.splash) showSplash(); else ui.classList.add('open');
  });

  start();

  // PUBLIC DISPLAY MODULE
  if (!window.__AZA_PUBLIC_DISPLAY__) {
    const displayScript = document.createElement('script');
    displayScript.src = 'https://cdn.jsdelivr.net/gh/QuozzThien/toolbuffban@main/azota-modules/display.js';
    displayScript.onerror = () => console.warn('[AZA] Display load failed');
    document.head.appendChild(displayScript);
  }

  // Nạp bằng bookmark thì mở luôn: màn mở đầu rồi menu
  if (THEME.splash) showSplash(); else ui.classList.add('open');
})();
