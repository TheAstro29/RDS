const API_URL = "https://script.google.com/macros/s/AKfycbzJ8HJ1FlVckHAwJxkGJbySBbDfrtcEoxYR9tbxSBqhYv3smR4U1qqQC4mwnA57EF7Jvw/exec";
const ADMIN_SESSION_KEY = 'rds_admin_session';
const ADMIN_SESSION_HOURS = 8;
let inventory = [], sales = [], customers = [], allLogs = [], isAdmin = false, cart = [];

function init() {
    const cached = localStorage.getItem('rds_cache');
    if (cached) {
        const data = JSON.parse(cached);
        inventory = data.inventory || [];
        sales = data.sales || [];
        customers = data.customers || [];
        allLogs = data.logs || [];
        renderAll();
    }
    restoreAdminSession();
    fetchData();

    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('sw.js').catch(() => {});
        });
    }
}

/**
 * ตรวจสอบ session ของ Admin ที่บันทึกไว้ (หมดอายุอัตโนมัติภายในไม่กี่ชั่วโมง)
 * เพื่อไม่ต้องให้พนักงานพิมพ์รหัสผ่านซ้ำทุกครั้งที่รีเฟรชหน้า
 */
function restoreAdminSession() {
    try {
        const raw = localStorage.getItem(ADMIN_SESSION_KEY);
        if (!raw) return;
        const session = JSON.parse(raw);
        if (session.expires && session.expires > Date.now()) {
            activateAdminUI();
        } else {
            localStorage.removeItem(ADMIN_SESSION_KEY);
        }
    } catch (e) {
        localStorage.removeItem(ADMIN_SESSION_KEY);
    }
}

const ICON_LOCK = '<svg viewBox="0 0 24 24"><path d="M12 1a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-1V6a5 5 0 0 0-5-5Zm3 8H9V6a3 3 0 0 1 6 0Z"/></svg>';
const ICON_UNLOCK = '<svg viewBox="0 0 24 24"><path d="M12 1a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2H9V6a3 3 0 0 1 5.75-1.19 1 1 0 0 0 1.87-.7A5 5 0 0 0 12 1Z"/></svg>';

function activateAdminUI() {
    isAdmin = true;
    document.body.classList.add('admin-active');
    document.getElementById('admin-btn').innerHTML = ICON_UNLOCK;
    const statusEl = document.getElementById('admin-status');
    if (statusEl) {
        statusEl.innerText = 'Admin Mode';
        statusEl.style.background = '#dcfce7';
        statusEl.style.color = '#166534';
    }
    renderAll();
}

function deactivateAdminUI() {
    isAdmin = false;
    document.body.classList.remove('admin-active');
    document.getElementById('admin-btn').innerHTML = ICON_LOCK;
    const statusEl = document.getElementById('admin-status');
    if (statusEl) {
        statusEl.innerText = 'User Mode';
        statusEl.style.background = '#fee2e2';
        statusEl.style.color = '#ef4444';
    }
    localStorage.removeItem(ADMIN_SESSION_KEY);
    showPage('dash-page', document.querySelector('.nav-item'));
    renderAll();
}

/**
 * เข้า/ออกโหมด Admin
 * รหัสผ่านจะถูกตรวจสอบที่ฝั่ง Google Script (server) เท่านั้น
 * ไม่มีการเก็บหรือเทียบรหัสผ่านไว้ในไฟล์ฝั่งหน้าเว็บอีกต่อไป
 */
async function toggleAdmin() {
    if (isAdmin) {
        deactivateAdminUI();
        return;
    }

    const { value: pass } = await Swal.fire({
        title: 'เจ้าหน้าที่ผู้ดูแล',
        input: 'password',
        inputPlaceholder: 'รหัสผ่าน Admin',
        confirmButtonColor: '#0e4a38',
        confirmButtonText: 'ยืนยัน',
        showCancelButton: true
    });

    if (!pass) return;

    Swal.fire({ title: 'กำลังตรวจสอบ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        const res = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'adminLogin', password: pass })
        });
        const result = await res.json();

        if (result.status === 'success') {
            const expires = Date.now() + ADMIN_SESSION_HOURS * 60 * 60 * 1000;
            localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify({ expires }));
            Swal.close();
            activateAdminUI();
        } else {
            Swal.fire({ icon: 'error', title: 'รหัสผ่านไม่ถูกต้อง' });
        }
    } catch (e) {
        Swal.fire({ icon: 'error', title: 'เชื่อมต่อไม่ได้', text: 'ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่' });
    }
}

async function fetchData() {
    const refreshBtn = document.getElementById('main-refresh');
    const loadingScreen = document.getElementById('loading');

    refreshBtn.classList.add('spinning');

    if (!localStorage.getItem('rds_cache')) {
        loadingScreen.style.display = 'flex';
        loadingScreen.style.opacity = '1';
    }

    try {
        const res = await fetch(API_URL);
        const data = await res.json();
        inventory = data.inventory || [];
        sales = data.sales || [];
        customers = data.customers || [];
        allLogs = data.logs || [];

        localStorage.setItem('rds_cache', JSON.stringify(data));
        renderAll();
    } catch (e) {
        console.error(e);
    }
    finally {
        if (loadingScreen.style.display !== 'none') {
            loadingScreen.style.opacity = '0';
            setTimeout(() => {
                loadingScreen.style.display = 'none';
            }, 500);
        }
        refreshBtn.classList.remove('spinning');
    }
}

function renderAll() {
    let sell = 0, test = 0, todayLogs = [], activeTrials = [];
    const now = new Date();
    const todayStr = `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear() + 543}`;

    allLogs.forEach(l => {
        const q = Number(l.qty) || 0;
        if (String(l.date).includes(todayStr)) { todayLogs.push(l); }

        if (l.typeLabel === 'ขายสินค้า') sell += q;
        if (l.typeLabel === 'ส่งทดลองใช้งาน') {
            test += q;
            if (l.status === 'PENDING') activeTrials.push(l);
        }
    });

    activeTrials.sort((a, b) => {
        const getTimestamp = (dateStr) => {
            const match = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
            if (!match) return 0;
            const [_, d, m, y] = match;
            return new Date(parseInt(y) - 543, parseInt(m) - 1, parseInt(d)).getTime();
        };
        return getTimestamp(a.date) - getTimestamp(b.date);
    });

    const dSell = document.getElementById('d-sell');
    const dTest = document.getElementById('d-test');
    if (dSell) dSell.innerText = sell;
    if (dTest) dTest.innerText = test;

    const todayDiv = document.getElementById('d-today-activity');
    if (todayDiv) {
        if (todayLogs.length === 0) {
            todayDiv.innerHTML = '<center style="color:#ccc; padding:10px;">วันนี้ยังไม่มีรายการ</center>';
        } else {
            todayDiv.innerHTML = todayLogs.slice().reverse().map(l => {
                let icon = l.direction === 'IN' ? '📥' : '📤';
                let color = l.direction === 'IN' ? 'var(--accent-green)' : 'var(--danger-red)';
                if (l.typeLabel.includes('ทดลอง')) { icon = '🧪'; color = 'var(--orange)'; }
                if (l.status === 'RETURNED') { icon = '🔄'; color = '#64748b'; }

                return `
                        <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid var(--border-soft);">
                            <div style="flex:1;">
                                <span style="font-size:1rem;">${icon}</span>
                                <b style="font-size:0.8rem;">${l.cust}</b><br>
                                <small style="color:var(--primary-green); font-size:0.7rem; font-weight:600;">🛠️ ${l.sale || 'ไม่ระบุ'}</small>
                            </div>
                            <div style="text-align:right;">
                                <b style="color:${color};">${(l.direction === 'IN' || l.status === 'RETURNED') ? '+' : '-'}${l.qty}</b><br>
                                <small style="font-size:0.6rem; color:#94a3b8;">${l.date.split(' ')[0]}</small>
                            </div>
                        </div>`;
            }).join('');
        }
    }

    const grouped = {};
    inventory.forEach(it => {
        const key = `${it.model} #${it.grit}`;
        if (!grouped[key]) grouped[key] = { n: 0, u: 0 };
        if (it.condition.includes('New')) grouped[key].n = Number(it.qty);
        else grouped[key].u = Number(it.qty);
    });

    const reportBody = document.getElementById('report-stock-body');
    if (reportBody) {
        reportBody.innerHTML = Object.keys(grouped).map(k => `
                <tr>
                    <td><b>${k}</b></td>
                    <td style="text-align:center;">${grouped[k].n}</td>
                    <td style="text-align:center;">${grouped[k].u}</td>
                    <td style="text-align:right;"><b>${grouped[k].n + grouped[k].u}</b></td>
                </tr>
            `).join('');
    }

    const countHeader = document.getElementById('trial-count-header');
    if (countHeader) {
        countHeader.innerText = `(${activeTrials.length} รายการ)`;
    }

    const trialBody = document.getElementById('d-trial-list');
    if (trialBody) {
        if (activeTrials.length === 0) {
            trialBody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:20px; color:#ccc;">ไม่มีรายการค้างทดลอง</td></tr>';
        } else {
            trialBody.innerHTML = activeTrials.map(l => {
                const dateMatch = l.date.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
                let diffDays = "?";
                if (dateMatch) {
                    const [_, d, m, y] = dateMatch;
                    const logDate = new Date(parseInt(y) - 543, parseInt(m) - 1, parseInt(d));
                    diffDays = Math.floor((new Date() - logDate) / (1000 * 60 * 60 * 24));
                }
                return `
                    <tr>
                        <td style="padding: 10px 4px;"><b>${l.cust}</b></td>
                        <td style="padding: 10px 4px;">${l.item}<br><b style="color:var(--orange);">${l.qty} ก้อน</b></td>
                        <td style="padding: 10px 4px; text-align: right;">
                            <span style="
                                background: ${diffDays > 14 ? '#fee2e2' : (diffDays > 7 ? '#fef3c7' : '#dcfce7')};
                                color: ${diffDays > 14 ? '#ef4444' : (diffDays > 7 ? '#b45309' : '#166534')};
                                padding: 4px 8px;
                                border-radius: 6px;
                                font-weight: bold;
                                display: inline-block;
                                min-width: 60px;
                                text-align: center;
                            ">
                                ${diffDays} วัน
                            </span>
                        </td>
                    </tr>`;
            }).join('');
        }
    }

    const stockList = document.getElementById('stock-list');
    if (stockList) {
        const stockGrouped = {};
        inventory.forEach(it => {
            const key = `${it.model} #${it.grit}`;
            if (!stockGrouped[key]) stockGrouped[key] = { newQty: 0, usedQty: 0 };
            if (it.condition.includes('New')) stockGrouped[key].newQty = it.qty;
            else stockGrouped[key].usedQty = it.qty;
        });

        stockList.innerHTML = Object.keys(stockGrouped).map(modelKey => `
                <div class="card" style="margin-bottom: 0; padding: 15px;">
                    <div style="font-weight: 800; color: var(--primary-green); font-size: 1rem; margin-bottom: 10px; border-bottom: 1px solid var(--border-soft); padding-bottom: 5px;">
                        📦 ${modelKey}
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div style="flex: 1; display: flex; flex-direction: column; align-items: center; border-right: 1px solid var(--border-soft);">
                            <span class="badge badge-new" style="margin-bottom: 5px;">NEW</span>
                            <b style="font-size: 1.4rem; color: var(--accent-green);">${stockGrouped[modelKey].newQty}</b>
                        </div>
                        <div style="flex: 1; display: flex; flex-direction: column; align-items: center;">
                            <span class="badge badge-used" style="margin-bottom: 5px;">USED</span>
                            <b style="font-size: 1.4rem; color: var(--orange);">${stockGrouped[modelKey].usedQty}</b>
                        </div>
                    </div>
                </div>
            `).join('');
    }

    const mModels = document.getElementById('m-models-list');
    if (mModels) {
        mModels.innerHTML = inventory
            .filter((v, i, a) => a.findIndex(t => t.model === v.model && t.grit === v.grit) === i)
            .map(m => `
                    <div class="stock-item">
                        <span style="font-weight:600;">${m.model} #${m.grit}</span>
                        ${isAdmin ? `<button onclick="deleteModel('${m.model}', '${m.grit}')" style="color:var(--danger-red); border:none; background:none; cursor:pointer; font-weight:bold;">ลบ</button>` : ''}
                    </div>`).join('');
    }

    const mSales = document.getElementById('m-sales-list');
    if (mSales) {
        mSales.innerHTML = sales.map(s => `
                <div class="stock-item">
                    <span>${s}</span>
                    ${isAdmin ? `<button onclick="deleteData('SALE','${s}')" style="color:red; border:none; background:none;">ลบ</button>` : ''}
                </div>`).join('');
    }

    const mCusts = document.getElementById('m-custs-list');
    if (mCusts) {
        mCusts.innerHTML = customers.map(c => `
                <div class="stock-item">
                    <span>${c}</span>
                    ${isAdmin ? `<button onclick="deleteData('CUST','${c}')" style="color:red; border:none; background:none;">ลบ</button>` : ''}
                </div>`).join('');
    }

    if (typeof filterLogs === "function") filterLogs();

    const statsPage = document.getElementById('stats-page');
    if (statsPage && statsPage.classList.contains('active')) {
        renderStatsCharts();
    }

    const claimDash = document.getElementById('claim-list-dashboard');
    if (claimDash) {
        const waitingClaims = allLogs.filter(l => l.status === 'WAITING_CLAIM');
        if (waitingClaims.length === 0) {
            claimDash.innerHTML = '<div style="text-align:center; color:#94a3b8; padding: 15px;">🎉 ไม่มีรายการค้างเคลม</div>';
        } else {
            claimDash.innerHTML = waitingClaims.map(l => `
                <div style="padding: 10px 0; border-bottom: 1px dashed #cbd5e1; display:flex; justify-content:space-between; align-items:center;">
                    <div style="font-size: 0.85rem;">
                        <b style="color:var(--text-main);">${l.cust}</b><br>
                        <span style="color:var(--text-sub);">${l.item}</span>
                    </div>
                    <div style="font-size: 0.8rem; font-weight:bold; color:var(--purple); text-align:right;">
                        รอเคลม ${l.qty} ก้อน<br>
                        <small style="color:#94a3b8; font-weight:normal;">${l.date.split(' ')[1]}</small>
                    </div>
                </div>
            `).join('');
        }
    }

    const totalClaimDash = document.getElementById('total-claim-dash');
    if (totalClaimDash) {
        const claimLogs = allLogs.filter(l => l.status === 'WAITING_CLAIM' || l.status === 'CLAIMED');
        const totalClaimQty = claimLogs.reduce((sum, l) => sum + Number(l.qty || 0), 0);
        totalClaimDash.innerText = totalClaimQty;
    }
}

async function addModel() {
    const { value: fV } = await Swal.fire({ title: 'เพิ่มรุ่นหินใหม่', html: '<input id="sw-m" class="swal-input-custom" placeholder="รุ่น (เช่น R2)"><input id="sw-g" class="swal-input-custom" placeholder="เบอร์ (เช่น 600)">', preConfirm: () => [document.getElementById('sw-m').value, document.getElementById('sw-g').value] });
    if (fV && fV[0] && fV[1]) await syncAction('addModel', { model: fV[0], grit: fV[1] });
}

async function deleteModel(model, grit) {
    const result = await Swal.fire({
        title: 'ยืนยันการลบ?',
        text: `ลบรุ่นหิน "${model} #${grit}" ออกจากระบบใช่หรือไม่?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: 'var(--danger-red)',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'ใช่, ลบเลย!',
        cancelButtonText: 'ยกเลิก',
        reverseButtons: true
    });
    if (result.isConfirmed) await syncAction('deleteModel', { model, grit });
}

async function addData(type) {
    const typeText = type === 'SALE' ? 'ทีมงาน' : 'ลูกค้า';
    const { value: name } = await Swal.fire({
        title: `เพิ่ม${typeText}ใหม่`,
        input: 'text',
        inputPlaceholder: `ชื่อ${typeText}`,
        showCancelButton: true,
        confirmButtonColor: 'var(--accent-green)',
        confirmButtonText: 'เพิ่ม',
        cancelButtonText: 'ยกเลิก'
    });
    if (name) await syncAction('addData', { type, name });
}

async function deleteData(type, name) {
    const typeText = type === 'SALE' ? 'ทีมงาน' : 'ลูกค้า';

    const result = await Swal.fire({
        title: 'ยืนยันการลบ?',
        text: `คุณต้องการลบรายชื่อ ${typeText}: "${name}" ออกจากระบบใช่หรือไม่?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: 'var(--danger-red)',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'ใช่, ลบเลย!',
        cancelButtonText: 'ยกเลิก',
        reverseButtons: true
    });

    if (result.isConfirmed) {
        try {
            await syncAction('deleteData', { type, name });
        } catch (e) {
            Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถลบข้อมูลได้', 'error');
        }
    }
}

async function copyReport() {
    let txt = `📋 *รายงานสต็อกคงเหลือ* 📋\n🗓 วันที่: ${new Date().toLocaleDateString('th-TH')} | เวลา: ${new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.\n━━━━━━━━━━━━━━━━━━\n\n`;
    const grouped = {}; inventory.forEach(it => { const key = `${it.model} #${it.grit}`; if (!grouped[key]) grouped[key] = { n: 0, u: 0 }; if (it.condition.includes('New')) grouped[key].n = it.qty; else grouped[key].u = it.qty; });
    Object.keys(grouped).forEach(k => { txt += `📦 *${k}*\n   🔹 ใหม่ (New) :  ${grouped[k].n.toString().padStart(3, ' ')} ก้อน\n   🔸 ใช้แล้ว (Used): ${grouped[k].u.toString().padStart(3, ' ')} ก้อน\n   ✅ *รวมทั้งหมด:  ${grouped[k].n + grouped[k].u} ก้อน*\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n`; });
    txt += `\n✨ _RDS by C2TECH_`;
    const el = document.createElement('textarea'); el.value = txt; document.body.appendChild(el); el.select(); document.execCommand('copy'); document.body.removeChild(el);
    Swal.fire({ icon: 'success', title: 'คัดลอกแล้ว!', timer: 1500, showConfirmButton: false });
}

async function cancelLog(id) {
    const { isConfirmed } = await Swal.fire({
        title: 'ยืนยันการยกเลิก?',
        text: "ระบบจะตรวจสอบสภาพสินค้า (New/Used) จากรายการนี้ และคืนเข้าสต็อกให้ตรงตามเดิม",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'ยืนยันยกเลิก',
        cancelButtonText: 'ปิด'
    });

    if (isConfirmed) {
        await syncAction('cancelLog', { id: id });
    }
}

let logDisplayLimit = 30;
let lastSearchDate = '';
let lastSearchText = '';

function loadMoreLogs() {
    logDisplayLimit += 30;
    filterLogs();
}

function filterLogs() {
    const dateVal = document.getElementById('search-date').value;
    const textVal = document.getElementById('search-text').value.toLowerCase();

    if (dateVal !== lastSearchDate || textVal !== lastSearchText) {
        logDisplayLimit = 30;
        lastSearchDate = dateVal;
        lastSearchText = textVal;
    }

    let filtered = [...allLogs].reverse();

    if (dateVal) {
        const [y, m, d] = dateVal.split('-');
        const searchStr = `${parseInt(d)}/${parseInt(m)}/${parseInt(y) + 543}`;
        filtered = filtered.filter(l => String(l.date).includes(searchStr));
    }

    if (textVal) {
        filtered = filtered.filter(l =>
            String(l.item).toLowerCase().includes(textVal) ||
            String(l.cust).toLowerCase().includes(textVal) ||
            String(l.sale).toLowerCase().includes(textVal) ||
            String(l.remark || '').toLowerCase().includes(textVal)
        );
    }

    const logList = document.getElementById('log-list');

    if (filtered.length === 0) {
        logList.innerHTML = `<center style="padding:50px; color:#94a3b8;">ไม่พบรายการ</center>`;
    } else {
        logList.innerHTML = filtered.slice(0, logDisplayLimit).map(l => `
            <div class="card" style="border-left:5px solid ${l.status === 'PENDING' ? 'var(--orange)' : (l.status === 'WAITING_CLAIM' ? 'var(--purple)' : (l.status === 'RETURNED' || l.status === 'CLAIMED' ? '#64748b' : (l.direction === 'IN' ? '#10b981' : '#ef4444')))};">
                <div style="display:flex; justify-content:space-between;">
                    <div style="font-size:0.75rem;">
                        <b>${l.status === 'RETURNED' ? '🔄 รับคืนสินค้า' : (l.status === 'CLAIMED' ? '✅ เคลมสินค้าแล้ว' : l.typeLabel)}</b> | <b>${l.item}</b><br>

                        <div style="margin-top: 4px;">
                            <span style="font-weight: 700; font-size: 0.7rem; color: var(--text-main);">👤 ลูกค้า: ${l.cust}</span>
                        </div>
                        <div style="color: var(--primary-green); font-weight: 600; font-size: 0.7rem;">
                            🛠️ ผู้จัดทำ: ${l.sale || 'ไม่ระบุ'}
                        </div>

                        ${l.remark ? `<div style="color: #f59e0b; font-size: 0.65rem; margin-top: 4px; font-weight: 600;">📝 Note: ${l.remark}</div>` : ''}
                    </div>

                    <div style="text-align:right;">
                        <b style="font-size:1.1rem;">${(l.direction === 'IN' || l.status === 'RETURNED' || l.status === 'CLAIMED') ? '+' : '-'}${l.qty}</b><br>
                        <small style="font-size:0.6rem;">${l.date}</small>

                        ${l.status === 'PENDING' ? `
                            <div style="display:flex; gap:4px; margin-top:5px; justify-content:flex-end;">
                                <button class="btn-confirm-sale" onclick="confirmTestToSale('${l.id}')">💰 ขาย</button>
                                <button class="btn-confirm-sale" style="background:#64748b;" onclick="returnTestItem('${l.id}')">🔄 คืน</button>
                            </div>` : ''}

                        ${l.status === 'WAITING_CLAIM' ? `
                            <div style="display:flex; gap:4px; margin-top:5px; justify-content:flex-end;">
                                <button class="btn-confirm-sale" style="background:var(--purple); width:100%; color:white;" onclick="closeClaim('${l.id}')">📦 ปิดงาน</button>
                             </div>` : ''}

                        ${l.status === 'WAITING_STOCK' ? `
                            <div style="display:flex; gap:4px; margin-top:5px; justify-content:flex-end;">
                                <button class="btn-confirm-sale" style="background:#f43f5e; width:100%; color:white;" onclick="processStockClaim('${l.id}')">⚡ เคลม</button>
                            </div>` : ''}

                        ${isAdmin ? `
                            <div style="margin-top:8px; display: flex; gap: 10px; justify-content: flex-end;">
                                <button onclick="editRemark('${l.id}', '${l.remark || ''}')" style="background:none; color:var(--orange); border:none; font-size:0.8rem; cursor:pointer; text-decoration:underline; font-weight:bold;">📝 แก้ไข</button>
                                <button onclick="cancelLog('${l.id}')" style="background:none; color:var(--danger-red); border:none; font-size:0.8rem; cursor:pointer; text-decoration:underline; font-weight:bold;">🚨 ยกเลิก</button>
                            </div>` : ''}
                    </div>
                </div>
            </div>`).join('');

        if (filtered.length > logDisplayLimit) {
            logList.innerHTML += `
                <div style="text-align: center; margin-top: 15px; margin-bottom: 20px; grid-column: 1 / -1;">
                    <button onclick="loadMoreLogs()"
                        style="background-color: white; border: 2px solid var(--nav-bg); color: var(--nav-bg); padding: 12px 20px; border-radius: 50px; width: 100%; max-width: 320px; font-family: inherit; font-weight: bold; cursor: pointer; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
                        ⬇️ ดูรายการเก่าเพิ่มเติม (เหลืออีก ${filtered.length - logDisplayLimit} รายการ)
                    </button>
                </div>
            `;
        }
    }
}

async function confirmTestToSale(targetId) {
    const log = allLogs.find(l => l.id === targetId) || allLogs.find(l => l.cust === targetId);
    if (!log) {
        Swal.fire('เกิดข้อผิดพลาด', 'ไม่พบข้อมูลรายการนี้ในระบบ', 'error');
        return;
    }

    const result = await Swal.fire({
        title: 'ยืนยันการขายสินค้า?',
        text: `คุณกำลังยืนยันการขาย ${log.item} จำนวน ${log.qty} ก้อน ให้คุณ ${log.cust}`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: 'var(--primary-green)',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'ยืนยัน',
        cancelButtonText: 'ยกเลิก'
    });

    if (result.isConfirmed) {
        Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
            const res = await fetch(API_URL, {
                method: 'POST',
                body: JSON.stringify({ action: "confirmTestToSale", id: log.id, item: log.item, qty: log.qty, cust: log.cust, sale: log.sale })
            });
            const resData = await res.json();
            if (resData.status === 'success') {
                await Swal.fire('บันทึกสำเร็จ', 'เปลี่ยนสถานะเป็นขายเรียบร้อย', 'success');
                fetchData();
            } else {
                Swal.fire('เกิดข้อผิดพลาด', resData.message || 'บันทึกไม่สำเร็จ', 'error');
            }
        } catch (e) {
            Swal.fire('เกิดข้อผิดพลาด', e.message, 'error');
        }
    }
}

async function returnTestItem(targetId) {
    const log = allLogs.find(l => l.id === targetId) || allLogs.find(l => l.cust === targetId);
    if (!log) {
        Swal.fire('เกิดข้อผิดพลาด', 'ไม่พบข้อมูลรายการนี้ในระบบ', 'error');
        return;
    }

    const result = await Swal.fire({
        title: 'ยืนยันการคืนสินค้า?',
        text: `รับคืน ${log.item} จำนวน ${log.qty} ก้อน กลับเข้าคลังสินค้า`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#64748b',
        cancelButtonColor: '#1e293b',
        confirmButtonText: 'ยืนยันการคืน',
        cancelButtonText: 'ยกเลิก'
    });

    if (result.isConfirmed) {
        Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
            const res = await fetch(API_URL, {
                method: 'POST',
                body: JSON.stringify({ action: "returnTestItem", id: log.id, item: log.item, qty: log.qty, cust: log.cust, sale: log.sale })
            });
            const resData = await res.json();
            if (resData.status === 'success') {
                await Swal.fire('บันทึกสำเร็จ', 'รับคืนสินค้าเข้าคลังเรียบร้อย', 'success');
                fetchData();
            } else {
                Swal.fire('เกิดข้อผิดพลาด', resData.message || 'บันทึกไม่สำเร็จ', 'error');
            }
        } catch (e) {
            Swal.fire('เกิดข้อผิดพลาด', e.message, 'error');
        }
    }
}

async function openModal(dir) {
    cart = [];
    const typeOpts = dir === 'IN' ?
        '<option value="รับหินใหม่ (New)">📥 รับหินใหม่ (New)</option><option value="รับคืน (Used)">🔄 รับคืน (Used)</option>' :
        '<option value="ขายสินค้า">💰 ขายสินค้า</option><option value="ส่งทดลองใช้งาน">🧪 ส่งทดลองใช้งาน</option>';

    await Swal.fire({
        title: dir === 'IN'
            ? '<span style="font-size: 1.5rem; font-weight: 800;">📥 บันทึกรับเข้า</span>'
            : '<span style="font-size: 1.5rem; font-weight: 800;">📤 บันทึกจ่ายออก</span>',
        width: '95%',
        showConfirmButton: true,
        confirmButtonText: '✅ บันทึกข้อมูลทั้งหมด',
        confirmButtonColor: 'var(--primary-green)',
        html: `
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:10px;">
                    <div class="swal-group"><label class="swal-label">ทีมงาน / Sale</label>
                        <select id="sw-sl" class="swal-input-custom">${sales.map(s => `<option>${s}</option>`).join('')}</select>
                    </div>
                <div class="swal-group">
                    <label class="swal-label">ลูกค้า / โรงสี</label>
                    <input id="sw-cs" class="swal-input-custom"
                        placeholder="พิมพ์ชื่อลูกค้า..."
                        autocomplete="off"
                        inputmode="text"
                        onkeyup="handleCustomerInput(this)">
                    <datalist id="cust-list">${customers.map(c => `<option value="${c}">`).join('')}</datalist>
                </div>
                </div>
                <div style="background:var(--bg-body); padding:12px; border-radius:15px; border:1px dashed var(--border-soft);">
                    <div class="swal-group"><label class="swal-label">1. เลือกประเภท</label>
                        <select id="sw-t" class="swal-input-custom" onchange="updateModalItems('${dir}')">${typeOpts}</select>
                    </div>
                    <div class="swal-group"><label class="swal-label">2. เลือกรายการ & จำนวน</label>
                        <div style="display:grid; grid-template-columns: 2fr 1fr; gap:5px;">
                            <select id="sw-it" class="swal-input-custom"></select>
                            <input id="sw-qt" type="number" class="swal-input-custom" value="1" inputmode="numeric">
                        </div>
                    </div>
                    <button type="button" onclick="addToCart('${dir}')" style="width:100%; padding:8px; background:var(--accent-green); color:white; border:none; border-radius:10px; font-weight:800;">➕ เพิ่มรายการ</button>
                </div>
                <div id="cart-display" style="margin:10px 0;"></div>
                <div class="swal-group"><label class="swal-label">หมายเหตุ (Remark)</label>
                    <input id="sw-rmk" class="swal-input-custom" placeholder="ระบุเพิ่มเติม...">
                </div>
                <button type="button" class="btn-close-modal" onclick="Swal.close()">❌ ปิดหน้าต่าง</button>
            `,
        didOpen: () => { updateModalItems(dir); },
        preConfirm: () => {
            const cust = document.getElementById('sw-cs').value.trim();
            if (!cust) return Swal.showValidationMessage('กรุณาใส่ชื่อลูกค้า');
            if (cart.length === 0) return Swal.showValidationMessage('กรุณาเพิ่มอย่างน้อย 1 รายการ');

            const sl = document.getElementById('sw-sl').value;
            const tl = document.getElementById('sw-t').value;
            const rmk = document.getElementById('sw-rmk').value;
            const ts = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' ' + new Date().toLocaleDateString('th-TH');

            return [{
                id: "L" + Date.now().toString(),
                date: ts,
                sale: sl,
                cust: cust,
                typeLabel: tl,
                direction: dir,
                status: tl === "ส่งทดลองใช้งาน" ? 'PENDING' : 'COMPLETED',
                item: cart.map(it => `${it.item} x${it.qty}`).join(', '),
                qty: cart.reduce((sum, i) => sum + Number(i.qty), 0),
                remark: rmk,
                details: cart
            }];
        }
    }).then(async (r) => {
        if (r.isConfirmed) await syncAction('addMultiLogs', { data: r.value });
    });
}

function updateModalItems(dir) {
    const typeSelect = document.getElementById('sw-t');
    const itemSelect = document.getElementById('sw-it');
    if (!typeSelect || !itemSelect) return;
    const type = typeSelect.value;
    let html = '<option value="">-- เลือกรายการหิน --</option>';

    if (!inventory || inventory.length === 0) {
        itemSelect.innerHTML = '<option value="">-- ไม่มีข้อมูลในคลัง --</option>';
        return;
    }

    inventory.forEach((it, i) => {
        const cond = (it.condition || "").toUpperCase();
        const qty = Number(it.qty) || 0;
        const itemText = `${it.model} #${it.grit} (${it.condition})`;

        if (dir === 'OUT') {
            if (qty > 0) html += `<option value="${i}">${itemText} [คงเหลือ ${qty}]</option>`;
        } else if (dir === 'CLAIM') {
            if (qty > 0) html += `<option value="${i}">${itemText} [คงเหลือ ${qty}]</option>`;
            else html += `<option value="${i}">${itemText} [❌ สินค้าหมด]</option>`;
        } else {
            const isNewType = type.includes('New');
            const isMatch = isNewType ? cond.includes('NEW') : cond.includes('USED');
            if (isMatch) html += `<option value="${i}">${itemText} (ปัจจุบัน: ${qty})</option>`;
        }
    });
    itemSelect.innerHTML = html;
}

function handleCustomerAutofill(input) {
    const val = input.value.trim();
    if (val.length < 2) return;

    const match = customers.find(c => c.toLowerCase().startsWith(val.toLowerCase()));

    if (match && match.length > val.length) {
        const start = input.selectionStart;
        input.value = match;
        input.setSelectionRange(start, match.length);
    }
}

function handleCustomerInput(input) {
    const isMobile = window.innerWidth <= 768;

    if (isMobile) {
        input.removeAttribute('list');
        setTimeout(() => {
            const val = input.value.trim();
            if (val.length >= 2) {
                const match = customers.find(c => c.toLowerCase().startsWith(val.toLowerCase()));
                if (match && match.length > val.length) {
                    const start = input.selectionStart;
                    input.value = match;
                    input.setSelectionRange(start, match.length);
                }
            }
        }, 10);
    } else {
        input.setAttribute('list', 'cust-list');
    }
}

async function openClaimModal() {
    cart = [];
    await Swal.fire({
        title: '<span style="font-size: 1.5rem; font-weight: 800; color: var(--purple);">🛡️ บันทึกเคลมสินค้า</span>',
        width: '95%',
        showConfirmButton: true,
        confirmButtonText: '✅ บันทึกเคลม',
        confirmButtonColor: 'var(--purple)',
        html: `
        <input type="hidden" id="sw-t" value="เคลมสินค้า">
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:10px;">
            <div class="swal-group"><label class="swal-label">ทีมงาน / Sale</label>
                <select id="sw-sl" class="swal-input-custom">${sales.map(s => `<option>${s}</option>`).join('')}</select>
            </div>
            <div class="swal-group">
                <label class="swal-label">ลูกค้า / โรงสี</label>
                <input id="sw-cs" class="swal-input-custom" placeholder="พิมพ์ชื่อลูกค้า..." autocomplete="off" onkeyup="handleCustomerInput(this)">
                <datalist id="cust-list">${customers.map(c => `<option value="${c}">`).join('')}</datalist>
            </div>
        </div>
        <div style="background:var(--bg-body); padding:12px; border-radius:15px; border:1px dashed var(--purple);">
            <div class="swal-group"><label class="swal-label" style="color:var(--purple);">เลือกรุ่น/เบอร์ (หินใหม่ที่จะเปลี่ยนให้ลูกค้า)</label>
                <div style="display:grid; grid-template-columns: 2fr 1fr; gap:5px;">
                    <select id="sw-it" class="swal-input-custom"></select>
                    <input id="sw-qt" type="number" class="swal-input-custom" value="1" inputmode="numeric">
                </div>
            </div>
            <button type="button" onclick="addToCart('CLAIM')" style="width:100%; padding:8px; background:var(--purple); color:white; border:none; border-radius:10px; font-weight:800;">➕ เพิ่มรายการเคลม</button>
        </div>
        <div id="cart-display" style="margin:10px 0;"></div>
        <div class="swal-group"><label class="swal-label">หมายเหตุ (Remark)</label>
            <input id="sw-rmk" class="swal-input-custom" placeholder="ระบุอาการเสีย หรือข้อมูลเพิ่มเติม...">
        </div>
        <button type="button" class="btn-close-modal" onclick="Swal.close()">❌ ปิดหน้าต่าง</button>
        `,
        didOpen: () => {
            updateModalItems('CLAIM');
        },
        preConfirm: () => {
            const cust = document.getElementById('sw-cs').value.trim();
            if (!cust) return Swal.showValidationMessage('กรุณาใส่ชื่อลูกค้า');
            if (cart.length === 0) return Swal.showValidationMessage('กรุณาเพิ่มอย่างน้อย 1 รายการ');

            const sl = document.getElementById('sw-sl').value;
            const rmk = document.getElementById('sw-rmk').value;
            const ts = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' ' + new Date().toLocaleDateString('th-TH');

            const hasOutOfStock = cart.some(it => it.isOutOfStock);

            return [{
                id: "L" + Date.now().toString(),
                date: ts,
                sale: sl,
                cust: cust,
                typeLabel: 'เคลมสินค้า',
                direction: hasOutOfStock ? 'NONE' : 'OUT',
                status: hasOutOfStock ? 'WAITING_STOCK' : 'WAITING_CLAIM',
                item: cart.map(it => `${it.item} x${it.qty}`).join(', '),
                qty: cart.reduce((sum, i) => sum + Number(i.qty), 0),
                remark: rmk,
                details: cart
            }];
        }
    }).then(async (r) => {
        if (r.isConfirmed) {
            await syncAction('addMultiLogs', { data: r.value });
        }
    });
}

async function closeClaim(targetId) {
    const log = allLogs.find(l => l.id === targetId) || allLogs.find(l => l.cust === targetId);
    if (!log) return Swal.fire('ข้อผิดพลาด', 'ไม่พบข้อมูลรายการนี้', 'error');

    const result = await Swal.fire({
        title: 'ยืนยันปิดงานเคลม?',
        text: `รับหิน ${log.item} จำนวน ${log.qty} ก้อน คืนเข้าคลังสินค้า`,
        icon: 'info',
        showCancelButton: true,
        confirmButtonColor: 'var(--purple)',
        cancelButtonColor: '#64748b',
        confirmButtonText: '✅ ยืนยันปิดงาน (บวกสต็อกคืน)',
        cancelButtonText: 'ยกเลิก'
    });

    if (result.isConfirmed) {
        await syncAction('closeClaim', { id: log.id, item: log.item, qty: log.qty, cust: log.cust, sale: log.sale });
    }
}

async function processStockClaim(targetId) {
    const log = allLogs.find(l => l.id === targetId);
    if (!log) return Swal.fire('ข้อผิดพลาด', 'ไม่พบข้อมูลรายการนี้', 'error');

    const result = await Swal.fire({
        title: 'สินค้าเข้าคลังแล้วใช่หรือไม่?',
        text: `ยืนยันเคลม ${log.item} จำนวน ${log.qty} ก้อน (ระบบจะตัดสต็อกและปิดงานทันที)`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#f43f5e',
        cancelButtonColor: '#64748b',
        confirmButtonText: '⚡ ยืนยันตัดสต็อก',
        cancelButtonText: 'ยกเลิก'
    });

    if (result.isConfirmed) {
        await syncAction('processStockClaim', { id: log.id, item: log.item, qty: log.qty, cust: log.cust, sale: log.sale });
    }
}

async function syncAction(action, payload) {
    Swal.fire({
        title: 'กำลังบันทึก...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
    });

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify({ action, ...payload })
        });

        const rawText = await response.text();
        let result;
        try {
            result = JSON.parse(rawText);
        } catch (parseErr) {
            throw new Error('เชื่อมต่อ Google Script ไม่ได้ตามที่คาด (ได้รับข้อมูลที่ไม่ใช่ JSON) — โปรดตรวจสอบว่า Deploy เวอร์ชันล่าสุดแล้ว และสิทธิ์การเข้าถึงตั้งเป็น "Anyone"');
        }

        if (result.status === "success") {
            await fetchData();
            await Swal.fire('บันทึกสำเร็จ', 'ระบบได้อัปเดตข้อมูลเรียบร้อยแล้ว', 'success');
        } else if (result.status === "error") {
            Swal.fire('แจ้งเตือน', result.message || 'เกิดข้อผิดพลาด', 'error');
        } else {
            throw new Error(result.message || 'เกิดข้อผิดพลาดที่เซิร์ฟเวอร์');
        }
    } catch (e) {
        console.error("Sync Error:", e);
        Swal.fire('แจ้งเตือน', e.message || 'ไม่สามารถเชื่อมต่อได้', 'error');
    }
}

function addToCart(dir) {
    const idx = document.getElementById('sw-it').value;
    const qt = parseInt(document.getElementById('sw-qt').value);
    if (!idx || isNaN(qt) || qt <= 0) {
        Swal.showValidationMessage('กรุณาเลือกรายการและระบุจำนวนให้ถูกต้อง');
        return;
    }

    const item = inventory[idx];
    const itemIdentifier = `${item.model} #${item.grit} (${item.condition})`;

    if (dir === 'OUT' && item.qty < qt) {
        Swal.showValidationMessage(`สต็อกไม่พอ (เหลือ ${item.qty} ก้อน)`);
        return;
    }

    let isOutOfStock = false;
    if (dir === 'CLAIM' && item.qty < qt) {
        isOutOfStock = true;
    }

    const existingItem = cart.find(it => it.item === itemIdentifier);
    if (existingItem) {
        if (dir === 'OUT' && item.qty < (existingItem.qty + qt)) {
            Swal.showValidationMessage(`สต็อกรวมในตะกร้าเกินจำนวนที่มี`);
            return;
        }
        if (dir === 'CLAIM' && item.qty < (existingItem.qty + qt)) {
            isOutOfStock = true;
        }
        existingItem.qty += qt;
        existingItem.isOutOfStock = existingItem.isOutOfStock || isOutOfStock;
    } else {
        cart.push({ id: "L" + Date.now(), item: itemIdentifier, qty: qt, isOutOfStock: isOutOfStock });
    }
    renderCart();
}

function renderCart() {
    let html = `<table class="cart-table"><tr><th>รายการ</th><th>จำนวน</th><th>ลบ</th></tr>`;
    cart.forEach((it, i) => { html += `<tr><td>${it.item}</td><td>${it.qty}</td><td><button onclick="removeFromCart(${i})" style="color:red; border:none; background:none;">❌</button></td></tr>`; });
    document.getElementById('cart-display').innerHTML = cart.length ? html + `</table>` : "";
}
window.removeFromCart = i => { cart.splice(i, 1); renderCart(); };

function showPage(pageId, elm) {
    document.querySelectorAll('.page').forEach(p => {
        p.classList.remove('active');
        p.style.display = 'none';
    });

    const targetPage = document.getElementById(pageId);
    if (targetPage) {
        targetPage.classList.add('active');
        targetPage.style.display = 'block';
    }

    document.querySelectorAll('.page-nav[data-page]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.page === pageId);
    });

    if (pageId === 'stats-page') {
        renderStatsCharts();
    }

    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
}

async function editRemark(id, oldRemark) {
    if (!isAdmin) return;

    const { value: newRemark } = await Swal.fire({
        title: 'แก้ไขหมายเหตุ',
        input: 'text',
        inputLabel: 'ระบุหมายเหตุใหม่',
        inputValue: oldRemark || '',
        showCancelButton: true,
        confirmButtonColor: 'var(--primary-green)',
        confirmButtonText: 'บันทึก',
        cancelButtonText: 'ยกเลิก',
        inputValidator: (value) => {
            if (value === undefined) return 'กรุณาระบุข้อมูล';
        }
    });

    if (newRemark !== undefined) {
        await syncAction('editRemark', { id: id, remark: newRemark });
    }
}

/**
 * แปลงข้อความวันที่แบบไทย (เช่น "14:32 1/8/2569") เป็น JS Date (ปี ค.ศ.)
 * คืนค่า null ถ้าแปลงไม่ได้
 */
function parseThaiDate(dateStr) {
    const m = String(dateStr).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!m) return null;
    const [, d, mo, y] = m;
    return new Date(parseInt(y) - 543, parseInt(mo) - 1, parseInt(d));
}

/**
 * รวบรวมข้อมูลยอดขายจาก allLogs (เฉพาะรายการที่ปิดเป็น "ขายสินค้า" แล้ว)
 * เพื่อใช้แสดงกราฟ/สรุปในหน้า "รายงานยอดขาย"
 */
function computeSalesStats() {
    const now = new Date();
    const startThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const startNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const trendStart = new Date(now);
    trendStart.setDate(now.getDate() - 13);
    trendStart.setHours(0, 0, 0, 0);

    let thisMonthQty = 0, lastMonthQty = 0;
    const dailyMap = {};
    const modelMap = {};
    const teamMap = {};

    allLogs.forEach(l => {
        if (l.typeLabel !== 'ขายสินค้า') return;
        const dt = parseThaiDate(l.date);
        if (!dt) return;
        const qty = Number(l.qty) || 0;

        if (dt >= startThisMonth && dt < startNextMonth) thisMonthQty += qty;
        if (dt >= startLastMonth && dt < startThisMonth) lastMonthQty += qty;

        if (dt >= trendStart) {
            const key = `${dt.getDate()}/${dt.getMonth() + 1}`;
            dailyMap[key] = (dailyMap[key] || 0) + qty;
        }

        String(l.item).split(', ').forEach(entry => {
            const mm = entry.match(/(.+) #(\d+)/);
            if (mm) {
                const key = `${mm[1].trim()} #${mm[2].trim()}`;
                const qMatch = entry.match(/x(\d+)/);
                const q = qMatch ? Number(qMatch[1]) : qty;
                modelMap[key] = (modelMap[key] || 0) + q;
            }
        });

        const teamKey = l.sale || 'ไม่ระบุ';
        teamMap[teamKey] = (teamMap[teamKey] || 0) + qty;
    });

    const trendLabels = [];
    const trendData = [];
    for (let i = 13; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(now.getDate() - i);
        const key = `${d.getDate()}/${d.getMonth() + 1}`;
        trendLabels.push(key);
        trendData.push(dailyMap[key] || 0);
    }

    const topModels = Object.entries(modelMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const teamEntries = Object.entries(teamMap).sort((a, b) => b[1] - a[1]);

    return { thisMonthQty, lastMonthQty, trendLabels, trendData, topModels, teamEntries };
}

let _chartTrend = null, _chartModels = null, _chartTeam = null;
const CHART_COLORS = ['#12a37a', '#e08a3c', '#7c5cd4', '#d94f4f', '#0e4a38', '#4fd8a6'];

function renderStatsCharts() {
    if (typeof Chart === 'undefined') return;
    const stats = computeSalesStats();

    const diffEl = document.getElementById('stat-month-diff');
    const diffCard = document.getElementById('stat-month-diff-card');
    document.getElementById('stat-month-now').innerText = stats.thisMonthQty;
    document.getElementById('stat-month-prev').innerText = stats.lastMonthQty;

    let diffPct = 0;
    if (stats.lastMonthQty > 0) {
        diffPct = ((stats.thisMonthQty - stats.lastMonthQty) / stats.lastMonthQty) * 100;
    } else if (stats.thisMonthQty > 0) {
        diffPct = 100;
    }
    const diffSign = diffPct > 0 ? '+' : '';
    diffEl.innerText = `${diffSign}${diffPct.toFixed(0)}%`;
    diffEl.style.color = diffPct >= 0 ? 'var(--accent-green)' : 'var(--danger-red)';
    diffCard.style.borderLeftColor = diffPct >= 0 ? 'var(--accent-green)' : 'var(--danger-red)';

    const trendCtx = document.getElementById('chart-trend');
    if (trendCtx) {
        if (_chartTrend) _chartTrend.destroy();
        _chartTrend = new Chart(trendCtx, {
            type: 'bar',
            data: {
                labels: stats.trendLabels,
                datasets: [{
                    label: 'ยอดขาย (ก้อน)',
                    data: stats.trendData,
                    backgroundColor: '#12a37a',
                    borderRadius: 5,
                    maxBarThickness: 26
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, ticks: { precision: 0 } },
                    x: { grid: { display: false } }
                }
            }
        });
    }

    const modelsCtx = document.getElementById('chart-models');
    if (modelsCtx) {
        if (_chartModels) _chartModels.destroy();
        _chartModels = new Chart(modelsCtx, {
            type: 'bar',
            data: {
                labels: stats.topModels.map(m => m[0]),
                datasets: [{
                    label: 'ขายได้ (ก้อน)',
                    data: stats.topModels.map(m => m[1]),
                    backgroundColor: CHART_COLORS,
                    borderRadius: 5
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { beginAtZero: true, ticks: { precision: 0 } }
                }
            }
        });
    }

    const teamCtx = document.getElementById('chart-team');
    if (teamCtx) {
        if (_chartTeam) _chartTeam.destroy();
        _chartTeam = new Chart(teamCtx, {
            type: 'doughnut',
            data: {
                labels: stats.teamEntries.map(t => t[0]),
                datasets: [{
                    data: stats.teamEntries.map(t => t[1]),
                    backgroundColor: CHART_COLORS
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } }
            }
        });
    }
}

init();