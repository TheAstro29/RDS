const API_URL = "https://script.google.com/macros/s/AKfycbzJ8HJ1FlVckHAwJxkGJbySBbDfrtcEoxYR9tbxSBqhYv3smR4U1qqQC4mwnA57EF7Jvw/exec";
const APP_VERSION = '2.3.0';
const ADMIN_SESSION_KEY = 'rds_admin_session';
const CACHE_KEY = 'rds_cache';
const DEFAULT_MIN_STOCK = 10;
const TRIAL_WARN_DAYS = 7, TRIAL_ALERT_DAYS = 14;

let inventory = [], sales = [], customers = [], allLogs = [], summary = null, totalLogs = 0;
let isAdmin = false, adminToken = '';
let currentPage = 'dash';

// ============================================================
// ตัวช่วยทั่วไป
// ============================================================
function esc(v) {
    return String(v === undefined || v === null ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const TH_MONTHS_FULL = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const TH_DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

function parseThaiDate(dateStr) {
    const m = String(dateStr).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!m) return null;
    let y = parseInt(m[3]); if (y > 2400) y -= 543;
    const t = String(dateStr).match(/(\d{1,2}):(\d{2})/);
    return new Date(y, parseInt(m[2]) - 1, parseInt(m[1]), t ? +t[1] : 0, t ? +t[2] : 0);
}
function logDate(l) {
    if (l.createdAt) { const d = new Date(l.createdAt); if (!isNaN(d)) return d; }
    return parseThaiDate(l.date);
}
function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function sameDay(a, b) { return !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
function daysSince(d) { return d ? Math.round((startOfDay(new Date()) - startOfDay(d)) / 86400000) : null; }
function thaiShort(d) { return d ? `${d.getDate()} ${TH_MONTHS[d.getMonth()]} ${String(d.getFullYear() + 543).slice(-2)}` : '-'; }
function thaiTime(d) { return d ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} น.` : ''; }
function dayLabel(d) {
    const n = daysSince(d);
    if (n === 0) return 'วันนี้';
    if (n === 1) return 'เมื่อวาน';
    return `${TH_DAYS[d.getDay()]} ${thaiShort(d)}`;
}
function fmtN(n) { return Number(n || 0).toLocaleString('th-TH'); }

/** แยกข้อความรายการ "R2 #600 (New) x4, R2 #800 (New) x2" (รูปแบบเดียวกับฝั่ง Server) */
function parseItems(itemStr, typeLabel) {
    return String(itemStr || '').split(', ').map(entry => {
        const m = entry.match(/(.+) #(\d+)(?:\s*\((.*?)\))?(?:\s*x(\d+))?/);
        if (!m) return null;
        return { model: m[1].trim(), grit: m[2].trim(), condition: m[3] ? m[3].trim() : (String(typeLabel).includes('Used') ? 'Used' : 'New'), qty: m[4] ? +m[4] : 1 };
    }).filter(Boolean);
}
function itemsText(l, sep) { return parseItems(l.item, l.typeLabel).map(it => `${it.model} #${it.grit} ${it.condition} × ${it.qty}`).join(sep || ' · '); }

function groupStock() {
    const g = {};
    inventory.forEach(it => {
        const key = `${it.model} #${it.grit}`;
        if (!g[key]) g[key] = { key, model: String(it.model), grit: String(it.grit), newQty: 0, usedQty: 0, minStock: DEFAULT_MIN_STOCK };
        if (String(it.condition).includes('New')) {
            g[key].newQty = Number(it.qty) || 0;
            if (it.minStock !== '' && it.minStock !== undefined && it.minStock !== null) g[key].minStock = Number(it.minStock);
        } else g[key].usedQty = Number(it.qty) || 0;
    });
    const rate = {};
    (summary && summary.stock || []).forEach(s => { rate[s.key] = s; });
    return Object.values(g).map(x => Object.assign(x, {
        low: x.newQty <= x.minStock,
        weeklyRate: rate[x.key] ? rate[x.key].weeklyRate : 0,
        weeksLeft: rate[x.key] ? rate[x.key].weeksLeft : null
    }));
}
function stockQty(model, grit, cond) {
    const r = inventory.find(it => String(it.model) === model && String(it.grit) === grit && String(it.condition) === cond);
    return r ? Number(r.qty) || 0 : 0;
}

/** ประเภทของรายการ — ใช้กับไอคอน ป้าย และตัวกรองในหน้าประวัติ */
function kindOf(l) {
    if (l.status === 'CANCELLED') return 'cancel';
    if (String(l.typeLabel).startsWith('เคลม')) return 'claim';
    if (l.typeLabel === 'ส่งทดลองใช้งาน') return 'trial';
    if (l.direction === 'IN') return 'in';
    if (l.typeLabel === 'ขายสินค้า') return 'sale';
    return 'other';
}
function isOpen(l) { return ['PENDING', 'WAITING_CLAIM', 'WAITING_STOCK'].includes(l.status); }
const KIND_ICON = { sale: '💰', in: '📥', trial: '🧪', claim: '🛡️', cancel: '🚫', other: '📄' };
function statusPill(l) {
    const k = kindOf(l);
    if (k === 'cancel') return '<span class="pill p-cancel">ยกเลิกแล้ว</span>';
    if (l.status === 'PENDING') return `<span class="pill p-trial">ทดลอง · ${daysSince(logDate(l)) ?? '?'} วัน</span>`;
    if (l.status === 'RETURNED') return '<span class="pill p-done">ทดลอง · รับคืนแล้ว</span>';
    if (l.status === 'WAITING_CLAIM') return '<span class="pill p-claim">เคลม · รอปิดงาน</span>';
    if (l.status === 'WAITING_STOCK') return '<span class="pill p-alert">เคลม · รอของเข้า</span>';
    if (l.status === 'CLAIMED') return '<span class="pill p-claim">เคลมแล้ว</span>';
    if (k === 'in') return `<span class="pill p-in">${String(l.typeLabel).includes('Used') ? 'รับคืน (Used)' : 'รับเข้า'}</span>`;
    if (k === 'sale') {
        const c = l.closedAt ? new Date(l.closedAt) : null, d = logDate(l);
        const fromTrial = c && d && c - d > 60000;
        return `<span class="pill p-sale">ขาย${fromTrial ? ' (จากทดลอง)' : ''}</span>`;
    }
    return `<span class="pill p-done">${esc(l.typeLabel)}</span>`;
}
function qtySign(l) {
    if (l.status === 'CANCELLED' || l.direction === 'NONE') return { s: '', cls: 'q-none' };
    return l.direction === 'IN' ? { s: '+', cls: 'q-in' } : { s: '−', cls: 'q-out' };
}
function daysClass(n) { return n > TRIAL_ALERT_DAYS ? 'd-over' : (n > TRIAL_WARN_DAYS ? 'd-warn' : 'd-ok'); }

async function copyText(text) {
    try { await navigator.clipboard.writeText(text); }
    catch (e) {
        const el = document.createElement('textarea'); el.value = text; document.body.appendChild(el); el.select();
        document.execCommand('copy'); document.body.removeChild(el);
    }
    toast('คัดลอกแล้ว นำไปวางในแชท LINE ได้เลย');
}
function toast(text, icon) {
    Swal.fire({ toast: true, position: 'top', icon: icon || 'success', title: text, showConfirmButton: false, timer: 1800 });
}

// ============================================================
// เริ่มต้น / โหลดข้อมูล
// ============================================================
function init() {
    try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) { applyData(JSON.parse(cached)); hideLoading(); renderAll(); }
    } catch (e) { try { localStorage.removeItem(CACHE_KEY); } catch (_) { } }
    restoreAdminSession();
    renderAll();
    fetchData();
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => { }); });
    }
}
function applyData(data) {
    inventory = data.inventory || [];
    sales = data.sales || [];
    customers = data.customers || [];
    allLogs = data.logs || [];
    summary = data.summary || null;
    totalLogs = data.totalLogs || allLogs.length;
}
function hideLoading() {
    const el = document.getElementById('loading');
    if (!el || el.style.display === 'none') return;
    el.style.opacity = '0';
    setTimeout(() => { el.style.display = 'none'; }, 400);
}
async function fetchData() {
    const btn = document.getElementById('main-refresh');
    btn.classList.add('spinning');
    try {
        const res = await fetch(API_URL);
        const data = await res.json();
        if (data.status === 'error') throw new Error(data.message);
        applyData(data);
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch (e) { }
        renderAll();
    } catch (e) {
        console.error(e);
        if (!allLogs.length && !inventory.length) {
            Swal.fire('โหลดข้อมูลไม่สำเร็จ', 'ตรวจสอบอินเทอร์เน็ตแล้วกดปุ่มรีเฟรชอีกครั้ง', 'error');
        }
    } finally {
        hideLoading();
        btn.classList.remove('spinning');
    }
}

// ============================================================
// Admin
// ============================================================
const ICON_LOCK = '<svg viewBox="0 0 24 24"><path d="M12 1a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-1V6a5 5 0 0 0-5-5Zm3 8H9V6a3 3 0 0 1 6 0Z"/></svg>';
const ICON_UNLOCK = '<svg viewBox="0 0 24 24"><path d="M12 1a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2H9V6a3 3 0 0 1 5.75-1.19 1 1 0 0 0 1.87-.7A5 5 0 0 0 12 1Z"/></svg>';

function restoreAdminSession() {
    let ok = false;
    try {
        const s = JSON.parse(localStorage.getItem(ADMIN_SESSION_KEY) || 'null');
        if (s && s.token && s.expires > Date.now()) { adminToken = s.token; ok = true; }
        else localStorage.removeItem(ADMIN_SESSION_KEY);
    } catch (e) { }
    setAdminUI(ok);
}
function setAdminUI(on) {
    isAdmin = on;
    document.getElementById('admin-btn').innerHTML = on ? ICON_UNLOCK : ICON_LOCK;
    document.getElementById('admin-btn').setAttribute('aria-label', on ? 'ออกจากโหมด Admin' : 'เข้าสู่ระบบ Admin');
    document.getElementById('admin-chip').hidden = !on;
    document.getElementById('side-manage').hidden = !on;
    document.getElementById('hdr-manage').hidden = !on;
    if (!on) {
        adminToken = '';
        try { localStorage.removeItem(ADMIN_SESSION_KEY); } catch (e) { }
        if (currentPage === 'manage') showPage('dash');
    }
}
async function toggleAdmin() {
    if (isAdmin) { setAdminUI(false); renderAll(); toast('ออกจากโหมด Admin แล้ว', 'info'); return; }
    const { value: pass } = await Swal.fire({
        title: 'เข้าสู่ระบบ Admin', input: 'password', inputPlaceholder: 'รหัสผ่าน Admin',
        confirmButtonColor: '#0e4a38', confirmButtonText: 'เข้าสู่ระบบ', cancelButtonText: 'ยกเลิก', showCancelButton: true
    });
    if (!pass) return;
    Swal.fire({ title: 'กำลังตรวจสอบ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
        const res = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'adminLogin', password: pass }) });
        const r = await res.json();
        if (r.status === 'success' && r.token) {
            adminToken = r.token;
            try { localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify({ token: r.token, expires: r.expires })); } catch (e) { }
            Swal.close();
            setAdminUI(true); renderAll();
            toast('เข้าสู่โหมด Admin แล้ว');
        } else {
            Swal.fire({ icon: 'error', title: 'รหัสผ่านไม่ถูกต้อง' });
        }
    } catch (e) {
        Swal.fire({ icon: 'error', title: 'เชื่อมต่อไม่ได้', text: 'ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่' });
    }
}

// ============================================================
// ส่งคำสั่งไป Server (ทุกคำสั่งผ่านฟังก์ชันนี้ที่เดียว)
// ============================================================
async function syncAction(action, payload, successText) {
    Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
        const body = Object.assign({ action }, payload || {});
        if (isAdmin && adminToken) body.token = adminToken;
        const response = await fetch(API_URL, { method: 'POST', body: JSON.stringify(body) });
        const rawText = await response.text();
        let result;
        try { result = JSON.parse(rawText); }
        catch (parseErr) { throw new Error('เชื่อมต่อ Google Script ไม่ได้ตามที่คาด (ได้รับข้อมูลที่ไม่ใช่ JSON) — โปรดตรวจสอบว่า Deploy เวอร์ชันล่าสุดแล้ว และสิทธิ์การเข้าถึงตั้งเป็น "Anyone"'); }
        if (result.status === 'success') {
            await fetchData();
            Swal.close();
            toast(successText || 'บันทึกสำเร็จ');
            return true;
        }
        if (result.code === 'unauthorized') {
            setAdminUI(false); renderAll();
            Swal.fire('สิทธิ์ Admin หมดอายุ', 'กรุณากดรูปกุญแจเพื่อเข้าสู่ระบบ Admin ใหม่ แล้วทำรายการอีกครั้ง', 'warning');
            return false;
        }
        Swal.fire('ทำรายการไม่สำเร็จ', result.message || 'เกิดข้อผิดพลาด', 'error');
        return false;
    } catch (e) {
        console.error('Sync Error:', e);
        Swal.fire('แจ้งเตือน', e.message || 'ไม่สามารถเชื่อมต่อได้', 'error');
        return false;
    }
}

// ============================================================
// นำทาง
// ============================================================
function showPage(name) {
    if (name === 'manage' && !isAdmin) name = 'dash';
    currentPage = name;
    document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + name));
    document.querySelectorAll('[data-nav]').forEach(b => b.classList.toggle('on', b.dataset.nav === name));
    document.body.classList.toggle('rec-mode', name === 'rec');
    renderPage(name);
    renderCartBar();
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
}
function renderAll() { renderPage(currentPage); renderCartBar(); }
function renderPage(name) {
    if (name === 'dash') renderDash();
    else if (name === 'stock') renderStock();
    else if (name === 'hist') renderHist();
    else if (name === 'rec') renderRec();
    else if (name === 'exec') renderExec();
    else if (name === 'manage') renderManage();
}
function openSheet() { document.getElementById('sheet').classList.add('open'); document.getElementById('sheet-back').hidden = false; }
function closeSheet() { document.getElementById('sheet').classList.remove('open'); document.getElementById('sheet-back').hidden = true; }

function openItems() {
    if (summary && summary.open) return summary.open;
    return allLogs.filter(isOpen).map(l => Object.assign({}, l, { days: daysSince(logDate(l)) }));
}
function findLogById(id) { return allLogs.find(l => l.id === id) || (summary && summary.open || []).find(l => l.id === id); }

// ============================================================
// หน้าภาพรวม — ลูกค้าทดลองใช้งานอยู่บนสุด (เจ้านายเช็คทุกวัน)
// ============================================================
function trialCardsHtml(trials, withActions) {
    if (!trials.length) return '<div class="empty">ไม่มีลูกค้าที่ทดลองใช้งานอยู่ตอนนี้ 🎉</div>';
    return `<div class="trial-list">${trials.map(t => {
        const d = t.days ?? daysSince(logDate(t));
        const sent = logDate(t);
        return `<div class="trial ${d > TRIAL_ALERT_DAYS ? 'over' : ''}">
            <div class="days ${daysClass(d)}"><b>${d ?? '?'}</b><small>วัน</small></div>
            <div class="who"><b>${esc(t.cust)}</b>
                <div class="items">${esc(itemsText(t))}</div>
                <small>เซลล์ ${esc(t.sale || '-')} · ส่งเมื่อ ${thaiShort(sent)}${t.remark ? ' · 📝 ' + esc(t.remark) : ''}</small>
                ${withActions ? `<div class="acts"><button class="mini g" onclick="confirmTestToSale('${esc(t.id)}')">💰 ลูกค้าซื้อแล้ว</button><button class="mini s" onclick="returnTestItem('${esc(t.id)}')">🔄 รับคืน</button></div>` : ''}
            </div></div>`;
    }).join('')}</div>`;
}
function renderDash() {
    const el = document.getElementById('page-dash');
    const now = new Date();
    const open = openItems();
    const trials = open.filter(o => o.status === 'PENDING').slice().sort((a, b) => (b.days || 0) - (a.days || 0));
    const overdue = trials.filter(t => t.days > TRIAL_ALERT_DAYS);
    const trialQty = trials.reduce((a, t) => a + Number(t.qty || 0), 0);
    const claims = open.filter(o => o.status === 'WAITING_CLAIM' || o.status === 'WAITING_STOCK');
    const groups = groupStock();
    const low = groups.filter(g => g.low);
    const m = summary ? summary.month : null;
    const pct = m && m.lastMonth > 0 ? Math.round((m.thisMonth - m.lastMonth) / m.lastMonth * 100) : null;
    const nTotal = groups.reduce((a, g) => a + g.newQty, 0), uTotal = groups.reduce((a, g) => a + g.usedQty, 0);
    const todayLogs = allLogs.filter(l => sameDay(logDate(l), now)).slice().reverse();
    const hour = now.getHours();
    const greet = hour < 12 ? 'สวัสดีตอนเช้า' : hour < 17 ? 'สวัสดีตอนบ่าย' : 'สวัสดีตอนเย็น';

    const todo = [];
    claims.forEach(c => todo.push(`<div class="todo"><span class="dot" style="background:var(--purple)"></span><div><b>${c.status === 'WAITING_STOCK' ? 'เคลมรอของเข้า' : 'เคลมรอปิดงาน'} · ${esc(c.cust)}</b><small>${esc(itemsText(c))} · ${c.days ?? '?'} วัน</small></div>
        <button class="go" onclick="${c.status === 'WAITING_STOCK' ? `processStockClaim('${esc(c.id)}')` : `closeClaim('${esc(c.id)}')`}">${c.status === 'WAITING_STOCK' ? 'ตัดสต็อก ›' : 'ปิดงาน ›'}</button></div>`));
    if (low.length) todo.push(`<div class="todo"><span class="dot" style="background:var(--orange)"></span><div><b>ใกล้หมด ${low.length} รุ่น</b><small>${low.map(g => `${esc(g.key)} (${g.newQty})`).join(' · ')}</small></div><button class="go" onclick="stockFilter='low';showPage('stock')">ดูคลัง ›</button></div>`);

    el.innerHTML = `
    <div class="ptitle"><div><small>${greet} · ${TH_DAYS[now.getDay()]} ${thaiShort(now)}</small><h1>ภาพรวมวันนี้</h1></div></div>

    <div class="card trials" id="trial-section">
        <div class="trials-head">
            <div class="ic">🧪</div>
            <div><h2>ลูกค้าทดลองใช้งาน</h2><small>เรียงจากค้างนานที่สุด · ${TRIAL_WARN_DAYS} วันขึ้นไปเหลือง · เกิน ${TRIAL_ALERT_DAYS} วันแดง</small></div>
            <div class="trials-stats">
                <div class="tstat"><b>${trials.length}</b><small>ราย</small></div>
                <div class="tstat"><b>${fmtN(trialQty)}</b><small>ก้อน</small></div>
                <div class="tstat ${overdue.length ? 'alert' : ''}"><b>${overdue.length}</b><small>เกิน ${TRIAL_ALERT_DAYS} วัน</small></div>
            </div>
        </div>
        ${trialCardsHtml(trials, true)}
    </div>

    <div class="kpis">
        <div class="kpi" style="--c:var(--accent)"><small>ขายเดือนนี้</small><b>${m ? fmtN(m.thisMonth) : '-'} <span class="u">ก้อน</span></b><em class="${pct === null ? 'muted' : (pct >= 0 ? 'up' : 'down')}">${pct === null ? (m ? 'เดือนก่อน ' + fmtN(m.lastMonth) : '') : (pct >= 0 ? '▲ ' : '▼ ') + Math.abs(pct) + '% จากเดือนก่อน'}</em></div>
        <div class="kpi" style="--c:var(--orange)"><small>ทดลองอยู่ที่ลูกค้า</small><b>${trials.length} <span class="u">ราย</span></b><em class="${overdue.length ? 'down' : 'muted'}">${overdue.length ? overdue.length + ' รายเกิน ' + TRIAL_ALERT_DAYS + ' วัน' : 'ไม่มีค้างนาน'}</em></div>
        <div class="kpi" style="--c:var(--purple)"><small>รอเคลม</small><b>${claims.length} <span class="u">ราย</span></b><em class="muted">${claims.filter(c => c.status === 'WAITING_STOCK').length} รายรอของเข้า</em></div>
        <div class="kpi" style="--c:var(--primary)"><small>คงเหลือในคลัง</small><b>${fmtN(nTotal + uTotal)} <span class="u">ก้อน</span></b><em class="muted">New ${fmtN(nTotal)} · Used ${fmtN(uTotal)}</em></div>
    </div>

    <div class="grid2">
        <div class="card"><h2>🔔 ต้องดำเนินการ</h2>${todo.join('') || '<div class="empty">ไม่มีเรื่องค้าง</div>'}</div>
        <div class="card"><h2>📅 ความเคลื่อนไหววันนี้ <button class="more" onclick="histState.period='today';showPage('hist')">ดูทั้งหมด ›</button></h2>
            ${todayLogs.length ? todayLogs.slice(0, 8).map(l => {
        const q = qtySign(l), k = kindOf(l);
        return `<div class="list-row"><div class="avatar a-${k}">${KIND_ICON[k]}</div><div class="lr-main"><b>${esc(l.cust)}</b><small>${esc(itemsText(l))}</small></div><div class="lr-end"><b class="${q.cls}">${q.s}${fmtN(l.qty)}</b><small>${thaiTime(logDate(l))}</small></div></div>`;
    }).join('') : '<div class="empty">วันนี้ยังไม่มีรายการ</div>'}
        </div>
    </div>

    <div class="card"><h2>📦 สต็อกคงเหลือ <button class="more" onclick="showPage('stock')">ดูคลัง ›</button></h2>
        ${groups.map(g => `<div class="list-row"><div class="lr-main"><b>${esc(g.key)} ${g.low ? '<span class="pill p-low">ใกล้หมด</span>' : ''}</b><small>New ${fmtN(g.newQty)} · Used ${fmtN(g.usedQty)}</small></div><div class="lr-end"><b>${fmtN(g.newQty + g.usedQty)}</b><small>ก้อน</small></div></div>`).join('') || '<div class="empty">ยังไม่มีสินค้า</div>'}
        <button class="btn-line" onclick="copyReport()">📋 คัดลอกรายงานสต็อก ส่ง LINE</button>
    </div>`;
}

// ============================================================
// คลังสินค้า — การ์ด New | Used กดเพื่อดูประวัติรุ่น
// ============================================================
let stockFilter = 'all', stockQuery = '';
function renderStock() {
    const el = document.getElementById('page-stock');
    const groups = groupStock();
    const n = groups.reduce((a, g) => a + g.newQty, 0), u = groups.reduce((a, g) => a + g.usedQty, 0);
    const lowN = groups.filter(g => g.low).length;
    const list = groups.filter(g => g.key.toLowerCase().includes(stockQuery.toLowerCase())).filter(g => stockFilter !== 'low' || g.low);
    // ช่องค้นหาคงไว้ตัวเดิม (เหตุผลเดียวกับหน้าประวัติ — คีย์บอร์ดบนจอไม่ปิดเอง)
    if (!document.getElementById('stock-q')) {
        el.innerHTML = `
    <div class="ptitle"><h1>คลังสินค้า</h1><small id="stock-sub"></small></div>
    <div class="stock-sum" id="stock-sum"></div>
    <div class="toolbar">
        <label class="search">🔍<input id="stock-q" type="search" placeholder="ค้นหารุ่น / เบอร์" autocomplete="off" enterkeyhint="search"></label>
        <div class="chips" id="stock-chips"></div>
    </div>
    <div class="sgrid" id="stock-grid"></div>`;
        const q = document.getElementById('stock-q');
        q.value = stockQuery;
        q.addEventListener('input', e => { stockQuery = e.target.value; renderStock(); });
    }
    document.getElementById('stock-sub').textContent = `${groups.length} รุ่น · กดการ์ดเพื่อดูประวัติรุ่น`;
    document.getElementById('stock-sum').innerHTML = `
        <div><small>New</small><b style="color:var(--primary)">${fmtN(n)}</b></div>
        <div><small>Used</small><b style="color:#a35f12">${fmtN(u)}</b></div>
        <div><small>รวม</small><b>${fmtN(n + u)}</b></div>
        <div class="pc-only"><small>ใกล้หมด</small><b style="color:#a35f12">${lowN} รุ่น</b></div>`;
    document.getElementById('stock-chips').innerHTML = `
            <button class="chip ${stockFilter !== 'low' ? 'on' : ''}" onclick="stockFilter='all';renderStock()">ทั้งหมด <span class="n">${groups.length}</span></button>
            <button class="chip ${stockFilter === 'low' ? 'on' : ''}" onclick="stockFilter='low';renderStock()"><span class="sw" style="background:var(--orange)"></span>ใกล้หมด <span class="n">${lowN}</span></button>`;
    document.getElementById('stock-grid').innerHTML = `${list.map(g => {
        const pct = Math.min(100, g.minStock > 0 ? g.newQty / (g.minStock * 2.5) * 100 : 100);
        const idx = groups.indexOf(g);
        return `<button class="scard ${g.low ? 'low' : ''}" onclick="openModelHistory(${idx})">
            <div class="scard-h"><span class="model">${esc(g.model)}</span><span class="grit">#${esc(g.grit)}</span>${g.low ? '<span class="pill p-low">ใกล้หมด</span>' : ''}<div class="total"><small>รวม</small><b>${fmtN(g.newQty + g.usedQty)}</b></div></div>
            <div class="nu">
                <div class="new"><span class="lab"><i></i>NEW</span><span class="v">${fmtN(g.newQty)}</span><div class="meter"><i style="width:${pct}%"></i></div>
                    <span class="hint">${g.weeksLeft !== null && g.weeksLeft !== undefined ? `พอขายราว ${g.weeksLeft} สัปดาห์` : 'ยังไม่มียอดขาย 4 สัปดาห์'} · เกณฑ์ ≤ ${g.minStock}</span></div>
                <div class="used"><span class="lab"><i></i>USED</span><span class="v">${fmtN(g.usedQty)}</span><span class="hint" style="margin-top:12px">หินรับคืน / ทดลองคืน</span></div>
            </div>
            <span class="scard-tap">ดูประวัติรุ่นนี้ ›</span>
        </button>`;
    }).join('') || '<div class="card empty">ไม่พบรุ่นที่ค้นหา</div>'}`;
}

async function openModelHistory(idx) {
    const g = groupStock()[idx]; if (!g) return;
    const slot = document.getElementById('modal-slot');
    slot.innerHTML = `<div class="modal-back" onclick="if(event.target===this)closeModal()"><div class="modal" role="dialog" aria-label="ประวัติรุ่น ${esc(g.key)}">
        <div class="modal-h"><span class="model">${esc(g.model)}</span><span class="grit">#${esc(g.grit)}</span><button class="x" onclick="closeModal()" aria-label="ปิด">✕</button></div>
        <div id="model-body"><div class="empty">กำลังโหลดประวัติของรุ่นนี้...</div></div></div></div>`;
    document.addEventListener('keydown', escClose);
    let logs;
    try {
        const res = await fetch(`${API_URL}?type=model&model=${encodeURIComponent(g.model)}&grit=${encodeURIComponent(g.grit)}`);
        const r = await res.json();
        logs = r.logs || [];
    } catch (e) {
        logs = allLogs.filter(l => parseItems(l.item, l.typeLabel).some(it => it.model === g.model && it.grit === g.grit));
    }
    const body = document.getElementById('model-body'); if (!body) return;
    const now = new Date();
    const mStart = new Date(now.getFullYear(), now.getMonth(), 1), yStart = new Date(now.getFullYear(), 0, 1);
    const qtyOf = l => parseItems(l.item, l.typeLabel).filter(it => it.model === g.model && it.grit === g.grit).reduce((a, it) => a + it.qty, 0);
    const live = logs.filter(l => l.status !== 'CANCELLED');
    const saleDate = l => (l.closedAt ? new Date(l.closedAt) : logDate(l));
    const sold = live.filter(l => l.typeLabel === 'ขายสินค้า');
    const soldMonth = sold.filter(l => saleDate(l) >= mStart).reduce((a, l) => a + qtyOf(l), 0);
    const soldYear = sold.filter(l => saleDate(l) >= yStart).reduce((a, l) => a + qtyOf(l), 0);
    const lastIn = live.filter(l => l.direction === 'IN').map(logDate).filter(Boolean).sort((a, b) => b - a)[0];
    const buyers = {};
    sold.filter(l => saleDate(l) >= yStart).forEach(l => { buyers[l.cust] = (buyers[l.cust] || 0) + qtyOf(l); });
    const topBuyers = Object.entries(buyers).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const onTrial = live.filter(l => l.status === 'PENDING');
    body.innerHTML = `
        <div class="kpis">
            <div class="kpi" style="--c:var(--primary)"><small>คงเหลือ</small><b>${fmtN(g.newQty + g.usedQty)}</b><em class="muted">New ${g.newQty} · Used ${g.usedQty}</em></div>
            <div class="kpi" style="--c:var(--accent)"><small>ขายเดือนนี้</small><b>${fmtN(soldMonth)}</b><em class="muted">ปีนี้ ${fmtN(soldYear)} ก้อน</em></div>
            <div class="kpi" style="--c:var(--orange)"><small>อยู่ที่ลูกค้า (ทดลอง)</small><b>${fmtN(onTrial.reduce((a, l) => a + qtyOf(l), 0))}</b><em class="muted">${onTrial.length} ราย</em></div>
            <div class="kpi" style="--c:var(--purple)"><small>รับเข้าล่าสุด</small><b style="font-size:18px">${lastIn ? thaiShort(lastIn) : '-'}</b><em class="muted">${g.weeklyRate ? 'ขายเฉลี่ย ' + g.weeklyRate + ' ก้อน/สัปดาห์' : '&nbsp;'}</em></div>
        </div>
        ${topBuyers.length ? `<div class="card"><h2>🏢 ลูกค้าที่ซื้อรุ่นนี้ (ปีนี้)</h2><table class="data-table"><tbody>${topBuyers.map(([c, q]) => `<tr><td>${esc(c)}</td><td class="num"><b>${fmtN(q)}</b> ก้อน</td></tr>`).join('')}</tbody></table></div>` : ''}
        <div class="card"><h2>🕒 ความเคลื่อนไหวล่าสุด</h2>
            ${logs.slice().reverse().slice(0, 20).map(l => {
        const q = qtySign(l), k = kindOf(l), d = logDate(l);
        return `<div class="list-row"><div class="avatar a-${k}">${KIND_ICON[k]}</div><div class="lr-main"><b>${esc(l.cust)}</b><small>${statusPill(l)} ${thaiShort(d)}</small></div><div class="lr-end"><b class="${q.cls}">${q.s}${fmtN(qtyOf(l))}</b><small>${esc(l.sale || '')}</small></div></div>`;
    }).join('') || '<div class="empty">ยังไม่มีประวัติ</div>'}
        </div>`;
}
function escClose(e) { if (e.key === 'Escape') closeModal(); }
function closeModal() { document.getElementById('modal-slot').innerHTML = ''; document.removeEventListener('keydown', escClose); }

// ============================================================
// ประวัติ — ตัวกรองตามประเภท / ช่วงเวลา / เซลล์ / คำค้น
// ============================================================
const histState = { kind: 'all', period: 'all', date: '', seller: 'all', q: '', limit: 40 };
const KIND_FILTERS = [['all', 'ทั้งหมด', ''], ['sale', 'ขาย', 'var(--red)'], ['in', 'รับเข้า', 'var(--accent)'], ['trial', 'ทดลอง', 'var(--orange)'],
    ['claim', 'เคลม', 'var(--purple)'], ['open', 'ค้างดำเนินการ', 'var(--rose)'], ['cancel', 'ยกเลิก', '#9aa39f']];

function histBaseFilter(l) {
    const st = histState, d = logDate(l), now = new Date();
    if (st.period === 'today' && !sameDay(d, now)) return false;
    if (st.period === '7' && !(d && daysSince(d) <= 6)) return false;
    if (st.period === 'month' && !(d && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear())) return false;
    if (st.period === 'date' && st.date) { const [y, m, dd] = st.date.split('-').map(Number); if (!sameDay(d, new Date(y, m - 1, dd))) return false; }
    if (st.seller !== 'all' && l.sale !== st.seller) return false;
    if (st.q) {
        const t = st.q.toLowerCase();
        if (![l.item, l.cust, l.sale, l.remark, l.id].some(v => String(v || '').toLowerCase().includes(t))) return false;
    }
    return true;
}
function kindMatch(l, k) { return k === 'all' ? true : k === 'open' ? isOpen(l) : kindOf(l) === k; }

function renderHist() {
    const el = document.getElementById('page-hist');
    const st = histState;
    const base = allLogs.filter(histBaseFilter);
    // เรียงใหม่สุดก่อนตามวันที่จริง (แถวในชีตอาจไม่เรียงตามเวลา) — วันเดียวกันใช้ลำดับแถวเดิม
    const list = base.filter(l => kindMatch(l, st.kind)).map((l, i) => [l, i, (logDate(l) || new Date(0)).getTime()])
        .sort((a, b) => (b[2] - a[2]) || (b[1] - a[1])).map(x => x[0]);
    const total = list.filter(l => l.status !== 'CANCELLED').reduce((a, l) => a + Number(l.qty || 0), 0);
    const sellers = [...new Set(allLogs.map(l => l.sale).filter(Boolean).concat(sales))];
    const shown = list.slice(0, st.limit);
    const groups = [];
    shown.forEach(l => {
        const d = logDate(l); const key = d ? startOfDay(d).getTime() : 0;
        let g = groups.find(x => x.key === key); if (!g) { g = { key, d, rows: [] }; groups.push(g); }
        g.rows.push(l);
    });
    const filtered = st.kind !== 'all' || st.period !== 'all' || st.seller !== 'all' || st.q;
    // ช่องค้นหาสร้างครั้งเดียวแล้วคงไว้ — ถ้าสร้างใหม่ทุกครั้งที่พิมพ์ คีย์บอร์ดบนจอ (TV / Android) จะปิดเองหลังพิมพ์ 1 ตัว
    if (!document.getElementById('hist-q')) {
        el.innerHTML = `
    <div class="ptitle"><h1>ประวัติ</h1><small id="hist-sub"></small></div>
    <div class="hist-layout">
        <div class="filters">
            <label class="search">🔍<input id="hist-q" type="search" placeholder="ลูกค้า รุ่น เซลล์ หมายเหตุ" autocomplete="off" list="hist-cust-list" enterkeyhint="search"></label>
            <datalist id="hist-cust-list"></datalist>
            <div id="hist-ctrl" style="display:flex;flex-direction:column;gap:10px"></div>
        </div>
        <div style="display:flex;flex-direction:column;gap:10px;min-width:0">
            <div id="cust-card"></div>
            <div id="hist-results" style="display:flex;flex-direction:column;gap:10px;min-width:0"></div>
        </div>
    </div>`;
        const q = document.getElementById('hist-q');
        q.value = st.q;
        q.addEventListener('input', e => { st.q = e.target.value; st.limit = 40; renderHist(); });
    }
    const qEl = document.getElementById('hist-q');
    if (qEl.value !== st.q) qEl.value = st.q;
    document.getElementById('hist-sub').textContent = `${fmtN(allLogs.length)} รายการล่าสุด${totalLogs > allLogs.length ? ` จากทั้งหมด ${fmtN(totalLogs)}` : ''}`;
    const dl = customers.map(c => `<option value="${esc(c)}">`).join('');
    const dlEl = document.getElementById('hist-cust-list');
    if (dlEl.innerHTML !== dl) dlEl.innerHTML = dl;
    document.getElementById('hist-ctrl').innerHTML = `
            <div class="chips">${KIND_FILTERS.map(([k, t, c]) => `<button class="chip ${st.kind === k ? 'on' : ''}" onclick="histState.kind='${k}';histState.limit=40;renderHist()">${c ? `<span class="sw" style="background:${c}"></span>` : ''}${t} <span class="n">${base.filter(l => kindMatch(l, k)).length}</span></button>`).join('')}</div>
            <div class="frow">
                <select class="sel" id="hist-period" aria-label="ช่วงเวลา">
                    ${[['all', 'ทุกช่วงเวลา'], ['today', 'วันนี้'], ['7', '7 วันล่าสุด'], ['month', 'เดือนนี้'], ['date', 'เลือกวันที่...']].map(([v, t]) => `<option value="${v}" ${st.period === v ? 'selected' : ''}>${t}</option>`).join('')}
                </select>
                ${st.period === 'date' ? `<input class="sel" type="date" id="hist-date" value="${esc(st.date)}">` : ''}
                <select class="sel" id="hist-seller" aria-label="เซลล์"><option value="all">ทุกเซลล์</option>${sellers.map(s => `<option value="${esc(s)}" ${st.seller === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>
            </div>`;
    document.getElementById('hist-results').innerHTML = `
            <div class="result"><span>พบ ${fmtN(list.length)} รายการ · รวม ${fmtN(total)} ก้อน</span>${filtered ? '<button onclick="clearHist()">ล้างตัวกรอง</button>' : ''}</div>
            ${groups.length ? groups.map(g => `<div class="day"><span>${g.d ? dayLabel(g.d) : 'ไม่ทราบวันที่'}</span><span>${g.rows.length} รายการ</span></div><div class="hlist">${g.rows.map(histRowHtml).join('')}</div>`).join('') : '<div class="card empty">ไม่พบรายการที่ตรงกับตัวกรอง</div>'}
            ${list.length > st.limit ? `<button class="btn-more" onclick="histState.limit+=40;renderHist()">ดูเพิ่ม (เหลืออีก ${fmtN(list.length - st.limit)} รายการ)</button>` : ''}`;
    document.getElementById('hist-period').onchange = e => { st.period = e.target.value; st.limit = 40; renderHist(); };
    const dt = document.getElementById('hist-date'); if (dt) dt.onchange = e => { st.date = e.target.value; renderHist(); };
    document.getElementById('hist-seller').onchange = e => { st.seller = e.target.value; st.limit = 40; renderHist(); };
    renderCustomerCard(st.q.trim());
}
function clearHist() { Object.assign(histState, { kind: 'all', period: 'all', date: '', seller: 'all', q: '', limit: 40 }); renderHist(); }

function histRowHtml(l) {
    const q = qtySign(l), k = kindOf(l), d = logDate(l), id = esc(l.id);
    const acts = [];
    if (l.status === 'PENDING') acts.push(`<button class="mini g" onclick="confirmTestToSale('${id}')">💰 ลูกค้าซื้อแล้ว</button><button class="mini s" onclick="returnTestItem('${id}')">🔄 รับคืน</button>`);
    if (l.status === 'WAITING_CLAIM') acts.push(`<button class="mini p" onclick="closeClaim('${id}')">📦 ปิดงานเคลม</button>`);
    if (l.status === 'WAITING_STOCK') acts.push(`<button class="mini r" onclick="processStockClaim('${id}')">⚡ ของเข้าแล้ว ตัดสต็อก</button>`);
    if (isAdmin && l.status !== 'CANCELLED') {
        acts.push(`<button class="link" onclick="editRemark('${id}')">แก้หมายเหตุ</button>`);
        if (!['RETURNED', 'CLAIMED'].includes(l.status)) acts.push(`<button class="link danger" onclick="cancelLog('${id}')">ยกเลิกรายการ</button>`);
    }
    return `<div class="hrow ${k === 'cancel' ? 'cancelled' : ''}">
        <div class="avatar a-${k}">${KIND_ICON[k]}</div>
        <div><div class="head">${statusPill(l)}<b>${esc(l.cust)}</b></div>
            <div class="items">${esc(itemsText(l))}</div>
            <div class="meta">${d ? thaiTime(d) : esc(l.date)} · เซลล์ ${esc(l.sale || '-')} · <span class="mono">${id}</span></div>
            ${l.remark ? `<div class="note">📝 ${esc(l.remark)}</div>` : ''}
            ${l.status === 'CANCELLED' ? `<div class="note cancel">ยกเลิกแล้ว${l.cancelReason ? ' · ' + esc(l.cancelReason) : ''}</div>` : ''}
            ${acts.length ? `<div class="acts">${acts.join('')}</div>` : ''}
        </div>
        <b class="q ${q.cls}">${q.s}${fmtN(l.qty)}</b>
    </div>`;
}

// ค้นประวัติลูกค้า — พิมพ์ชื่อตรงกับรายชื่อลูกค้า จะดึงประวัติทั้งหมดของลูกค้ารายนั้นจาก Server
let custLookup = { name: '', data: null };
async function renderCustomerCard(text) {
    const box = document.getElementById('cust-card');
    if (!box) return;
    const name = customers.find(c => String(c).trim().toLowerCase() === text.toLowerCase());
    if (!name) { box.innerHTML = ''; return; }
    if (custLookup.name !== name) {
        custLookup = { name, data: null };
        box.innerHTML = `<div class="card cust-card"><h2>👤 ${esc(name)}</h2><div class="empty">กำลังโหลดประวัติทั้งหมดของลูกค้า...</div></div>`;
        let data;
        try {
            const res = await fetch(`${API_URL}?type=customer&name=${encodeURIComponent(name)}`);
            data = (await res.json()).logs || [];
        } catch (e) { data = allLogs.filter(l => l.cust === name); }
        if (custLookup.name !== name) return;
        custLookup.data = data;
    }
    if (!custLookup.data) return;
    const b = document.getElementById('cust-card'); if (!b) return;
    const logs = custLookup.data.filter(l => l.status !== 'CANCELLED');
    const sold = logs.filter(l => l.typeLabel === 'ขายสินค้า');
    const total = sold.reduce((s, l) => s + (Number(l.qty) || 0), 0);
    const dates = sold.map(l => (l.closedAt ? new Date(l.closedAt) : logDate(l))).filter(Boolean).sort((a, b2) => a - b2);
    const last = dates[dates.length - 1];
    const gap = dates.length > 1 ? Math.round((dates[dates.length - 1] - dates[0]) / 86400000 / (dates.length - 1)) : null;
    const openN = logs.filter(isOpen).length;
    const byModel = {};
    sold.forEach(l => parseItems(l.item, l.typeLabel).forEach(it => {
        const k = `${it.model} #${it.grit} ${it.condition}`, d = l.closedAt ? new Date(l.closedAt) : logDate(l);
        if (!byModel[k]) byModel[k] = { q: 0, last: null };
        byModel[k].q += it.qty;
        if (d && (!byModel[k].last || d > byModel[k].last)) byModel[k].last = d;
    }));
    const rows = Object.entries(byModel).sort((a, c) => c[1].q - a[1].q);
    b.innerHTML = `<div class="card cust-card">
        <h2>👤 ${esc(name)} <span class="muted" style="font-size:12px;font-weight:600">ประวัติทั้งหมด ${fmtN(custLookup.data.length)} รายการ</span></h2>
        <div class="kpis">
            <div class="kpi" style="--c:var(--accent)"><small>ซื้อแล้วทั้งหมด</small><b>${fmtN(total)}</b><em class="muted">ก้อน${dates[0] ? ' · ตั้งแต่ ' + thaiShort(dates[0]) : ''}</em></div>
            <div class="kpi" style="--c:var(--primary)"><small>ซื้อล่าสุด</small><b style="font-size:18px">${last ? thaiShort(last) : '-'}</b><em class="muted">${gap !== null ? 'ห่างกันเฉลี่ย ' + gap + ' วัน' : '&nbsp;'}</em></div>
            <div class="kpi" style="--c:var(--orange)"><small>ทดลอง / เคลมค้าง</small><b>${openN}</b><em class="${openN ? 'down' : 'up'}">${openN ? 'มีรายการค้าง' : 'ไม่มีค้าง'}</em></div>
        </div>
        ${rows.length ? `<div class="table-scroll"><table class="data-table"><thead><tr><th>รุ่น</th><th class="num">ซื้อรวม</th><th class="num">ครั้งล่าสุด</th></tr></thead><tbody>${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num">${fmtN(v.q)}</td><td class="num">${thaiShort(v.last)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">ยังไม่มีประวัติการซื้อ</div>'}
    </div>`;
}

// ============================================================
// บันทึกรายการแบบตะกร้า (ผสมหลายรุ่น / New+Used ได้ในบิลเดียว)
// ============================================================
const REC_TYPES = { sale: 'ขายสินค้า', trial: 'ส่งทดลอง', in: 'รับเข้า', claim: 'เคลม' };
const REC_SHORT = { sale: 'ขาย', trial: 'ทดลอง', in: 'รับเข้า', claim: 'เคลม' };
const rec = { type: 'sale', cond: 'New', cart: {}, cust: '', sale: '', remark: '', cartOpen: false };

function startRec(type) {
    closeSheet();
    // เปลี่ยนประเภทระหว่างทาง: เก็บตะกร้าไว้ (เผื่อกดเลือกประเภทผิด) แล้วตรวจจำนวนใหม่ตอนยืนยัน
    rec.type = type;
    rec.cartOpen = false;
    if (type === 'claim') rec.cond = 'New';
    showPage('rec');
}
function recIsOut() { return rec.type === 'sale' || rec.type === 'trial'; }
function cartEntries() { return Object.entries(rec.cart).filter(([, v]) => v > 0); }
function cartTotal() { return cartEntries().reduce((a, [, v]) => a + v, 0); }
function keyParts(k) { const [mg, cond] = k.split('|'); const [model, grit] = mg.split(' #'); return { model, grit, cond }; }

function setQty(key, qty) {
    const { model, grit, cond } = keyParts(key);
    let q = Math.max(0, Math.floor(Number(qty) || 0));
    if (recIsOut()) q = Math.min(q, stockQty(model, grit, cond));
    if (q) rec.cart[key] = q; else delete rec.cart[key];
    const y = window.scrollY;
    renderRec(); renderCartBar();
    window.scrollTo(0, y);
}
function renderRec() {
    const el = document.getElementById('page-rec');
    const out = recIsOut();
    const groups = groupStock();
    const items = cartEntries();
    const total = cartTotal();
    const shortClaim = rec.type === 'claim' && items.some(([k, v]) => { const p = keyParts(k); return v > stockQty(p.model, p.grit, p.cond); });
    const plist = groups.map(g => {
        const key = `${g.model} #${g.grit}|${rec.cond}`;
        const have = stockQty(g.model, g.grit, rec.cond);
        const q = rec.cart[key] || 0;
        const disabled = out && have === 0;
        const ka = esc(key).replace(/'/g, '&#39;');
        return `<div class="prow ${disabled ? 'dis' : ''}"><div class="pm"><b>${esc(g.key)}</b> <span class="pill ${rec.cond === 'New' ? 'p-in' : 'p-trial'}">${rec.cond}</span>
            <small>คงเหลือ ${fmtN(have)} ก้อน${rec.type === 'claim' && q > have ? ' · <span class="warn">ไม่พอ จะบันทึกเป็นรอของเข้า</span>' : ''}</small></div>
            ${disabled ? '<span class="muted" style="font-size:12px">หมด</span>' : q ? `<div class="step"><button onclick="setQty('${ka}', ${q - 1})" aria-label="ลด">−</button><input type="number" inputmode="numeric" min="0" value="${q}" aria-label="จำนวน ${esc(g.key)}" onchange="setQty('${ka}', this.value)"><button onclick="setQty('${ka}', ${q + 1})" ${out && q >= have ? 'disabled' : ''} aria-label="เพิ่ม">＋</button></div>`
                : `<button class="addbtn" onclick="setQty('${ka}', 1)">＋ ใส่ตะกร้า</button>`}</div>`;
    }).join('');
    const cartHtml = cls => `<div class="cartbox ${cls}" ${cls === '' ? 'id="cart-mobile"' : ''}>
        <h3><span>🛒 ตะกร้า</span><span class="muted" style="font-size:13px">${items.length} รายการ</span></h3>
        ${items.length ? items.map(([k, v]) => { const p = keyParts(k); const ka = esc(k).replace(/'/g, '&#39;'); return `<div class="citem"><span>${esc(p.model)} #${esc(p.grit)} · ${esc(p.cond)}</span><span><b>× ${v}</b> <button class="link danger" onclick="setQty('${ka}', 0)">ลบ</button></span></div>`; }).join('') : '<div class="empty" style="padding:14px">ยังไม่มีสินค้า เลือกจากรายการ</div>'}
        ${items.length ? `<div class="ctotal"><span>รวม</span><span>${fmtN(total)} ก้อน</span></div>` : ''}
        ${shortClaim ? '<div class="notice" style="margin-top:8px">มีรุ่นที่ของไม่พอ ระบบจะบันทึกเคลมนี้เป็น “รอของเข้า” ยังไม่ตัดสต็อก</div>' : ''}
        <div class="field" style="margin-top:12px"><label for="rec-remark${cls}">หมายเหตุ</label><input id="rec-remark${cls}" value="${esc(rec.remark)}" placeholder="${rec.type === 'claim' ? 'อาการเสีย หรือข้อมูลเพิ่มเติม' : 'เช่น ส่งพร้อมใบกำกับ'}" oninput="rec.remark=this.value"></div>
        <button class="confirm" ${items.length ? '' : 'disabled'} onclick="submitRec()">✅ ยืนยัน${REC_TYPES[rec.type]}${total ? ' ' + fmtN(total) + ' ก้อน' : ''}</button>
    </div>`;
    el.innerHTML = `
    <div class="rec-head"><button class="back" onclick="showPage('dash')" aria-label="กลับ">‹</button><div><small class="muted">บันทึกรายการ</small><h1 style="margin:0;font-size:20px;color:var(--primary)">${REC_TYPES[rec.type]}</h1></div></div>
    <div class="typeseg">${Object.keys(REC_TYPES).map(t => `<button class="${t === rec.type ? 'on' : ''}" onclick="rec.type='${t}';if(rec.type==='claim')rec.cond='New';renderRec();renderCartBar()">${KIND_ICON[t]} ${REC_SHORT[t]}</button>`).join('')}</div>
    <div class="fields">
        <div class="field"><label for="rec-cust">${rec.type === 'in' ? 'รับจาก (Supplier / ลูกค้าที่คืน)' : 'ลูกค้า / โรงสี'}</label><input id="rec-cust" value="${esc(rec.cust)}" placeholder="พิมพ์ชื่อ..." autocomplete="off" oninput="rec.cust=this.value" onkeyup="handleCustomerInput(this)"><datalist id="cust-list">${customers.map(c => `<option value="${esc(c)}">`).join('')}</datalist></div>
        <div class="field"><label for="rec-sale">เซลล์ / ผู้ทำรายการ</label><select id="rec-sale" onchange="rec.sale=this.value">${sales.map(s => `<option value="${esc(s)}" ${rec.sale === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></div>
    </div>
    ${rec.type === 'trial' ? '<div class="notice">ส่งทดลองหลายรุ่นในครั้งเดียวได้ · ตอนปิดงานจะปิดทั้งรายการ (ลูกค้าซื้อทั้งหมด หรือคืนทั้งหมด)</div>' : ''}
    ${rec.type === 'in' && rec.cond === 'Used' ? '<div class="notice">รับคืนเป็น Used — ถ้าเป็นของทดลองที่ลูกค้าคืน ให้กด “รับคืน” ที่รายการทดลองแทน สต็อกจะไม่ซ้ำ</div>' : ''}
    <div class="rec-layout">
        <div style="display:flex;flex-direction:column;gap:10px;min-width:0">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><b style="font-size:15px">เลือกสินค้า</b>
                ${rec.type === 'claim' ? '<span class="muted" style="font-size:12px">เคลมเปลี่ยนเป็นหิน New</span>' : `<div class="cond">${['New', 'Used'].map(c => `<button class="${c === rec.cond ? 'on' : ''}" onclick="rec.cond='${c}';renderRec()">${c}</button>`).join('')}</div>`}</div>
            <div class="plist">${plist || '<div class="empty">ยังไม่มีรุ่นหินในระบบ (Admin เพิ่มได้ที่ตั้งค่า)</div>'}</div>
            <small class="muted">${rec.type === 'claim' ? '' : 'สลับ New / Used แล้วเลือกต่อได้ ตะกร้าเก็บรายการไว้ทั้งหมด'}</small>
        </div>
        <div class="rec-side">${cartHtml('desk')}</div>
    </div>
    <div class="mobile-only">${rec.cartOpen ? cartHtml('') : ''}</div>`;
    if (!rec.sale && sales.length) { rec.sale = sales[0]; }
}
function renderCartBar() {
    const slot = document.getElementById('cartbar-slot');
    if (currentPage !== 'rec') { slot.innerHTML = ''; return; }
    const n = cartEntries().length;
    slot.innerHTML = `<div class="cartbar mobile-only"><div class="cnt">🛒 ${n} รายการ<b>${fmtN(cartTotal())} ก้อน</b></div>
        <button ${n ? '' : 'disabled'} onclick="rec.cartOpen=!rec.cartOpen;renderRec();renderCartBar();if(rec.cartOpen){const c=document.getElementById('cart-mobile');if(c)c.scrollIntoView({behavior:'smooth'})}">${rec.cartOpen ? 'ซ่อนตะกร้า' : 'ดูตะกร้า / ยืนยัน'}</button></div>`;
}
/** ช่องชื่อลูกค้า: คอมใช้รายการแนะนำ (datalist) ส่วนมือถือเติมชื่อให้อัตโนมัติขณะพิมพ์ (พฤติกรรมเดิม) */
function handleCustomerInput(input) {
    if (window.innerWidth <= 768) {
        input.removeAttribute('list');
        setTimeout(() => {
            const val = input.value.trim();
            if (val.length < 2) return;
            const match = customers.find(c => String(c).toLowerCase().startsWith(val.toLowerCase()));
            if (match && match.length > val.length) {
                const start = input.selectionStart;
                input.value = match; rec.cust = match;
                input.setSelectionRange(start, match.length);
            }
        }, 10);
    } else {
        input.setAttribute('list', 'cust-list');
    }
}
async function submitRec() {
    const cust = (rec.cust || '').trim();
    const items = cartEntries();
    if (!cust) { Swal.fire('กรุณาใส่ชื่อลูกค้า', '', 'warning'); return; }
    if (!items.length) { Swal.fire('ตะกร้ายังว่าง', 'กรุณาเลือกสินค้าอย่างน้อย 1 รายการ', 'warning'); return; }
    if (!rec.sale && sales.length) rec.sale = sales[0];
    // ตรวจของพออีกรอบ (ยอดอาจเปลี่ยนหลังเลือกใส่ตะกร้า)
    if (recIsOut()) {
        const short = items.filter(([k, v]) => { const p = keyParts(k); return v > stockQty(p.model, p.grit, p.cond); });
        if (short.length) { Swal.fire('สต็อกไม่พอ', short.map(([k]) => k.replace('|', ' ')).join(', '), 'error'); return; }
    }
    const itemStr = items.map(([k, v]) => { const p = keyParts(k); return `${p.model} #${p.grit} (${p.cond}) x${v}`; }).join(', ');
    const total = cartTotal();
    let typeLabel, direction;
    if (rec.type === 'sale') { typeLabel = 'ขายสินค้า'; direction = 'OUT'; }
    else if (rec.type === 'trial') { typeLabel = 'ส่งทดลองใช้งาน'; direction = 'OUT'; }
    else if (rec.type === 'in') { typeLabel = items.every(([k]) => k.endsWith('|Used')) ? 'รับคืน (Used)' : 'รับหินใหม่ (New)'; direction = 'IN'; }
    else {
        typeLabel = 'เคลมสินค้า';
        direction = items.some(([k, v]) => { const p = keyParts(k); return v > stockQty(p.model, p.grit, p.cond); }) ? 'NONE' : 'OUT';
    }
    const ok = await Swal.fire({
        title: `ยืนยัน${REC_TYPES[rec.type]}?`, icon: 'question',
        html: `<div style="text-align:left;font-size:14px"><b>${esc(cust)}</b> · เซลล์ ${esc(rec.sale || '-')}<br>${items.map(([k, v]) => { const p = keyParts(k); return `• ${esc(p.model)} #${esc(p.grit)} ${esc(p.cond)} × ${v}`; }).join('<br>')}<br><b>รวม ${fmtN(total)} ก้อน</b>${direction === 'NONE' ? '<br><small>ของไม่พอ — บันทึกเป็นรอของเข้า</small>' : ''}</div>`,
        showCancelButton: true, confirmButtonColor: '#12a37a', confirmButtonText: 'บันทึก', cancelButtonText: 'แก้ไข'
    });
    if (!ok.isConfirmed) return;
    const done = await syncAction('addMultiLogs', { data: [{ sale: rec.sale, cust, typeLabel, direction, item: itemStr, qty: total, remark: (rec.remark || '').trim() }] }, `บันทึก${REC_TYPES[rec.type]}เรียบร้อย`);
    if (done) {
        rec.cart = {}; rec.cust = ''; rec.remark = ''; rec.cartOpen = false;
        showPage(rec.type === 'trial' ? 'dash' : 'hist');
    }
}

// ============================================================
// การทำรายการจากรายการเดิม
// ============================================================
async function confirmTestToSale(id) {
    const l = findLogById(id); if (!l) return Swal.fire('ไม่พบรายการนี้', 'กรุณารีเฟรชแล้วลองใหม่', 'error');
    const r = await Swal.fire({ title: 'ลูกค้าตกลงซื้อแล้ว?', html: `ปิดการขาย <b>${esc(itemsText(l, ', '))}</b><br>ให้ ${esc(l.cust)} (ยอดขายนับวันนี้)`, icon: 'question',
        showCancelButton: true, confirmButtonColor: '#0e4a38', confirmButtonText: 'ยืนยันขาย', cancelButtonText: 'ยกเลิก' });
    if (r.isConfirmed) await syncAction('confirmTestToSale', { id }, 'ปิดการขายเรียบร้อย');
}
async function returnTestItem(id) {
    const l = findLogById(id); if (!l) return Swal.fire('ไม่พบรายการนี้', 'กรุณารีเฟรชแล้วลองใหม่', 'error');
    const r = await Swal.fire({ title: 'รับของทดลองคืน?', html: `รับคืน <b>${esc(itemsText(l, ', '))}</b><br>จาก ${esc(l.cust)} เข้าคลังเป็น <b>Used</b>`, icon: 'question',
        showCancelButton: true, confirmButtonColor: '#64748b', confirmButtonText: 'ยืนยันรับคืน', cancelButtonText: 'ยกเลิก' });
    if (r.isConfirmed) await syncAction('returnTestItem', { id }, 'รับคืนเข้าคลังเรียบร้อย');
}
async function closeClaim(id) {
    const l = findLogById(id); if (!l) return Swal.fire('ไม่พบรายการนี้', 'กรุณารีเฟรชแล้วลองใหม่', 'error');
    const r = await Swal.fire({ title: 'ปิดงานเคลม?', html: `ได้รับหินเสียคืนจาก ${esc(l.cust)} แล้ว<br><small>หินเสียไม่นับเข้าสต็อก</small>`, icon: 'info',
        showCancelButton: true, confirmButtonColor: '#7c5cd4', confirmButtonText: 'ยืนยันปิดงาน', cancelButtonText: 'ยกเลิก' });
    if (r.isConfirmed) await syncAction('closeClaim', { id }, 'ปิดงานเคลมเรียบร้อย');
}
async function processStockClaim(id) {
    const l = findLogById(id); if (!l) return Swal.fire('ไม่พบรายการนี้', 'กรุณารีเฟรชแล้วลองใหม่', 'error');
    const r = await Swal.fire({ title: 'ของเข้าคลังแล้ว?', html: `ตัดสต็อก <b>${esc(itemsText(l, ', '))}</b><br>เพื่อเปลี่ยนให้ ${esc(l.cust)} และปิดงานเคลม`, icon: 'warning',
        showCancelButton: true, confirmButtonColor: '#f43f5e', confirmButtonText: 'ยืนยันตัดสต็อก', cancelButtonText: 'ยกเลิก' });
    if (r.isConfirmed) await syncAction('processStockClaim', { id }, 'ตัดสต็อกและปิดงานเคลมเรียบร้อย');
}
async function cancelLog(id) {
    const l = findLogById(id); if (!l) return;
    const effect = l.direction === 'OUT' ? 'ระบบจะคืนสต็อกตามรายการนี้' : (l.direction === 'IN' ? 'ระบบจะหักสต็อกที่รับเข้าออก' : 'รายการนี้ยังไม่ได้ตัดสต็อก จะไม่มีการปรับยอด');
    const { value: reason, isConfirmed } = await Swal.fire({
        title: 'ยกเลิกรายการนี้?', html: `<b>${esc(l.typeLabel)}</b> · ${esc(l.cust)}<br>${esc(itemsText(l, ', '))}<br><small>${effect} · รายการยังอยู่ในประวัติพร้อมเหตุผล</small>`,
        input: 'text', inputPlaceholder: 'เหตุผล เช่น บันทึกผิดรุ่น', icon: 'warning', showCancelButton: true,
        confirmButtonColor: '#d94f4f', confirmButtonText: 'ยืนยันยกเลิก', cancelButtonText: 'ปิด',
        inputValidator: v => (!v || !v.trim()) ? 'กรุณาระบุเหตุผล' : undefined
    });
    if (isConfirmed) await syncAction('cancelLog', { id, reason }, 'ยกเลิกรายการเรียบร้อย');
}
async function editRemark(id) {
    if (!isAdmin) return;
    const l = findLogById(id);
    const { value, isConfirmed } = await Swal.fire({ title: 'แก้ไขหมายเหตุ', input: 'text', inputValue: l ? l.remark || '' : '',
        showCancelButton: true, confirmButtonColor: '#0e4a38', confirmButtonText: 'บันทึก', cancelButtonText: 'ยกเลิก' });
    if (isConfirmed) await syncAction('editRemark', { id, remark: value || '' }, 'แก้หมายเหตุแล้ว');
}

// ============================================================
// ข้อความสำหรับส่ง LINE
// ============================================================
const LINE_RULE = '──────────────';
function copyReport() {
    const now = new Date();
    const groups = groupStock();
    const n = groups.reduce((s, g) => s + g.newQty, 0), u = groups.reduce((s, g) => s + g.usedQty, 0);
    const low = groups.filter(g => g.low);
    const open = openItems();
    const trials = open.filter(o => o.status === 'PENDING');
    const claims = open.filter(o => o.status === 'WAITING_CLAIM' || o.status === 'WAITING_STOCK');
    const lines = ['📦 สต็อกหินขัด RDS', `ณ ${thaiShort(now)} เวลา ${thaiTime(now)}`, LINE_RULE,
        ...groups.map(g => `${g.key} · New ${g.newQty} · Used ${g.usedQty} = ${g.newQty + g.usedQty}${g.low ? ' ⚠️' : ''}`),
        LINE_RULE, `รวมทั้งคลัง ${n + u} ก้อน (New ${n} · Used ${u})`];
    const tail = [];
    if (low.length) tail.push(`⚠️ ใกล้หมด : ${low.map(g => g.key).join(', ')}`);
    if (trials.length) tail.push(`🧪 ทดลองค้าง ${trials.length} ราย · นานสุด ${Math.max(...trials.map(t => t.days || 0))} วัน`);
    if (claims.length) tail.push(`🛡️ รอเคลม ${claims.length} ราย`);
    if (tail.length) lines.push('', ...tail);
    copyText(lines.join('\n'));
}
function copyTrials() {
    const trials = openItems().filter(o => o.status === 'PENDING').slice().sort((a, b) => (b.days || 0) - (a.days || 0));
    const lines = ['🧪 ลูกค้าทดลองใช้งาน RDS', `ณ ${thaiShort(new Date())} · ${trials.length} ราย`, LINE_RULE,
        ...trials.map(t => `${t.days > TRIAL_ALERT_DAYS ? '🔴' : t.days > TRIAL_WARN_DAYS ? '🟡' : '🟢'} ${t.cust} · ${t.days} วัน\n   ${itemsText(t, ', ')} (${t.sale || '-'})`)];
    copyText(lines.join('\n'));
}
function copyWeekly() {
    if (!summary || !summary.week) return Swal.fire('ยังไม่มีข้อมูลสรุป', 'กรุณารีเฟรชข้อมูลก่อน', 'info');
    const s = summary, w = s.week;
    const pct = w.salePrev > 0 ? Math.round((w.sale - w.salePrev) / w.salePrev * 100) : null;
    const trend = pct === null ? '' : (pct >= 0 ? ` (▲ ${pct}% จากสัปดาห์ก่อน)` : ` (▼ ${Math.abs(pct)}% จากสัปดาห์ก่อน)`);
    const overdue = s.open.filter(o => o.status === 'PENDING' && o.days > TRIAL_ALERT_DAYS);
    const low = s.stock.filter(g => g.low);
    const lines = ['📊 สรุปสัปดาห์ RDS', `${thaiShort(new Date(w.from))} – ${thaiShort(new Date(w.to))}`, LINE_RULE,
        `ขาย ${w.sale} ก้อน${trend}`, `ส่งทดลอง ${w.trialSent} ก้อน · ปิดเป็นขาย ${w.trialConverted}`, `รับเข้า ${w.inQty} ก้อน · เคลม ${w.claimQty} ก้อน`];
    if (w.topModel || w.topSale) lines.push('');
    if (w.topModel) lines.push(`ขายดีสุด : ${w.topModel[0]} (${w.topModel[1]} ก้อน)`);
    if (w.topSale) lines.push(`เซลล์ยอดสูงสุด : ${w.topSale[0]} (${w.topSale[1]} ก้อน)`);
    lines.push('', `คงเหลือในคลัง ${s.stockTotal.n + s.stockTotal.u} ก้อน (New ${s.stockTotal.n} · Used ${s.stockTotal.u})`);
    if (overdue.length || low.length) {
        lines.push('', 'ต้องติดตาม');
        if (overdue.length) { lines.push(`• ทดลองเกิน ${TRIAL_ALERT_DAYS} วัน ${overdue.length} ราย`); overdue.slice(0, 5).forEach(o => lines.push(`  ${o.cust} ${o.days} วัน (${o.sale || '-'})`)); }
        if (low.length) lines.push(`• ใกล้หมด : ${low.map(g => `${g.key} (${g.newQty})`).join(', ')}`);
    }
    copyText(lines.join('\n'));
}

// ============================================================
// รายงานผู้บริหาร
// ============================================================
let _chartTrend = null, _chartModels = null;
const CHART_COLORS = ['#12a37a', '#e08a3c', '#7c5cd4', '#d94f4f', '#0e4a38', '#4fd8a6'];
function renderExec() {
    const el = document.getElementById('page-exec');
    if (!summary) { el.innerHTML = '<div class="ptitle"><h1>รายงานผู้บริหาร</h1></div><div class="card empty">กำลังโหลดข้อมูลสรุป... ถ้าไม่ขึ้น ให้ตรวจว่า Deploy Google Script เวอร์ชันล่าสุดแล้ว</div>'; return; }
    const s = summary, m = s.month, now = new Date();
    const pct = m.lastMonth > 0 ? Math.round((m.thisMonth - m.lastMonth) / m.lastMonth * 100) : null;
    const trials = s.open.filter(o => o.status === 'PENDING').slice().sort((a, b) => (b.days || 0) - (a.days || 0));
    const overdue = trials.filter(o => o.days > TRIAL_ALERT_DAYS);
    const groups = groupStock();
    const stock = groups.slice().sort((a, b) => (b.newQty + b.usedQty) - (a.newQty + a.usedQty));
    const maxStock = Math.max(1, ...stock.map(g => g.newQty + g.usedQty));
    const low = groups.filter(g => g.low);
    const totalSaleMonth = s.bySaleMonth.reduce((a, x) => a + x[1], 0) || 1;
    el.innerHTML = `
    <div class="ptitle"><div><small>ข้อมูล ณ ${thaiShort(new Date(s.generatedAt))} ${thaiTime(new Date(s.generatedAt))} · คำนวณจากทุกรายการ</small><h1>สรุปภาพรวม · ${TH_MONTHS_FULL[now.getMonth()]} ${now.getFullYear() + 543}</h1></div></div>
    <div class="kpis">
        <div class="kpi" style="--c:var(--accent)"><small>ขายเดือนนี้</small><b>${fmtN(m.thisMonth)} <span class="u">ก้อน</span></b><em class="${pct === null ? 'muted' : (pct >= 0 ? 'up' : 'down')}">${pct === null ? 'เดือนก่อน ' + fmtN(m.lastMonth) : (pct >= 0 ? '▲ ' : '▼ ') + Math.abs(pct) + '% จากเดือนก่อน (' + fmtN(m.lastMonth) + ')'}</em></div>
        <div class="kpi" style="--c:var(--primary)"><small>ขายปีนี้</small><b>${fmtN(m.thisYear)} <span class="u">ก้อน</span></b><em class="muted">ม.ค.–${TH_MONTHS[now.getMonth()]}</em></div>
        <div class="kpi" style="--c:var(--orange)"><small>ทดลองอยู่ที่ลูกค้า</small><b>${trials.length} <span class="u">ราย</span></b><em class="${overdue.length ? 'down' : 'muted'}">${fmtN(trials.reduce((a, o) => a + Number(o.qty || 0), 0))} ก้อน${overdue.length ? ` · ${overdue.length} รายเกิน ${TRIAL_ALERT_DAYS} วัน` : ''}</em></div>
        <div class="kpi" style="--c:var(--purple)"><small>คงเหลือในคลัง</small><b>${fmtN(s.stockTotal.n + s.stockTotal.u)} <span class="u">ก้อน</span></b><em class="muted">New ${fmtN(s.stockTotal.n)} · Used ${fmtN(s.stockTotal.u)}</em></div>
    </div>
    <div class="card trials"><div class="trials-head"><div class="ic">🧪</div><div><h2>ลูกค้าทดลองใช้งาน</h2><small>${trials.length} ราย · เรียงจากค้างนานที่สุด</small></div>
        <button class="btn-ghost" style="margin-left:auto" onclick="copyTrials()">📋 คัดลอกรายชื่อ ส่ง LINE</button></div>${trialCardsHtml(trials, false)}</div>
    <div class="grid2">
        <div class="card"><h2>📦 สต็อกรายรุ่น</h2>
            ${stock.map(g => `<div class="bar-row"><span>${esc(g.key)}</span><span class="bar"><i class="bar-new" style="width:${g.newQty / maxStock * 100}%"></i><i class="bar-used" style="width:${g.usedQty / maxStock * 100}%"></i></span><span class="num"><b>${fmtN(g.newQty + g.usedQty)}</b>${g.low ? ' <span class="pill p-low">ใกล้หมด</span>' : ''}</span></div>`).join('') || '<div class="empty">ยังไม่มีสินค้า</div>'}
            <div class="legend"><span><i class="bar-new"></i>New</span><span><i class="bar-used"></i>Used</span></div>
            ${low.length ? `<div class="notice" style="margin-top:10px">ใกล้หมด: ${low.map(g => `${esc(g.key)} เหลือ ${g.newQty}${g.weeksLeft ? ` (พอขายราว ${g.weeksLeft} สัปดาห์)` : ''}`).join(' · ')}</div>` : ''}
        </div>
        <div class="card"><h2>👤 ยอดขายรายเซลล์ (เดือนนี้)</h2>
            ${s.bySaleMonth.length ? `<table class="data-table"><tbody>${s.bySaleMonth.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num"><b>${fmtN(v)}</b></td><td class="num muted">${Math.round(v / totalSaleMonth * 100)}%</td></tr>`).join('')}</tbody></table>` : '<div class="empty">เดือนนี้ยังไม่มียอดขาย</div>'}
            <h2 style="margin-top:16px">🏢 ลูกค้าซื้อสูงสุด (ปีนี้)</h2>
            ${s.topCustomersYear.length ? `<table class="data-table"><tbody>${s.topCustomersYear.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num"><b>${fmtN(v)}</b></td></tr>`).join('')}</tbody></table>` : '<div class="empty">ปีนี้ยังไม่มียอดขาย</div>'}
        </div>
    </div>
    <div class="grid2 even">
        <div class="card"><h2>📈 ยอดขาย 14 วันล่าสุด</h2><div class="chart-box"><canvas id="chart-trend"></canvas></div></div>
        <div class="card"><h2>🏆 5 อันดับหินขายดี (ปีนี้)</h2><div class="chart-box"><canvas id="chart-models"></canvas></div></div>
    </div>
    <button class="btn-line" onclick="copyWeekly()">📋 คัดลอกสรุปสัปดาห์ที่แล้ว ส่ง LINE</button>`;
    drawExecCharts();
}
function drawExecCharts() {
    if (typeof Chart === 'undefined' || !summary) return;
    const t = document.getElementById('chart-trend');
    if (t) {
        if (_chartTrend) _chartTrend.destroy();
        _chartTrend = new Chart(t, { type: 'bar', data: { labels: summary.daily14.map(d => d.label), datasets: [{ label: 'ยอดขาย (ก้อน)', data: summary.daily14.map(d => d.qty), backgroundColor: '#12a37a', borderRadius: 5, maxBarThickness: 26 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false } } } } });
    }
    const mEl = document.getElementById('chart-models');
    if (mEl) {
        if (_chartModels) _chartModels.destroy();
        _chartModels = new Chart(mEl, { type: 'bar', data: { labels: summary.topModelsYear.map(x => x[0]), datasets: [{ label: 'ขายได้ (ก้อน)', data: summary.topModelsYear.map(x => x[1]), backgroundColor: CHART_COLORS, borderRadius: 5 }] },
            options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { precision: 0 } } } } });
    }
}

// ============================================================
// ตั้งค่าระบบ (Admin)
// ============================================================
function renderManage() {
    const el = document.getElementById('page-manage');
    if (!isAdmin) { el.innerHTML = ''; return; }
    const groups = groupStock();
    el.innerHTML = `
    <div class="ptitle"><h1>ตั้งค่าระบบ</h1><small>เฉพาะ Admin</small></div>
    <div class="mgrid">
        <div class="card"><h2>📦 รุ่นหิน <button class="more" onclick="addModel()">＋ เพิ่ม</button></h2>
            ${groups.map((g, i) => `<div class="mrow"><span><b>${esc(g.key)}</b><small>ใกล้หมดเมื่อ New ≤ ${g.minStock} · คงเหลือ ${g.newQty + g.usedQty}</small></span><span style="flex:none"><button class="link" onclick="editMinStock(${i})">ตั้งเกณฑ์</button><button class="link danger" onclick="deleteModel(${i})">ลบ</button></span></div>`).join('') || '<div class="empty">ยังไม่มีรุ่น</div>'}</div>
        <div class="card"><h2>👤 ทีมงาน / เซลล์ <button class="more" onclick="addData('SALE')">＋ เพิ่ม</button></h2>
            ${sales.map((s, i) => `<div class="mrow"><span>${esc(s)}</span><button class="link danger" onclick="deleteData('SALE', ${i})">ลบ</button></div>`).join('') || '<div class="empty">ยังไม่มีรายชื่อ</div>'}</div>
        <div class="card"><h2>🏢 ลูกค้า <span class="muted" style="font-size:12px;font-weight:600">เพิ่มอัตโนมัติตอนบันทึก</span></h2>
            ${customers.map((c, i) => `<div class="mrow"><span>${esc(c)}</span><button class="link danger" onclick="deleteData('CUST', ${i})">ลบ</button></div>`).join('') || '<div class="empty">ยังไม่มีรายชื่อ</div>'}</div>
    </div>`;
}
async function addModel() {
    const { value: fV } = await Swal.fire({ title: 'เพิ่มรุ่นหินใหม่', showCancelButton: true, confirmButtonText: 'เพิ่ม', cancelButtonText: 'ยกเลิก', confirmButtonColor: '#0e4a38',
        html: '<input id="sw-m" class="swal2-input" placeholder="รุ่น (เช่น R2)"><input id="sw-g" class="swal2-input" placeholder="เบอร์ (ตัวเลข เช่น 600)" inputmode="numeric">',
        preConfirm: () => {
            const m = document.getElementById('sw-m').value.trim(), g = document.getElementById('sw-g').value.trim();
            if (!m || !g) return Swal.showValidationMessage('กรุณากรอกรุ่นและเบอร์');
            if (/[#,()|]/.test(m)) return Swal.showValidationMessage('ชื่อรุ่นห้ามมีเครื่องหมาย # , ( ) |');
            if (!/^\d+$/.test(g)) return Swal.showValidationMessage('เบอร์ต้องเป็นตัวเลข');
            return [m, g];
        } });
    if (fV) await syncAction('addModel', { model: fV[0], grit: fV[1] }, 'เพิ่มรุ่นแล้ว');
}
async function deleteModel(i) {
    const g = groupStock()[i]; if (!g) return;
    if (g.newQty + g.usedQty !== 0) return Swal.fire('ยังลบไม่ได้', `${g.key} ยังมีสต็อกคงเหลือ ${g.newQty + g.usedQty} ก้อน ลบได้เมื่อยอดเป็น 0`, 'info');
    const r = await Swal.fire({ title: 'ลบรุ่นนี้?', text: `ลบ "${g.key}" ออกจากระบบ`, icon: 'warning', showCancelButton: true, confirmButtonColor: '#d94f4f', confirmButtonText: 'ลบ', cancelButtonText: 'ยกเลิก', reverseButtons: true });
    if (r.isConfirmed) await syncAction('deleteModel', { model: g.model, grit: g.grit }, 'ลบรุ่นแล้ว');
}
async function editMinStock(i) {
    const g = groupStock()[i]; if (!g) return;
    const { value, isConfirmed } = await Swal.fire({ title: `เกณฑ์ใกล้หมด · ${g.key}`, input: 'number', inputValue: g.minStock,
        inputLabel: 'แจ้งเตือนเมื่อหิน New เหลือน้อยกว่าหรือเท่ากับ (ก้อน)', inputAttributes: { min: 0, step: 1 },
        showCancelButton: true, confirmButtonColor: '#0e4a38', confirmButtonText: 'บันทึก', cancelButtonText: 'ยกเลิก',
        inputValidator: v => (v === '' || Number(v) < 0) ? 'กรุณาใส่ตัวเลข 0 ขึ้นไป' : undefined });
    if (isConfirmed) await syncAction('setMinStock', { model: g.model, grit: g.grit, minStock: Number(value) }, 'บันทึกเกณฑ์แล้ว');
}
async function addData(type) {
    const typeText = type === 'SALE' ? 'ทีมงาน' : 'ลูกค้า';
    const { value: name } = await Swal.fire({ title: `เพิ่ม${typeText}ใหม่`, input: 'text', inputPlaceholder: `ชื่อ${typeText}`, showCancelButton: true, confirmButtonColor: '#12a37a', confirmButtonText: 'เพิ่ม', cancelButtonText: 'ยกเลิก' });
    if (name && name.trim()) await syncAction('addData', { type, name: name.trim() }, `เพิ่ม${typeText}แล้ว`);
}
async function deleteData(type, i) {
    const name = (type === 'SALE' ? sales : customers)[i]; if (name === undefined) return;
    const typeText = type === 'SALE' ? 'ทีมงาน' : 'ลูกค้า';
    const r = await Swal.fire({ title: 'ยืนยันการลบ?', text: `ลบรายชื่อ${typeText} "${name}" (ประวัติเดิมยังอยู่)`, icon: 'warning', showCancelButton: true, confirmButtonColor: '#d94f4f', confirmButtonText: 'ลบ', cancelButtonText: 'ยกเลิก', reverseButtons: true });
    if (r.isConfirmed) await syncAction('deleteData', { type, name }, `ลบ${typeText}แล้ว`);
}

// ปิดการซูมบนมือถือ — iPhone ไม่สนใจ user-scalable=no จึงกันการถ่างนิ้วตรงนี้ ส่วนแตะสองครั้งปิดด้วย touch-action ใน CSS
document.addEventListener('gesturestart', e => e.preventDefault(), { passive: false });

init();
