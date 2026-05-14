
const API_URL = "https://script.google.com/macros/s/AKfycbxrv1JEX0w0B1RdEyc3EwtbbSkfrnENNHI2PFe9-LvWLIKk1xPtAlfKFkUHjLCNIOEeCQ/exec";
const _0x4c2b = [49, 57, 48, 57, 49, 53, 49, 50];
const ADMIN_PASS = _0x4c2b.map(code => String.fromCharCode(code)).join('');
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
    fetchData();
}

async function checkAdminAuth(inputPass) {
    const encodedInput = btoa(inputPass);
    const secret = "MTkwOTE1MTI=";
    return encodedInput === secret;
}

async function toggleAdmin() {
    if (isAdmin) {
        isAdmin = false;
        document.body.classList.remove('admin-active');
        document.getElementById('admin-btn').innerText = '🔒';
        document.getElementById('admin-status').innerText = 'User Mode';

        // เพิ่มบรรทัดนี้: ให้กลับไปหน้า Dashboard อัตโนมัติเมื่อ Logout
        showPage('dash-page', document.querySelector('.nav-item'));

        renderAll();
        return;
    }

    const { value: pass } = await Swal.fire({
        title: 'เจ้าหน้าที่ผู้ดูแล',
        input: 'password',
        inputPlaceholder: 'รหัสผ่าน Admin',
        confirmButtonColor: '#064e3b',
        confirmButtonText: 'ยืนยัน',
        showCancelButton: true
    });

    if (pass === ADMIN_PASS) {
        isAdmin = true;
        document.body.classList.add('admin-active');
        document.getElementById('admin-btn').innerText = '🔓';
        document.getElementById('admin-status').innerText = 'Admin Mode';
        document.getElementById('admin-status').style.background = '#dcfce7';
        document.getElementById('admin-status').style.color = '#166534';
        renderAll();
    }
    else if (pass) {
        Swal.fire({ icon: 'error', title: 'รหัสผ่านไม่ถูกต้อง' });
    }
}

async function fetchData() {
    const refreshBtn = document.getElementById('main-refresh');
    const loadingScreen = document.getElementById('loading'); // ดึง Element หน้าโหลดมาเก็บไว้

    refreshBtn.classList.add('spinning');

    // ถ้ายังไม่มีข้อมูลใน Cache ให้แสดงหน้าโหลดทันที
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
    }
    catch (e) {
        console.error("Fetch Error:", e);
    }
    finally {
        // --- ส่วนที่ปรับปรุงใหม่: ระบบ Fade Out ---
        if (loadingScreen.style.display !== 'none') {
            loadingScreen.style.opacity = '0'; // เริ่มทำให้จางลง (ตาม CSS transition 0.5s ที่เราใส่ไว้)

            setTimeout(() => {
                loadingScreen.style.display = 'none'; // ซ่อน Element ทิ้งหลังจากจางเสร็จ
            }, 500); // 500ms คือเวลาที่สัมพันธ์กับ CSS transition: opacity 0.5s
        }

        refreshBtn.classList.remove('spinning');
    }
}

function renderAll() {
    let sell = 0, test = 0, todayLogs = [], activeTrials = [];
    const now = new Date();
    // สร้าง String วันที่ปัจจุบันในรูปแบบ d/m/25xx (พ.ศ.)
    const todayStr = `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear() + 543}`;

    // 1. ประมวลผลประวัติ (All Logs)
    allLogs.forEach(l => {
        const q = Number(l.qty) || 0;
        // เช็ครายการของวันนี้
        if (String(l.date).includes(todayStr)) { todayLogs.push(l); }

        // คำนวณสถิติ Dashboard
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
            // แปลง พ.ศ. เป็น ค.ศ. เพื่อสร้าง Date Object สำหรับเปรียบเทียบ
            return new Date(parseInt(y) - 543, parseInt(m) - 1, parseInt(d)).getTime();
        };
        return getTimestamp(a.date) - getTimestamp(b.date);
    });

    // อัปเดตตัวเลขยอดขายและการทดลองบน Dashboard
    const dSell = document.getElementById('d-sell');
    const dTest = document.getElementById('d-test');
    if (dSell) dSell.innerText = sell;
    if (dTest) dTest.innerText = test;

    // 2. แสดงรายการกิจกรรมของวันนี้ (Today's Activity)
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
                        <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid #f1f5f9;">
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

    // 3. รวมกลุ่มข้อมูลสต็อก (Grouped Stock Report)
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

    // 4. แสดงรายการค้างทดลอง (Active Trials) และคำนวณจำนวนวัน
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
                                <span style="background:#fef3c7; color:#b45309; padding:2px 6px; border-radius:4px; font-weight:bold;">${diffDays} วัน</span>
                            </td>
                        </tr>`;
            }).join('');
        }
    }

    // 5. แสดงรายการสต็อกในหน้าคลัง (ปรับปรุงให้รองรับทั้ง Mobile และ PC)
    const stockList = document.getElementById('stock-list');
    if (stockList) {
        // รวมกลุ่มข้อมูลตามรุ่นและเบอร์หิน
        const stockGrouped = {};
        inventory.forEach(it => {
            const key = `${it.model} #${it.grit}`;
            if (!stockGrouped[key]) stockGrouped[key] = { newQty: 0, usedQty: 0 };
            if (it.condition.includes('New')) stockGrouped[key].newQty = it.qty;
            else stockGrouped[key].usedQty = it.qty;
        });

        stockList.innerHTML = Object.keys(stockGrouped).map(modelKey => `
                <div class="card" style="margin-bottom: 12px; padding: 15px;">
                    <div style="font-weight: 800; color: var(--primary-green); font-size: 1rem; margin-bottom: 10px; border-bottom: 1px solid #f1f5f9; padding-bottom: 5px;">
                        📦 ${modelKey}
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <!-- ส่วนแสดงผลแบบยืดหยุ่น: บน PC จะดูเป็นระเบียบ บน Mobile จะดูง่าย[cite: 3] -->
                        <div style="flex: 1; display: flex; flex-direction: column; align-items: center; border-right: 1px solid #eee;">
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

    // 6. ส่วนการจัดการข้อมูลในหน้าตั้งค่า (Management Lists)
    // แสดงรายการรุ่นและเบอร์ที่ไม่ซ้ำกัน
    const mModels = document.getElementById('m-models-list');
    if (mModels) {
        mModels.innerHTML = inventory
            .filter((v, i, a) => a.findIndex(t => t.model === v.model && t.grit === v.grit) === i)
            .map(m => `
                    <div class="stock-item" style="display:flex; justify-content:space-between; align-items:center; padding:10px; border-bottom:1px solid #eee;">
                        <span style="font-weight:600;">${m.model} #${m.grit}</span>
                        ${isAdmin ? `<button onclick="deleteModel('${m.model}', '${m.grit}')" style="color:var(--danger-red); border:none; background:none; cursor:pointer; font-weight:bold;">ลบ</button>` : ''}
                    </div>`).join('');
    }

    // แสดงรายชื่อทีมงาน
    const mSales = document.getElementById('m-sales-list');
    if (mSales) {
        mSales.innerHTML = sales.map(s => `
                <div class="stock-item">
                    <span>${s}</span> 
                    ${isAdmin ? `<button onclick="deleteData('SALE','${s}')" style="color:red; border:none; background:none;">ลบ</button>` : ''}
                </div>`).join('');
    }

    // แสดงรายชื่อลูกค้า
    const mCusts = document.getElementById('m-custs-list');
    if (mCusts) {
        mCusts.innerHTML = customers.map(c => `
                <div class="stock-item">
                    <span>${c}</span> 
                    ${isAdmin ? `<button onclick="deleteData('CUST','${c}')" style="color:red; border:none; background:none;">ลบ</button>` : ''}
                </div>`).join('');
    }

    // 7. กรองประวัติกิจกรรมทั้งหมด
    if (typeof filterLogs === "function") filterLogs();
}

async function addModel() {
    const { value: fV } = await Swal.fire({ title: 'เพิ่มรุ่นหินใหม่', html: '<input id="sw-m" class="swal-input-custom" placeholder="รุ่น (เช่น R2)"><input id="sw-g" class="swal-input-custom" placeholder="เบอร์ (เช่น 600)">', preConfirm: () => [document.getElementById('sw-m').value, document.getElementById('sw-g').value] });
    if (fV && fV[0] && fV[1]) await syncAction('addModel', { model: fV[0], grit: fV[1] });
}

async function deleteModel(model, grit) {
    const { isConfirmed } = await Swal.fire({
        title: 'ยืนยันการลบ?',
        text: `คุณต้องการลบ ${model} #${grit} ออกจากระบบใช่หรือไม่? (ข้อมูลสต็อกทั้งหมดของรุ่นนี้จะหายไป)`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'ยืนยันการลบ',
        cancelButtonText: 'ยกเลิก'
    });

    if (isConfirmed) {
        await syncAction('deleteModel', { model, grit });
    }
}

async function addData(type) { const { value: val } = await Swal.fire({ title: 'เพิ่มข้อมูล', input: 'text', showCancelButton: true }); if (val) await syncAction('addData', { type, name: val }); }
async function deleteData(type, name) {
    // กำหนดข้อความตามประเภทที่จะลบ
    const typeText = type === 'SALE' ? 'ทีมงาน' : 'ลูกค้า';

    // แสดง Popup ยืนยันด้วย SweetAlert2
    const result = await Swal.fire({
        title: 'ยืนยันการลบ?',
        text: `คุณต้องการลบรายชื่อ ${typeText}: "${name}" ออกจากระบบใช่หรือไม่?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: 'var(--danger-red)',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'ใช่, ลบเลย!',
        cancelButtonText: 'ยกเลิก',
        reverseButtons: true // สลับตำแหน่งปุ่มให้ดูคุ้นเคย
    });

    // ถ้ากดยืนยัน (Confirm)
    if (result.isConfirmed) {
        try {
            await syncAction('deleteData', { type, name });
            // syncAction จะแสดง Swal.fire สำเร็จให้อยู่แล้วหลังจากทำงานเสร็จ
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

function filterLogs() {
    const dateVal = document.getElementById('search-date').value;
    const textVal = document.getElementById('search-text').value.toLowerCase();
    let filtered = [...allLogs].reverse();
    if (dateVal) {
        const [y, m, d] = dateVal.split('-');
        const searchStr = `${parseInt(d)}/${parseInt(m)}/${parseInt(y) + 543}`;
        filtered = filtered.filter(l => String(l.date).includes(searchStr));
    }
    if (textVal) { filtered = filtered.filter(l => String(l.item).toLowerCase().includes(textVal) || String(l.cust).toLowerCase().includes(textVal) || String(l.sale).toLowerCase().includes(textVal)); }
    const logList = document.getElementById('log-list');
    if (filtered.length === 0) { logList.innerHTML = `<center style="padding:50px; color:#94a3b8;">ไม่พบรายการ</center>`; }
    else {
        logList.innerHTML = filtered.slice(0, 30).map(l => `
                <div class="card" style="border-left:5px solid ${l.status === 'PENDING' ? 'var(--orange)' : (l.status === 'RETURNED' ? '#64748b' : (l.direction === 'IN' ? '#10b981' : '#ef4444'))};">
                    <div style="display:flex; justify-content:space-between;">
                        <div style="font-size:0.75rem;">
                            <b>${l.status === 'RETURNED' ? '🔄 รับคืนสินค้า' : l.typeLabel}</b> | <b>${l.item}</b><br>
                            
                            <!-- ส่วนที่แก้ไข: แสดงชื่อลูกค้า และ ชื่อทีมงานด้านล่าง -->
                            <div style="margin-top: 4px;">
                                <span style="font-weight: 700; font-size: 0.7rem; color: var(--text-main);">👤 ลูกค้า: ${l.cust}</span>
                            </div>
                            <div style="color: var(--primary-green); font-weight: 600; font-size: 0.7rem;">
                                🛠️ ผู้จัดทำ: ${l.sale || 'ไม่ระบุ'}
                            </div>

                            <!-- ส่วน Remark เดิม -->
                            ${l.remark ? `<div style="color: #f59e0b; font-size: 0.65rem; margin-top: 4px; font-weight: 600;">📝 Note: ${l.remark}</div>` : ''}
                        </div>
                        
                        <div style="text-align:right;">
                            <b style="font-size:1.1rem;">${(l.direction === 'IN' || l.status === 'RETURNED') ? '+' : '-'}${l.qty}</b><br>
                            <small style="font-size:0.6rem;">${l.date}</small>
                            
                            ${l.status === 'PENDING' ? `
                                <div style="display:flex; gap:4px; margin-top:5px; justify-content:flex-end;">
                                    <button class="btn-confirm-sale" onclick="confirmTestToSale('${l.id}')">💰 ขาย</button>
                                    <button class="btn-confirm-sale" style="background:#64748b;" onclick="returnTestItem('${l.id}')">🔄 คืน</button>
                                </div>` : ''}
                            
                            ${isAdmin ? `
                                <div style="margin-top:8px; display: flex; gap: 10px; justify-content: flex-end;">
                                    <button onclick="editRemark('${l.id}', '${l.remark || ''}')" 
                                            style="background:none; color:var(--orange); border:none; font-size:0.8rem; cursor:pointer; text-decoration:underline; font-weight:bold;">
                                            📝 แก้ไข
                                    </button>
                                    <button onclick="cancelLog('${l.id}')" 
                                            style="background:none; color:var(--danger-red); border:none; font-size:0.8rem; cursor:pointer; text-decoration:underline; font-weight:bold;">
                                            🚨 ยกเลิก
                                    </button>
                                </div>` : ''}
                        </div>
                    </div>
                </div>`).join('');
    }
}

async function confirmTestToSale(logId) { const res = await Swal.fire({ title: 'ยืนยันการขาย?', icon: 'question', showCancelButton: true }); if (res.isConfirmed) await syncAction('confirmTestToSale', { id: logId }); }
async function returnTestItem(logId) { const res = await Swal.fire({ title: 'ยืนยันการรับคืน?', text: "หินจะถูกนำกลับเข้าสต็อก (Used) ทันที", icon: 'warning', showCancelButton: true, confirmButtonColor: '#64748b', confirmButtonText: '✅ ยืนยันรับคืน' }); if (res.isConfirmed) await syncAction('returnTestItem', { id: logId }); }

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
                        onkeyup="handleCustomerInput(this)"> <!-- ใช้ฟังก์ชันใหม่ที่คุมทั้ง 2 ระบบ -->
                    <datalist id="cust-list">${customers.map(c => `<option value="${c}">`).join('')}</datalist>
                </div>
                </div>
                <div style="background:#f8fafc; padding:12px; border-radius:15px; border:1px dashed #cbd5e1;">
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
                id: Date.now().toString(),
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

function addToCart(dir) {
    const idx = document.getElementById('sw-it').value;
    const qt = parseInt(document.getElementById('sw-qt').value);
    if (!idx || qt <= 0) return;

    const item = inventory[idx];
    const itemIdentifier = `${item.model} #${item.grit} (${item.condition})`;

    if (dir === 'OUT' && item.qty < qt) {
        Swal.showValidationMessage(`สต็อกไม่พอ (เหลือ ${item.qty} ก้อน)`);
        return;
    }

    const existingItem = cart.find(it => it.item === itemIdentifier);
    if (existingItem) {
        if (dir === 'OUT' && item.qty < (existingItem.qty + qt)) {
            Swal.showValidationMessage(`สต็อกรวมในตะกร้าเกินจำนวนที่มี`);
            return;
        }
        existingItem.qty += qt;
    } else {
        cart.push({ id: Date.now(), item: itemIdentifier, qty: qt });
    }
    renderCart();
}

function renderCart() { let html = `<table class="cart-table"><tr><th>รายการ</th><th>จำนวน</th><th>ลบ</th></tr>`; cart.forEach((it, i) => { html += `<tr><td>${it.item}</td><td>${it.qty}</td><td><button onclick="removeFromCart(${i})" style="color:red; border:none; background:none;">❌</button></td></tr>`; }); document.getElementById('cart-display').innerHTML = cart.length ? html + `</table>` : ""; }
window.removeFromCart = i => { cart.splice(i, 1); renderCart(); };

/**
 * ฟังก์ชันส่งข้อมูลไปยัง Google Apps Script
 * ปรับปรุง: ตรวจสอบสถานะความสำเร็จจาก Server
 */
async function syncAction(action, payload) {
    document.getElementById('loading').style.display = 'flex';
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify({ action, ...payload })
        });

        const result = await response.json(); // รับสถานะจาก Server[cite: 5]

        if (result.status === "success") {
            await fetchData();
            Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ', timer: 1000, showConfirmButton: false });
        } else {
            throw new Error(result.message || 'เกิดข้อผิดพลาดที่เซิร์ฟเวอร์');
        }
    } catch (e) {
        console.error("Sync Error:", e);
        Swal.fire('แจ้งเตือน', e.message || 'ไม่สามารถเชื่อมต่อได้', 'error');
    } finally {
        document.getElementById('loading').style.display = 'none';
    }
}
function showPage(pageId, elm) {
    // 1. ซ่อนทุกหน้าก่อน
    document.querySelectorAll('.page').forEach(p => {
        p.classList.remove('active');
        p.style.display = 'none'; // มั่นใจว่าหน้าอื่นถูกซ่อนจริง
    });

    // 2. แสดงหน้าที่เลือก
    const targetPage = document.getElementById(pageId);
    if (targetPage) {
        targetPage.classList.add('active');
        targetPage.style.display = 'block';
    }

    // 3. ปรับสถานะปุ่มเมนู (Active)
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
    if (elm) elm.classList.add('active');

    // 🚀 ส่วนสำคัญ: สั่งให้หน้าจอกระโดดไปบนสุดทันทีเมื่อเปลี่ยนหน้า
    window.scrollTo({
        top: 0,
        left: 0,
        behavior: 'instant' // ใช้ 'instant' เพื่อให้เปลี่ยนหน้าปุ๊บ ไปบนสุดปั๊บ ไม่ต้องรอรูดขึ้น
    });
}
init();
/**
 * ฟังก์ชันสำหรับ Admin เพื่อแก้ไขหมายเหตุใน Log
 * @param {string} id - ไอดีของรายการ Log
 * @param {string} oldRemark - หมายเหตุเดิมที่มีอยู่
 */
async function editRemark(id, oldRemark) {
    if (!isAdmin) return; // ป้องกันกรณีที่ไม่ใช่ Admin

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
        // ส่งข้อมูลไปยัง Server ผ่าน syncAction
        await syncAction('editRemark', { id: id, remark: newRemark });
    }
}
//--------------------------------------------------------------
/**
 * ฟังก์ชันสำหรับโหลดรายการหินลงใน Dropdown ใน Modal
 * @param {string} dir - ทิศทาง 'IN' (รับเข้า) หรือ 'OUT' (จ่ายออก)
 */
function updateModalItems(dir) {
    const typeSelect = document.getElementById('sw-t');
    const itemSelect = document.getElementById('sw-it');

    if (!typeSelect || !itemSelect) return;

    const type = typeSelect.value;
    let html = '<option value="">-- เลือกรายการหิน --</option>';

    // ตรวจสอบว่ามีข้อมูลสต็อกหรือไม่
    if (!inventory || inventory.length === 0) {
        itemSelect.innerHTML = '<option value="">-- ไม่มีข้อมูลในคลัง --</option>';
        return;
    }

    inventory.forEach((it, i) => {
        const cond = (it.condition || "").toUpperCase();
        const qty = Number(it.qty) || 0;
        const itemText = `${it.model} #${it.grit} (${it.condition})`;

        if (dir === 'OUT') {
            // จ่ายออก: แสดงเฉพาะที่มีของ[cite: 4]
            if (qty > 0) {
                html += `<option value="${i}">${itemText} [คงเหลือ ${qty}]</option>`;
            }
        } else {
            // รับเข้า: แยกตาม New หรือ Used[cite: 4]
            const isNewType = type.includes('New');
            const isMatch = isNewType ? cond.includes('NEW') : cond.includes('USED');

            if (isMatch) {
                html += `<option value="${i}">${itemText} (ปัจจุบัน: ${qty})</option>`;
            }
        }
    });

    itemSelect.innerHTML = html;
}

function handleCustomerAutofill(input) {
    const val = input.value.trim();
    if (val.length < 2) return; // เริ่มทำงานเมื่อพิมพ์ 2 ตัวอักษรขึ้นไป

    // ค้นหาชื่อที่ขึ้นต้นด้วยสิ่งที่พิมพ์
    const match = customers.find(c =>
        c.toLowerCase().startsWith(val.toLowerCase())
    );

    if (match && match.length > val.length) {
        const start = input.selectionStart;
        input.value = match; // เติมชื่อเต็ม
        input.setSelectionRange(start, match.length); // ไฮไลท์ส่วนที่เติมเพื่อให้พิมพ์ทับได้
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