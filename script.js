const API_URL = "https://script.google.com/macros/s/AKfycbzJ8HJ1FlVckHAwJxkGJbySBbDfrtcEoxYR9tbxSBqhYv3smR4U1qqQC4mwnA57EF7Jvw/exec";
const APP_VERSION = '2.5.0';
const BACKDATE_MAX_DAYS = 90; // ต้องตรงกับ Google Script
const ADMIN_SESSION_KEY = 'rds_admin_session';
const CACHE_KEY = 'rds_cache';
const DEFAULT_MIN_STOCK = 10;
const TRIAL_WARN_DAYS = 7, TRIAL_ALERT_DAYS = 14;

let inventory = [], sales = [], customers = [], allLogs = [], summary = null, totalLogs = 0;
let isAdmin = false, adminToken = '';
let currentPage = 'exec';

// ============================================================
// ภาษา (ไทย / English) — v2.5.0
//   T('ข้อความไทย')  → ข้อความหน้าจอ (แปลไว้ล่วงหน้าใน EN_DICT ด้านล่าง แก้คำแปลได้ที่นี่)
//   U(ข้อความที่ผู้ใช้พิมพ์) → ชื่อลูกค้า/เซลล์/หมายเหตุ แปลอัตโนมัติด้วย Google Translate (เก็บในชีต Translations, Admin แก้ได้)
//   ข้อความส่ง LINE กลุ่มทีม (copyReport / copyTrials / copyWeekly) เป็นภาษาไทยเสมอ
// ============================================================
const LANG_KEY = 'rds_lang';
const LANG = (() => { try { return localStorage.getItem(LANG_KEY) === 'en' ? 'en' : 'th'; } catch (e) { return 'th'; } })();
const EN_DICT = {
    " (จากทดลอง)": " (from trial)",
    " (ย้อนหลัง)": " (backdated)",
    " <span class=\"pill p-low\">ใกล้หมด</span>": " <span class=\"pill p-low\">Low stock</span>",
    " · <span class=\"warn\">ไม่พอ จะบันทึกเป็นรอของเข้า</span>": " · <span class=\"warn\">Not enough — will be saved as awaiting stock</span>",
    " · ตั้งแต่ ": " · since ",
    " · เหตุผล: ": " · Reason: ",
    " · ไม่ตัดสต็อก": " · no stock deducted",
    " · ไม่เพิ่มสต็อก": " · no stock added",
    " ก้อน": " pcs",
    " ก้อน/สัปดาห์": " pcs/week",
    " น.": "",
    " ยอดขาย/กราฟนับเข้าวันที่จริง": " Sales/charts count on the actual date",
    " รายเกิน ": " over ",
    " วัน": " days",
    " แต่จำนวนคงเหลือไม่เปลี่ยน": " but on-hand quantity stays unchanged",
    " — ต้องเข้าสู่ระบบ Admin (รูปกุญแจ) ก่อน": " — sign in as Admin (key icon) first",
    "% จากเดือนก่อน": "% vs last month",
    "% จากเดือนก่อน (": "% vs last month (",
    "/ยอดขาย": "/sales",
    "7 วันล่าสุด": "Last 7 days",
    "<br><small>ของไม่พอ — บันทึกเป็นรอของเข้า</small>": "<br><small>Not enough stock — saved as awaiting stock</small>",
    "<br>เหตุผล: ": "<br>Reason: ",
    "<button onclick=\"clearHist()\">ล้างตัวกรอง</button>": "<button onclick=\"clearHist()\">Clear filters</button>",
    "<div class=\"card empty\">ยังไม่มีรายการรับเข้า</div>": "<div class=\"card empty\">No receipts yet</div>",
    "<div class=\"card empty\">ไม่พบรายการที่ตรงกับตัวกรอง</div>": "<div class=\"card empty\">No entries match the filters</div>",
    "<div class=\"card empty\">ไม่พบรุ่นที่ค้นหา</div>": "<div class=\"card empty\">No models found</div>",
    "<div class=\"empty\" style=\"padding:14px\">ยังไม่มีสินค้า เลือกจากรายการ</div>": "<div class=\"empty\" style=\"padding:14px\">No items yet — pick from the list</div>",
    "<div class=\"empty\">ปีนี้ยังไม่มียอดขาย</div>": "<div class=\"empty\">No sales this year yet</div>",
    "<div class=\"empty\">ยังไม่มีประวัติ</div>": "<div class=\"empty\">No history yet</div>",
    "<div class=\"empty\">ยังไม่มีประวัติการซื้อ</div>": "<div class=\"empty\">No purchase history yet</div>",
    "<div class=\"empty\">ยังไม่มีรายชื่อ</div>": "<div class=\"empty\">No names yet</div>",
    "<div class=\"empty\">ยังไม่มีรุ่น</div>": "<div class=\"empty\">No models yet</div>",
    "<div class=\"empty\">ยังไม่มีรุ่นหินในระบบ (Admin เพิ่มได้ที่ตั้งค่า)</div>": "<div class=\"empty\">No stone models yet (Admin can add them in Settings)</div>",
    "<div class=\"empty\">ยังไม่มีสินค้า</div>": "<div class=\"empty\">No items yet</div>",
    "<div class=\"empty\">วันนี้ยังไม่มีรายการ</div>": "<div class=\"empty\">No entries today yet</div>",
    "<div class=\"empty\">เดือนนี้ยังไม่มียอดขาย</div>": "<div class=\"empty\">No sales this month yet</div>",
    "<div class=\"empty\">ไม่มีลูกค้าที่ทดลองใช้งานอยู่ตอนนี้ 🎉</div>": "<div class=\"empty\">No customers on trial right now 🎉</div>",
    "<div class=\"empty\">ไม่มีเรื่องค้าง</div>": "<div class=\"empty\">Nothing pending</div>",
    "<div class=\"notice\" style=\"margin-top:8px\">มีรุ่นที่ของไม่พอ ระบบจะบันทึกเคลมนี้เป็น “รอของเข้า” ยังไม่ตัดสต็อก</div>": "<div class=\"notice\" style=\"margin-top:8px\">Some models are short. This claim will be saved as “Awaiting stock” and stock will not be deducted yet</div>",
    "<div class=\"notice\">รับคืนเป็น Used — ถ้าเป็นของทดลองที่ลูกค้าคืน ให้กด “รับคืน” ที่รายการทดลองแทน สต็อกจะไม่ซ้ำ</div>": "<div class=\"notice\">Returned as Used — if this is a trial unit the customer returned, use “Return” on the trial list instead so stock is not counted twice</div>",
    "<div class=\"notice\">ส่งทดลองหลายรุ่นในครั้งเดียวได้ · ตอนปิดงานจะปิดทั้งรายการ (ลูกค้าซื้อทั้งหมด หรือคืนทั้งหมด)</div>": "<div class=\"notice\">You can send several models on one trial · Closing it closes the whole entry (customer buys all, or returns all)</div>",
    "<div class=\"ptitle\"><h1>Dashboard</h1></div><div class=\"card empty\">กำลังโหลดข้อมูลสรุป... ถ้าไม่ขึ้น ให้ตรวจว่า Deploy Google Script เวอร์ชันล่าสุดแล้ว</div>": "<div class=\"ptitle\"><h1>Dashboard</h1></div><div class=\"card empty\">Loading summary... If nothing appears, check that the latest Google Script version is deployed</div>",
    "<input id=\"sw-m\" class=\"swal2-input\" placeholder=\"รุ่น (เช่น R2)\"><input id=\"sw-g\" class=\"swal2-input\" placeholder=\"เบอร์ (ตัวเลข เช่น 600)\" inputmode=\"numeric\">": "<input id=\"sw-m\" class=\"swal2-input\" placeholder=\"Model (e.g. R2)\"><input id=\"sw-g\" class=\"swal2-input\" placeholder=\"Grit (number, e.g. 600)\" inputmode=\"numeric\">",
    "<span class=\"muted\" style=\"font-size:12px\">หมด</span>": "<span class=\"muted\" style=\"font-size:12px\">Out</span>",
    "<span class=\"muted\" style=\"font-size:12px\">เคลมเปลี่ยนเป็นหิน New</span>": "<span class=\"muted\" style=\"font-size:12px\">Claim replaced with New stone</span>",
    "<span class=\"pill p-alert\">เคลม · รอของเข้า</span>": "<span class=\"pill p-alert\">Claim · awaiting stock</span>",
    "<span class=\"pill p-bd\">📅 ย้อนหลัง</span>": "<span class=\"pill p-bd\">📅 Backdated</span>",
    "<span class=\"pill p-cancel\">ยกเลิกแล้ว</span>": "<span class=\"pill p-cancel\">Cancelled</span>",
    "<span class=\"pill p-claim\">เคลม · รอปิดงาน</span>": "<span class=\"pill p-claim\">Claim · to close</span>",
    "<span class=\"pill p-claim\">เคลมแล้ว</span>": "<span class=\"pill p-claim\">Claimed</span>",
    "<span class=\"pill p-done\">ทดลอง · รับคืนแล้ว</span>": "<span class=\"pill p-done\">Trial · returned</span>",
    "<span class=\"pill p-low\">ใกล้หมด</span>": "<span class=\"pill p-low\">Low stock</span>",
    "กดการ์ดเพื่อดูประวัติรุ่น": "Tap a card to see model history",
    "กรุณากดรูปกุญแจเพื่อเข้าสู่ระบบ Admin ใหม่ แล้วทำรายการอีกครั้ง": "Tap the key icon to sign in as Admin again, then retry",
    "กรุณากรอกรุ่นและเบอร์": "Please enter model and grit",
    "กรุณาระบุเหตุผล": "Please give a reason",
    "กรุณาระบุเหตุผลที่บันทึกย้อนหลัง": "Please give a reason for backdating",
    "กรุณารีเฟรชข้อมูลก่อน": "Please refresh the data first",
    "กรุณารีเฟรชแล้วลองใหม่": "Please refresh and try again",
    "กรุณาเลือกวันที่เกิดขึ้นจริง": "Please pick the actual date",
    "กรุณาเลือกสินค้าอย่างน้อย 1 รายการ": "Please select at least 1 item",
    "กรุณาใส่ชื่อลูกค้า": "Please enter the customer name",
    "กรุณาใส่ตัวเลข 0 ขึ้นไป": "Please enter a number 0 or higher",
    "กลับ": "Back",
    "การตัดสต็อก": "Stock deduction",
    "การบันทึกแบบไม่ตัดสต็อกต้องเข้าสู่ระบบ Admin": "Recording without stock deduction requires Admin sign-in",
    "การเพิ่มสต็อก": "Stock addition",
    "กำลังตรวจสอบ...": "Checking...",
    "กำลังบันทึก...": "Saving...",
    "กำลังโหลดประวัติของรุ่นนี้...": "Loading this model’s history...",
    "กำลังโหลดประวัติทั้งหมดของลูกค้า...": "Loading the customer’s full history...",
    "ก้อน": "pcs",
    "ก้อน ลบได้เมื่อยอดเป็น": "pcs. It can be deleted when the balance is",
    "ของเข้าคลังแล้ว?": "Stock arrived?",
    "ของเข้าแล้ว ตัดสต็อก": "Stock arrived — deduct",
    "ขอสั่งซื้อเพิ่ม": "Restock request",
    "ขาย": "Sale",
    "ขายปีนี้": "Sold this year",
    "ขายสินค้า": "Sale",
    "ขายเฉลี่ย ": "Avg. sales ",
    "ขายเดือนนี้": "Sold this month",
    "ขายได้ (ก้อน)": "Sold (pcs)",
    "ข้อความถึง Supplier": "Supplier message",
    "ข้อความถึง Supplier (ภาษาอังกฤษ)": "Supplier message (English)",
    "ข้อความภาษาอังกฤษ": "English message",
    "ข้อความยาวเกินไป": "Text is too long",
    "ข้อความเป็นภาษาอังกฤษ แก้ไขได้ก่อนคัดลอก": "Messages are in English — you can edit before copying",
    "ข้อมูล ณ": "Data as of",
    "ข้อมูลบันทึกย้อนหลังไม่ครบ": "Backdate details are incomplete",
    "คงเหลือ": "On hand",
    "คงเหลือในคลัง": "In stock",
    "ครั้งล่าสุด": "Last time",
    "คลังสินค้า": "Inventory",
    "ความเคลื่อนไหวล่าสุด": "Recent activity",
    "ความเคลื่อนไหววันนี้": "Today’s activity",
    "คัดลอกข้อความ": "Copy message",
    "คัดลอกรายงานสต็อก ส่ง": "Copy stock report for",
    "คัดลอกรายชื่อ ส่ง": "Copy list for",
    "คัดลอกสรุปสัปดาห์ที่แล้ว ส่ง": "Copy last week’s summary for",
    "คัดลอกแล้ว นำไปวางในอีเมลหรือแชทได้เลย": "Copied — paste it into your email or chat",
    "คัดลอกแล้ว นำไปวางในแชท LINE ได้เลย": "Copied — paste it into the LINE chat",
    "คำนวณจากทุกรายการ": "Calculated from all entries",
    "ค้นหารุ่น / เบอร์": "Search model / grit",
    "ค้างดำเนินการ": "Pending",
    "จาก": "from",
    "จากทั้งหมด": "of",
    "จำนวน": "Quantity",
    "จำนวนคงเหลือ<b>ไม่เปลี่ยน</b>": "On-hand quantity <b>unchanged</b>",
    "จำนวนที่จะสั่ง": "Quantities to order",
    "จ่ายออก": "Issued",
    "ชื่อ": "Name",
    "ชื่อภาษาอังกฤษ": "English name",
    "ชื่อรุ่นห้ามมีเครื่องหมาย # , ( ) |": "Model names cannot contain # , ( ) |",
    "ช่วงเวลา": "Period",
    "ซื้อรวม": "Total bought",
    "ซื้อล่าสุด": "Last purchase",
    "ซื้อแล้วทั้งหมด": "Bought in total",
    "ซ่อนตะกร้า": "Hide cart",
    "ดูคลัง": "View stock",
    "ดูตะกร้า / ยืนยัน": "View cart / confirm",
    "ดูทั้งหมด": "View all",
    "ดูประวัติรุ่นนี้": "View model history",
    "ดูเพิ่ม": "Show more",
    "ตรวจสอบอินเทอร์เน็ตแล้วกดปุ่มรีเฟรชอีกครั้ง": "Check your internet connection and tap refresh again",
    "ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่": "Check your internet connection and try again",
    "ตอนส่งทดลองรายการนี้": "When this trial was sent, stock was ",
    "ตะกร้า": "Cart",
    "ตะกร้ายังว่าง": "Cart is empty",
    "ตัดสต็อก": "Deduct stock",
    "ตัดสต็อก (แนะนำ)": "Deduct stock (recommended)",
    "ตัดสต็อก ›": "Deduct ›",
    "ตัดสต็อกตอนบันทึก": "Deduct stock when saving",
    "ตัดสต็อกและปิดงานเคลมเรียบร้อย": "Stock deducted and claim closed",
    "ตัวอย่างข้อความ": "Message preview",
    "ตั้งค่าระบบ": "Settings",
    "ตั้งเกณฑ์": "Set threshold",
    "ต้องดำเนินการ": "Needs action",
    "ถ้าหินยังอยู่ในคลังจริง ยอดจะไม่ตรง": "if the stones are still in the warehouse, the balance will be off",
    "ทดลอง": "Trial",
    "ทดลอง / เคลมค้าง": "Trials / open claims",
    "ทดลองอยู่ที่ลูกค้า": "On trial at customers",
    "ทั้งหมด": "All",
    "ทำรายการไม่สำเร็จ": "Action failed",
    "ทีมงาน": "Team member",
    "ทีมงาน / เซลล์": "Team / reps",
    "ทุกช่วงเวลา": "All time",
    "ทุกเซลล์": "All reps",
    "น.": "",
    "บันทึก": "Save",
    "บันทึกชื่อภาษาอังกฤษแล้ว": "English name saved",
    "บันทึกย้อนหลัง": "Backdated entry",
    "บันทึกย้อนหลังได้ไม่เกิน": "Backdating is limited to",
    "บันทึกรายการ": "Record entry",
    "บันทึกสำเร็จ": "Saved",
    "บันทึกเกณฑ์แล้ว": "Threshold saved",
    "บันทึกเมื่อ": "Recorded at",
    "ประวัติ": "History",
    "ประวัติทั้งหมด": "Full history",
    "ประวัติรุ่น": "Model history",
    "ประวัติเดิมยังอยู่": "existing history is kept",
    "ปิด": "Close",
    "ปิดการขาย": "Close the sale of",
    "ปิดการขายเรียบร้อย": "Sale closed",
    "ปิดงาน ›": "Close ›",
    "ปิดงานเคลม": "Close claim",
    "ปิดงานเคลม?": "Close claim?",
    "ปิดงานเคลมเรียบร้อย": "Claim closed",
    "ปิดรายการอย่างเดียว ไม่เพิ่มสต็อก": "Close entry only, no stock added",
    "ปิดรายการเรียบร้อย (ไม่เพิ่มสต็อก)": "Entry closed (no stock added)",
    "ปีนี้": "This year",
    "พบ": "Found",
    "พอขายราว": "Lasts about",
    "พิมพ์ชื่อ...": "Type a name...",
    "ภาพรวมวันนี้": "Today at a glance",
    "ม.ค.": "Jan",
    "มีรายการค้าง": "Has pending items",
    "ยกเลิก": "Cancel",
    "ยกเลิกรายการ": "Cancel entry",
    "ยกเลิกรายการนี้?": "Cancel this entry?",
    "ยกเลิกรายการเรียบร้อย": "Entry cancelled",
    "ยกเลิกแล้ว": "Cancelled",
    "ยอดขาย": "Sales",
    "ยอดขาย (ก้อน)": "Sales (pcs)",
    "ยอดขายนับวันนี้": "counted as sold today",
    "ยอดขายรายเซลล์": "Sales by rep",
    "ยังมีสต็อกคงเหลือ": "still has stock on hand:",
    "ยังลบไม่ได้": "Cannot delete yet",
    "ยังไม่มีข้อมูลสรุป": "No summary data yet",
    "ยังไม่มีชื่อภาษาอังกฤษ": "No English name yet",
    "ยังไม่มียอดขาย 4 สัปดาห์": "No sales in 4 weeks",
    "ยืนยัน": "Confirm",
    "ยืนยันการลบ?": "Confirm delete?",
    "ยืนยันขาย": "Confirm sale",
    "ยืนยันตัดสต็อก": "Confirm deduction",
    "ยืนยันปิดงาน": "Confirm close",
    "ยืนยันยกเลิก": "Confirm cancel",
    "ยืนยันรับของ": "Goods received",
    "ยืนยันรับคืน": "Confirm return",
    "ย้อนหลัง": "Backdated",
    "รวม": "Total",
    "รหัสผ่าน Admin": "Admin password",
    "รหัสผ่านไม่ถูกต้อง": "Incorrect password",
    "รอเคลม": "Awaiting claim",
    "ระบบจะคืนสต็อกตามรายการนี้": "Stock will be restored for this entry",
    "ระบบจะหักสต็อกที่รับเข้าออก": "The received stock will be deducted",
    "ระบบแนะนำให้รุ่นที่ใกล้หมด = เกณฑ์ × 3 − New คงเหลือ · แก้ตัวเลขได้": "Suggested for low-stock models = threshold × 3 − New on hand · you can change the numbers",
    "รับของทดลองคืน?": "Trial returned?",
    "รับคืน": "Return",
    "รับคืน (Used)": "Return (Used)",
    "รับคืนของทดลอง": "Return trial",
    "รับคืนเข้าคลังเรียบร้อย": "Returned to stock",
    "รับจาก (Supplier / ลูกค้าที่คืน)": "Received from (supplier / returning customer)",
    "รับหินใหม่ (New)": "Received (New)",
    "รับเข้า": "Receive",
    "รับเข้าคลังเป็น Used (แนะนำ)": "Receive into stock as Used (recommended)",
    "รับเข้าล่าสุด": "Last received",
    "ราย": "cases",
    "รายการ": "entries",
    "รายการนี้จะ": "This entry will",
    "รายการนี้บันทึกแบบไม่ตัดสต็อก จะไม่มีการปรับยอด": "This entry was recorded without stock deduction — no adjustment will be made",
    "รายการนี้ยังไม่ได้ตัดสต็อก จะไม่มีการปรับยอด": "This entry has not deducted stock — no adjustment will be made",
    "รายการยังอยู่ในประวัติพร้อมเหตุผล": "The entry stays in history with the reason",
    "รายการล่าสุด": "latest entries",
    "รายงานสต็อก": "Stock report",
    "รายรอของเข้า": "awaiting stock",
    "รายเกิน": "overdue >",
    "รุ่น": "models",
    "รุ่นหิน": "Stone models",
    "ลด": "Decrease",
    "ลบ": "Delete",
    "ลบรายชื่อ": "Delete",
    "ลบรุ่นนี้?": "Delete this model?",
    "ลบรุ่นแล้ว": "Model deleted",
    "ลูกค้า": "Customers",
    "ลูกค้า / โรงสี": "Customer / mill",
    "ลูกค้า รุ่น เซลล์ หมายเหตุ": "Customer, model, rep, note",
    "ลูกค้าซื้อสูงสุด": "Top customers",
    "ลูกค้าซื้อแล้ว": "Customer bought",
    "ลูกค้าตกลงซื้อแล้ว?": "Customer agreed to buy?",
    "ลูกค้าทดลองใช้งาน": "Customers on trial",
    "ลูกค้าที่ซื้อรุ่นนี้": "Customers who bought this model",
    "วัน": "days",
    "วันขึ้นไปเหลือง": "days+ = yellow",
    "วันที่ทำรายการ": "Entry date",
    "วันที่ย้อนหลังต้องไม่เกินเวลาปัจจุบัน": "Backdated date cannot be in the future",
    "วันที่เกิดขึ้นจริง": "Actual date",
    "วันที่ไม่ถูกต้อง": "Invalid date",
    "วันนี้": "Today",
    "วันล่าสุด": "days",
    "วันแดง": "days = red",
    "สต็อกคงเหลือ": "Stock on hand",
    "สต็อกรายรุ่น": "Stock by model",
    "สต็อกไม่พอ": "Not enough stock",
    "สลับ New / Used แล้วเลือกต่อได้ ตะกร้าเก็บรายการไว้ทั้งหมด": "Switch New / Used and keep picking — the cart keeps everything",
    "สวัสดีตอนบ่าย": "Good afternoon",
    "สวัสดีตอนเช้า": "Good morning",
    "สวัสดีตอนเย็น": "Good evening",
    "สัปดาห์": "weeks",
    "สิทธิ์ Admin หมดอายุ": "Admin session expired",
    "ส่งทดลอง": "Send trial",
    "ส่งทดลองใช้งาน": "Trial",
    "ส่งเมื่อ": "Sent",
    "หมายเหตุ": "Note",
    "หินที่รับเข้าวันนั้นยังไม่ได้นับในระบบ → เพิ่มจำนวนคงเหลือตอนบันทึก": "Stones received that day are not yet counted → add to on-hand when saving",
    "หินยังนับอยู่ในคลังตามระบบ → ตัดออกตอนบันทึกเหมือนปกติ": "Stones are still counted in stock → deduct when saving as usual",
    "หินรับคืน / ทดลองคืน": "Returned stones / trial returns",
    "หินเสียไม่นับเข้าสต็อก": "Defective stones are not counted in stock",
    "ห่างกันเฉลี่ย ": "Avg. interval ",
    "อยู่ที่ลูกค้า": "At customers",
    "ออกจากระบบ": "from the system",
    "ออกจากโหมด Admin": "Exit Admin mode",
    "ออกจากโหมด Admin แล้ว": "Exited Admin mode",
    "อันดับหินขายดี": "best sellers",
    "อาการเสีย หรือข้อมูลเพิ่มเติม": "Fault or additional details",
    "เกณฑ์": "Threshold",
    "เกณฑ์ใกล้หมด": "Low-stock threshold",
    "เกิดข้อผิดพลาด": "Something went wrong",
    "เกิน": "Over",
    "เข้าคลังเป็น": "into stock as",
    "เข้าสู่ระบบ": "Sign in",
    "เข้าสู่ระบบ Admin": "Admin sign-in",
    "เข้าสู่โหมด Admin แล้ว": "Admin mode on",
    "เคลม": "Claim",
    "เคลมรอของเข้า": "Claim awaiting stock",
    "เคลมรอปิดงาน": "Claim to close",
    "เคลมสินค้า": "Claim",
    "เคลมสินค้า (ปิดงานย้อนหลัง)": "Claim (closed, backdated)",
    "เฉพาะ": "Only",
    "เชื่อมต่อ Google Script ไม่ได้ตามที่คาด (ได้รับข้อมูลที่ไม่ใช่ JSON) — โปรดตรวจสอบว่า Deploy เวอร์ชันล่าสุดแล้ว และสิทธิ์การเข้าถึงตั้งเป็น \"Anyone\"": "Could not connect to Google Script as expected (received non-JSON data) — please check that the latest version is deployed and access is set to \"Anyone\"",
    "เชื่อมต่อไม่ได้": "Connection failed",
    "เช่น ส่งพร้อมใบกำกับ": "e.g. sent with invoice",
    "เช่น เซลล์ส่งของหน้างาน ลืมบันทึกในระบบ": "e.g. rep delivered on site and forgot to record it",
    "เซลล์": "Rep",
    "เซลล์ / ผู้ทำรายการ": "Rep / recorded by",
    "เดือนก่อน ": "Last month ",
    "เดือนนี้": "This month",
    "เบอร์ต้องเป็นตัวเลข": "Grit must be a number",
    "เพิ่ม": "Add",
    "เพิ่มรุ่นหินใหม่": "Add new stone model",
    "เพิ่มรุ่นแล้ว": "Model added",
    "เพิ่มอัตโนมัติตอนบันทึก": "added automatically when recording",
    "เพิ่มเข้าคลัง (แนะนำ)": "Add to stock (recommended)",
    "เพิ่มเข้าคลังตอนบันทึก": "Add to stock when saving",
    "เพื่อเปลี่ยนให้": "as a replacement for",
    "เมื่อวาน": "Yesterday",
    "เรียงจากค้างนานที่สุด": "Oldest first",
    "เรียบร้อย": "done",
    "เลือกรายการรับเข้า": "Choose a receipt",
    "เลือกวันที่...": "Pick a date...",
    "เลือกสินค้า": "Select items",
    "เวลา": "Time",
    "เหตุผล": "Reason",
    "เหตุผล เช่น บันทึกผิดรุ่น": "Reason, e.g. wrong model recorded",
    "เหตุผลที่บันทึกย้อนหลัง": "Reason for backdating",
    "เหลือ": "left",
    "เหลืออีก": "remaining",
    "แก้หมายเหตุ": "Edit note",
    "แก้หมายเหตุแล้ว": "Note updated",
    "แก้ไข": "Edit",
    "แก้ไขหมายเหตุ": "Edit note",
    "แจ้งเตือน": "Alerts",
    "แจ้งเตือนเมื่อหิน New เหลือน้อยกว่าหรือเท่ากับ (ก้อน)": "Alert when New stones are at or below (pcs)",
    "และปิดงานเคลม": "and close the claim",
    "แล้ว": "",
    "โหลดข้อมูลไม่สำเร็จ": "Failed to load data",
    "ใกล้หมด": "Low stock",
    "ใกล้หมดเมื่อ": "Low when",
    "ใช้เฉพาะเมื่อปรับยอดไปแล้วเท่านั้น": "Use only if the balance was already adjusted",
    "ใช้เมื่อปรับยอดในคลังไปแล้ว → เก็บเป็นประวัติ": "Use when stock was already adjusted → keep as history",
    "ใส่ตะกร้า": "Add to cart",
    "ใหม่": "new",
    "ให้": "to",
    "ได้รับหินเสียคืนจาก": "Received the defective stones back from",
    "ไม่ตัดสต็อก": "No stock deduction",
    "ไม่ตัดสต็อก · บันทึกประวัติอย่างเดียว": "No stock deduction · history only",
    "ไม่ทราบวันที่": "Unknown date",
    "ไม่บังคับ": "optional",
    "ไม่พบรายการนี้": "Entry not found",
    "ไม่มีค้าง": "None pending",
    "ไม่มีค้างนาน": "None overdue",
    "ไม่สามารถเชื่อมต่อได้": "Unable to connect",
    "ไม่เปลี่ยนจำนวนคงเหลือ": "not change the on-hand quantity",
    "ไม่เพิ่มสต็อก": "No stock added",
    "ไม่เพิ่มสต็อก · บันทึกประวัติอย่างเดียว": "No stock added · history only",
    "ไม่ได้ตัดสต็อก": "not deducted",
    "📅 ย้อนหลัง": "📅 Backdated"
};
function T(th, f) {
    if (LANG !== 'en' || !Object.prototype.hasOwnProperty.call(EN_DICT, th)) return th;
    let s = EN_DICT[th];
    if (f && s) { if (f.includes('l')) s = ' ' + s; if (f.includes('r')) s = s + ' '; }
    return s;
}
const EN_ONE = { entries: 'entry', days: 'day', cases: 'case', models: 'model', weeks: 'week' };
function TP(n, th) { const w = T(th); return LANG === 'en' && Number(String(n).replace(/,/g, '')) === 1 && EN_ONE[w] ? EN_ONE[w] : w; }
function tf(th, en) { return LANG === 'en' ? en : th; }
function setLang(l) {
    try { localStorage.setItem(LANG_KEY, l === 'en' ? 'en' : 'th'); } catch (e) { }
    location.reload();
}
function applyStaticLang() {
    document.documentElement.lang = LANG;
    const b = document.getElementById('lang-btn');
    if (b) { b.textContent = LANG === 'en' ? 'ไทย' : 'EN'; b.setAttribute('aria-label', LANG === 'en' ? 'เปลี่ยนเป็นภาษาไทย' : 'Switch to English'); }
    if (LANG !== 'en') return;
    document.querySelectorAll('[data-en]').forEach(el => { el.textContent = el.dataset.en; });
    document.querySelectorAll('[data-en-label]').forEach(el => el.setAttribute('aria-label', el.dataset.enLabel));
}

// ---- ข้อความจากผู้ใช้ (ชื่อลูกค้า / เซลล์ / หมายเหตุ) ----
const HAS_THAI = /[฀-๿]/;
let TR = {};                         // th → en (จากชีต Translations)
const trAsked = new Set(), trQueue = new Set();
let trTimer = null;
function U(v) {
    const s = String(v === undefined || v === null ? '' : v);
    if (LANG !== 'en' || !HAS_THAI.test(s)) return s;
    const k = s.trim();
    if (TR[k]) return TR[k];
    if (k.length <= 300 && !trAsked.has(k)) { trQueue.add(k); clearTimeout(trTimer); trTimer = setTimeout(flushTranslations, 350); }
    return s;
}
async function flushTranslations() {
    const texts = [...trQueue].slice(0, 25);
    texts.forEach(t => { trQueue.delete(t); trAsked.add(t); });
    if (!texts.length) return;
    try {
        const res = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'translateTexts', texts }) });
        const r = await res.json();
        if (r && r.status === 'success' && r.tr) {
            Object.assign(TR, r.tr);
            try { const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); if (c) { c.tr = Object.assign(c.tr || {}, r.tr); localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } } catch (e) { }
            if (Object.keys(r.tr).length) rerenderSoon();
        }
    } catch (e) { console.warn('translate', e); }
    if (trQueue.size) trTimer = setTimeout(flushTranslations, 350);
}
// วาดหน้าใหม่หลังได้คำแปล — ถ้ากำลังพิมพ์อยู่ (คีย์บอร์ดบนจอ/ทีวี) รอให้ออกจากช่องก่อน
function rerenderSoon() {
    const a = document.activeElement;
    if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) { a.addEventListener('blur', () => setTimeout(rerenderSoon, 50), { once: true }); return; }
    if (document.querySelector('.swal2-container')) { setTimeout(rerenderSoon, 800); return; }
    renderAll();
    if (typeof renderSupplierBody === 'function' && document.getElementById('sup-body')) renderSupplierBody();
}

// ---- ข้อความผิดพลาดจาก Google Script (ฝั่ง Server ส่งเป็นภาษาไทย) ----
const SERVER_MSG = [
    [/^สิทธิ์ Admin หมดอายุ.*/, () => 'Admin session expired — please sign in as Admin again'],
    [/^ระบบมีผู้ใช้งานพร้อมกันหลายคน.*/, () => 'Several people are saving at the same time — please wait a moment and try again'],
    [/^ไม่พบข้อมูลที่ส่งมา.*/, () => 'No data received — please try again'],
    [/^วันที่ย้อนหลังไม่ถูกต้อง$/, () => 'Invalid backdate'],
    [/^วันที่ย้อนหลังต้องไม่เกินเวลาปัจจุบัน$/, () => 'Backdated date cannot be in the future'],
    [/^บันทึกย้อนหลังได้ไม่เกิน (\d+) วัน$/, m => `Backdating is limited to ${m[1]} days`],
    [/^กรุณาระบุเหตุผลที่บันทึกย้อนหลัง$/, () => 'Please give a reason for backdating'],
    [/^การบันทึกแบบไม่ตัดสต็อกต้องเป็น Admin.*/, () => 'Recording without stock change requires Admin — please sign in as Admin again'],
    [/^ไม่พบรายการที่จะบันทึก$/, () => 'Nothing to save'],
    [/^รูปแบบรายการสินค้าไม่ถูกต้อง: (.*)$/, m => 'Invalid item format: ' + m[1]],
    [/^ไม่พบ (.+) ในคลัง \(อาจถูกลบไปแล้ว\).*/, m => `${m[1]} not found in stock (it may have been deleted) — please refresh and try again`],
    [/^ไม่พบ (.+) ในคลัง$/, m => `${m[1]} not found in stock`],
    [/^สต็อกไม่พอ: (.*) — กรุณารีเฟรชดูยอดล่าสุด$/, m => 'Not enough stock: ' + m[1].replace(/\(เหลือ (\d+) ต้องการ (\d+)\)/g, '($1 left, $2 needed)') + ' — please refresh to see the latest balance'],
    [/^สินค้าคงเหลือไม่พอ: (.*)$/, m => 'Not enough stock: ' + m[1].replace(/\(เหลือ (\d+)\)/g, '($1 left)').replace(/\(ไม่พบในคลัง\)/g, '(not in stock)')],
    [/^รายการนี้ไม่ได้อยู่ในสถานะทดลองแล้ว.*/, () => 'This entry is no longer on trial — please refresh'],
    [/^รายการนี้ไม่ได้อยู่ในสถานะรอปิดงานเคลม.*/, () => 'This entry is no longer waiting to close the claim — please refresh'],
    [/^รายการนี้ไม่ได้อยู่ในสถานะรอของเข้า.*/, () => 'This entry is no longer awaiting stock — please refresh'],
    [/^รายการนี้ถูกยกเลิกไปแล้ว$/, () => 'This entry was already cancelled'],
    [/^รายการนี้ปิดงานแล้ว.*/, () => 'This entry is already closed and cannot be cancelled — record an adjustment entry instead'],
    [/^กรุณาระบุชื่อ$/, () => 'Please enter a name'],
    [/^มีชื่อนี้อยู่แล้ว$/, () => 'This name already exists'],
    [/^กรุณาระบุรุ่นและเบอร์$/, () => 'Please enter model and grit'],
    [/^ชื่อรุ่นห้ามมีเครื่องหมาย.*/, () => 'Model names cannot contain # , ( ) and grit must be a number'],
    [/^มีรุ่น (.+) อยู่แล้ว$/, m => `Model ${m[1]} already exists`],
    [/^ยังมีสต็อกคงเหลือในรุ่นนี้.*/, () => 'This model still has stock — it can be deleted only when the balance is 0'],
    [/^เกณฑ์ใกล้หมดต้องเป็นตัวเลข.*/, () => 'The low-stock threshold must be a number 0 or higher'],
    [/^ไม่พบรุ่นนี้$/, () => 'Model not found'],
    [/^รหัสผ่านไม่ถูกต้อง$/, () => 'Incorrect password'],
    [/^ไม่พบรายการนี้.*/, () => 'Entry not found (it may have been changed by another user) — please refresh'],
    [/^เกิดข้อผิดพลาดที่เซิร์ฟเวอร์(?: \(doGet\))?: (.*)$/, m => 'Server error: ' + m[1]],
    [/^ข้อความยาวเกินไป$/, () => 'Text is too long'],
];
function TS(msg) {
    const s = String(msg || '');
    if (LANG !== 'en' || !HAS_THAI.test(s)) return s;
    for (const [re, fn] of SERVER_MSG) { const m = s.match(re); if (m) return fn(m); }
    return s;
}

// ============================================================
// ตัวช่วยทั่วไป
// ============================================================
function esc(v) {
    return String(v === undefined || v === null ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
const TH_MONTHS_TH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const TH_MONTHS = LANG === 'en' ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] : TH_MONTHS_TH;
const TH_MONTHS_FULL = LANG === 'en' ? ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] : ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const TH_DAYS = LANG === 'en' ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] : ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

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
// วันที่บนหน้าจอ: ไทย "19 ต.ค. 69" · อังกฤษ "19 Oct 2026"
function thaiShort(d) { return !d ? '-' : LANG === 'en' ? `${d.getDate()} ${TH_MONTHS[d.getMonth()]} ${d.getFullYear()}` : thaiShortTH(d); }
function thaiTime(d) { return !d ? '' : LANG === 'en' ? hhmm(d) : thaiTimeTH(d); }
function hhmm(d) { return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
// แบบไทยเสมอ — ใช้ในข้อความส่ง LINE กลุ่มทีม
function thaiShortTH(d) { return d ? `${d.getDate()} ${TH_MONTHS_TH[d.getMonth()]} ${String(d.getFullYear() + 543).slice(-2)}` : '-'; }
function thaiTimeTH(d) { return d ? hhmm(d) + ' น.' : ''; }
function yearLabel(d) { return LANG === 'en' ? d.getFullYear() : d.getFullYear() + 543; }
function dayLabel(d) {
    const n = daysSince(d);
    if (n === 0) return T('วันนี้');
    if (n === 1) return T('เมื่อวาน');
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
    if (k === 'cancel') return T('<span class="pill p-cancel">ยกเลิกแล้ว</span>');
    if (l.status === 'PENDING') return `<span class="pill p-trial">${T('ทดลอง')} · ${daysSince(logDate(l)) ?? '?'} ${TP(daysSince(logDate(l)) ?? '?', 'วัน')}</span>`;
    if (l.status === 'RETURNED') return T('<span class="pill p-done">ทดลอง · รับคืนแล้ว</span>');
    if (l.status === 'WAITING_CLAIM') return T('<span class="pill p-claim">เคลม · รอปิดงาน</span>');
    if (l.status === 'WAITING_STOCK') return T('<span class="pill p-alert">เคลม · รอของเข้า</span>');
    if (l.status === 'CLAIMED') return T('<span class="pill p-claim">เคลมแล้ว</span>');
    if (k === 'in') return `<span class="pill p-in">${String(l.typeLabel).includes('Used') ? T('รับคืน (Used)') : T('รับเข้า')}</span>`;
    if (k === 'sale') {
        const c = l.closedAt ? new Date(l.closedAt) : null, d = logDate(l);
        const fromTrial = c && d && c - d > 60000;
        return `<span class="pill p-sale">${T('ขาย', 'r')}${fromTrial ? T(' (จากทดลอง)') : ''}</span>`;
    }
    return `<span class="pill p-done">${esc(T(l.typeLabel))}</span>`;
}
function qtySign(l) {
    if (l.status === 'CANCELLED' || l.direction === 'NONE') return { s: '', cls: 'q-none' };
    return l.direction === 'IN' ? { s: '+', cls: 'q-in' } : { s: '−', cls: 'q-out' };
}
function daysClass(n) { return n > TRIAL_ALERT_DAYS ? 'd-over' : (n > TRIAL_WARN_DAYS ? 'd-warn' : 'd-ok'); }

async function copyText(text, msg) {
    try { await navigator.clipboard.writeText(text); }
    catch (e) {
        const el = document.createElement('textarea'); el.value = text; document.body.appendChild(el); el.select();
        document.execCommand('copy'); document.body.removeChild(el);
    }
    toast(msg || T('คัดลอกแล้ว นำไปวางในแชท LINE ได้เลย'));
}
function toast(text, icon) {
    Swal.fire({ toast: true, position: 'top', icon: icon || 'success', title: text, showConfirmButton: false, timer: 1800 });
}

// ============================================================
// เริ่มต้น / โหลดข้อมูล
// ============================================================
function init() {
    applyStaticLang();
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
    if (data.tr) TR = Object.assign({}, data.tr);
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
        if (data.status === 'error') throw new Error(TS(data.message));
        applyData(data);
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch (e) { }
        renderAll();
    } catch (e) {
        console.error(e);
        if (!allLogs.length && !inventory.length) {
            Swal.fire(T('โหลดข้อมูลไม่สำเร็จ'), T('ตรวจสอบอินเทอร์เน็ตแล้วกดปุ่มรีเฟรชอีกครั้ง'), 'error');
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
    document.getElementById('admin-btn').setAttribute('aria-label', on ? T('ออกจากโหมด Admin') : T('เข้าสู่ระบบ Admin'));
    document.getElementById('admin-chip').hidden = !on;
    document.getElementById('side-manage').hidden = !on;
    document.getElementById('hdr-manage').hidden = !on;
    if (!on) {
        adminToken = '';
        try { localStorage.removeItem(ADMIN_SESSION_KEY); } catch (e) { }
        if (currentPage === 'manage') showPage('exec');
    }
}
async function toggleAdmin() {
    if (isAdmin) { setAdminUI(false); renderAll(); toast(T('ออกจากโหมด Admin แล้ว'), 'info'); return; }
    const { value: pass } = await Swal.fire({
        title: T('เข้าสู่ระบบ Admin'), input: 'password', inputPlaceholder: T('รหัสผ่าน Admin'),
        confirmButtonColor: '#0e4a38', confirmButtonText: T('เข้าสู่ระบบ'), cancelButtonText: T('ยกเลิก'), showCancelButton: true
    });
    if (!pass) return;
    Swal.fire({ title: T('กำลังตรวจสอบ...'), allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
        const res = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'adminLogin', password: pass }) });
        const r = await res.json();
        if (r.status === 'success' && r.token) {
            adminToken = r.token;
            try { localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify({ token: r.token, expires: r.expires })); } catch (e) { }
            Swal.close();
            setAdminUI(true); renderAll();
            toast(T('เข้าสู่โหมด Admin แล้ว'));
        } else {
            Swal.fire({ icon: 'error', title: T('รหัสผ่านไม่ถูกต้อง') });
        }
    } catch (e) {
        Swal.fire({ icon: 'error', title: T('เชื่อมต่อไม่ได้'), text: T('ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่') });
    }
}

// ============================================================
// ส่งคำสั่งไป Server (ทุกคำสั่งผ่านฟังก์ชันนี้ที่เดียว)
// ============================================================
async function syncAction(action, payload, successText) {
    Swal.fire({ title: T('กำลังบันทึก...'), allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
        const body = Object.assign({ action }, payload || {});
        if (isAdmin && adminToken) body.token = adminToken;
        const response = await fetch(API_URL, { method: 'POST', body: JSON.stringify(body) });
        const rawText = await response.text();
        let result;
        try { result = JSON.parse(rawText); }
        catch (parseErr) { throw new Error(T('เชื่อมต่อ Google Script ไม่ได้ตามที่คาด (ได้รับข้อมูลที่ไม่ใช่ JSON) — โปรดตรวจสอบว่า Deploy เวอร์ชันล่าสุดแล้ว และสิทธิ์การเข้าถึงตั้งเป็น "Anyone"')); }
        if (result.status === 'success') {
            await fetchData();
            Swal.close();
            toast(successText || T('บันทึกสำเร็จ'));
            return true;
        }
        if (result.code === 'unauthorized') {
            setAdminUI(false); renderAll();
            Swal.fire(T('สิทธิ์ Admin หมดอายุ'), T('กรุณากดรูปกุญแจเพื่อเข้าสู่ระบบ Admin ใหม่ แล้วทำรายการอีกครั้ง'), 'warning');
            return false;
        }
        Swal.fire(T('ทำรายการไม่สำเร็จ'), TS(result.message) || T('เกิดข้อผิดพลาด'), 'error');
        return false;
    } catch (e) {
        console.error('Sync Error:', e);
        Swal.fire(T('แจ้งเตือน'), e.message || T('ไม่สามารถเชื่อมต่อได้'), 'error');
        return false;
    }
}

// ============================================================
// นำทาง
// ============================================================
function showPage(name) {
    if (name === 'manage' && !isAdmin) name = 'exec';
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
    if (!trials.length) return T('<div class="empty">ไม่มีลูกค้าที่ทดลองใช้งานอยู่ตอนนี้ 🎉</div>');
    return `<div class="trial-list">${trials.map(t => {
        const d = t.days ?? daysSince(logDate(t));
        const sent = logDate(t);
        return `<div class="trial ${d > TRIAL_ALERT_DAYS ? 'over' : ''}">
            <div class="days ${daysClass(d)}"><b>${d ?? '?'}</b><small>${TP(d ?? '?', 'วัน')}</small></div>
            <div class="who"><b>${esc(U(t.cust))}</b>${isBackdated(t) || isNoStock(t) ? `<div class="tags">${bdPillsHtml(t)}</div>` : ''}
                <div class="items">${esc(itemsText(t))}</div>
                <small>${T('เซลล์')} ${esc(U(t.sale) || '-')} · ${T('ส่งเมื่อ')} ${thaiShort(sent)}${t.remark ? ' · 📝 ' + esc(U(t.remark)) : ''}</small>
                ${withActions ? `<div class="acts"><button class="mini g" onclick="confirmTestToSale('${esc(t.id)}')">💰 ${T('ลูกค้าซื้อแล้ว')}</button><button class="mini s" onclick="returnTestItem('${esc(t.id)}')">🔄 ${T('รับคืน')}</button></div>` : ''}
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
    const greet = hour < 12 ? T('สวัสดีตอนเช้า') : hour < 17 ? T('สวัสดีตอนบ่าย') : T('สวัสดีตอนเย็น');

    const todo = [];
    claims.forEach(c => todo.push(`<div class="todo"><span class="dot" style="background:var(--purple)"></span><div><b>${c.status === 'WAITING_STOCK' ? T('เคลมรอของเข้า') : T('เคลมรอปิดงาน')} · ${esc(U(c.cust))}</b><small>${esc(itemsText(c))} · ${c.days ?? '?'} ${TP(c.days ?? '?', 'วัน')}</small></div>
        <button class="go" onclick="${c.status === 'WAITING_STOCK' ? `processStockClaim('${esc(c.id)}')` : `closeClaim('${esc(c.id)}')`}">${c.status === 'WAITING_STOCK' ? T('ตัดสต็อก ›') : T('ปิดงาน ›')}</button></div>`));
    if (low.length) todo.push(`<div class="todo"><span class="dot" style="background:var(--orange)"></span><div><b>${T('ใกล้หมด')} ${low.length} ${TP(low.length, 'รุ่น')}</b><small>${low.map(g => `${esc(g.key)} (${g.newQty})`).join(' · ')}</small></div><button class="go" onclick="stockFilter='low';showPage('stock')">${T('ดูคลัง')} ›</button></div>`);

    el.innerHTML = `
    <div class="ptitle"><div><small>${greet} · ${TH_DAYS[now.getDay()]} ${thaiShort(now)}</small><h1>${T('ภาพรวมวันนี้')}</h1></div></div>

    <div class="card trials" id="trial-section">
        <div class="trials-head">
            <div class="ic">🧪</div>
            <div><h2>${T('ลูกค้าทดลองใช้งาน')}</h2><small>${T('เรียงจากค้างนานที่สุด')} · ${TRIAL_WARN_DAYS} ${T('วันขึ้นไปเหลือง')} · ${T('เกิน')} ${TRIAL_ALERT_DAYS} ${T('วันแดง')}</small></div>
            <div class="trials-stats">
                <div class="tstat"><b>${trials.length}</b><small>${TP(trials.length, 'ราย')}</small></div>
                <div class="tstat"><b>${fmtN(trialQty)}</b><small>${T('ก้อน')}</small></div>
                <div class="tstat ${overdue.length ? 'alert' : ''}"><b>${overdue.length}</b><small>${T('เกิน')} ${TRIAL_ALERT_DAYS} ${TP(TRIAL_ALERT_DAYS, 'วัน')}</small></div>
            </div>
        </div>
        ${trialCardsHtml(trials, true)}
    </div>

    <div class="kpis">
        <div class="kpi" style="--c:var(--accent)"><small>${T('ขายเดือนนี้')}</small><b>${m ? fmtN(m.thisMonth) : '-'} <span class="u">${T('ก้อน')}</span></b><em class="${pct === null ? 'muted' : (pct >= 0 ? 'up' : 'down')}">${pct === null ? (m ? T('เดือนก่อน ') + fmtN(m.lastMonth) : '') : (pct >= 0 ? '▲ ' : '▼ ') + Math.abs(pct) + T('% จากเดือนก่อน')}</em></div>
        <div class="kpi" style="--c:var(--orange)"><small>${T('ทดลองอยู่ที่ลูกค้า')}</small><b>${trials.length} <span class="u">${TP(trials.length, 'ราย')}</span></b><em class="${overdue.length ? 'down' : 'muted'}">${overdue.length ? overdue.length + T(' รายเกิน ') + TRIAL_ALERT_DAYS + T(' วัน') : T('ไม่มีค้างนาน')}</em></div>
        <div class="kpi" style="--c:var(--purple)"><small>${T('รอเคลม')}</small><b>${claims.length} <span class="u">${TP(claims.length, 'ราย')}</span></b><em class="muted">${claims.filter(c => c.status === 'WAITING_STOCK').length} ${T('รายรอของเข้า')}</em></div>
        <div class="kpi" style="--c:var(--primary)"><small>${T('คงเหลือในคลัง')}</small><b>${fmtN(nTotal + uTotal)} <span class="u">${T('ก้อน')}</span></b><em class="muted">New ${fmtN(nTotal)} · Used ${fmtN(uTotal)}</em></div>
    </div>

    <div class="grid2">
        <div class="card"><h2>🔔 ${T('ต้องดำเนินการ')}</h2>${todo.join('') || T('<div class="empty">ไม่มีเรื่องค้าง</div>')}</div>
        <div class="card"><h2>📅 ${T('ความเคลื่อนไหววันนี้')} <button class="more" onclick="histState.period='today';showPage('hist')">${T('ดูทั้งหมด')} ›</button></h2>
            ${todayLogs.length ? todayLogs.slice(0, 8).map(l => {
        const q = qtySign(l), k = kindOf(l);
        return `<div class="list-row"><div class="avatar a-${k}">${KIND_ICON[k]}</div><div class="lr-main"><b>${esc(U(l.cust))}</b><small>${esc(itemsText(l))}</small></div><div class="lr-end"><b class="${q.cls}">${q.s}${fmtN(l.qty)}</b><small>${thaiTime(logDate(l))}</small></div></div>`;
    }).join('') : T('<div class="empty">วันนี้ยังไม่มีรายการ</div>')}
        </div>
    </div>

    <div class="card"><h2>📦 ${T('สต็อกคงเหลือ')} <button class="more" onclick="showPage('stock')">${T('ดูคลัง')} ›</button></h2>
        ${groups.map(g => `<div class="list-row"><div class="lr-main"><b>${esc(g.key)} ${g.low ? T('<span class="pill p-low">ใกล้หมด</span>') : ''}</b><small>New ${fmtN(g.newQty)} · Used ${fmtN(g.usedQty)}</small></div><div class="lr-end"><b>${fmtN(g.newQty + g.usedQty)}</b><small>${T('ก้อน')}</small></div></div>`).join('') || T('<div class="empty">ยังไม่มีสินค้า</div>')}
        <button class="btn-line" onclick="copyReport()">📋 ${T('คัดลอกรายงานสต็อก ส่ง')} LINE</button>
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
    <div class="ptitle sup-title"><div><h1>${T('คลังสินค้า')}</h1><small id="stock-sub"></small></div><button class="btn-ghost sup-btn" onclick="openSupplierMsg()">🌐 ${T('ข้อความถึง Supplier')}</button></div>
    <div class="stock-sum" id="stock-sum"></div>
    <div class="toolbar">
        <label class="search">🔍<input id="stock-q" type="search" placeholder="${T('ค้นหารุ่น / เบอร์')}" autocomplete="off" enterkeyhint="search"></label>
        <div class="chips" id="stock-chips"></div>
    </div>
    <div class="sgrid" id="stock-grid"></div>`;
        const q = document.getElementById('stock-q');
        q.value = stockQuery;
        q.addEventListener('input', e => { stockQuery = e.target.value; renderStock(); });
    }
    document.getElementById('stock-sub').textContent = `${groups.length} ${TP(groups.length, 'รุ่น')} · ${T('กดการ์ดเพื่อดูประวัติรุ่น')}`;
    document.getElementById('stock-sum').innerHTML = `
        <div><small>New</small><b style="color:var(--primary)">${fmtN(n)}</b></div>
        <div><small>Used</small><b style="color:#a35f12">${fmtN(u)}</b></div>
        <div><small>${T('รวม')}</small><b>${fmtN(n + u)}</b></div>
        <div class="pc-only"><small>${T('ใกล้หมด')}</small><b style="color:#a35f12">${lowN} ${TP(lowN, 'รุ่น')}</b></div>`;
    document.getElementById('stock-chips').innerHTML = `
            <button class="chip ${stockFilter !== 'low' ? 'on' : ''}" onclick="stockFilter='all';renderStock()">${T('ทั้งหมด')} <span class="n">${groups.length}</span></button>
            <button class="chip ${stockFilter === 'low' ? 'on' : ''}" onclick="stockFilter='low';renderStock()"><span class="sw" style="background:var(--orange)"></span>${T('ใกล้หมด')} <span class="n">${lowN}</span></button>`;
    document.getElementById('stock-grid').innerHTML = `${list.map(g => {
        const pct = Math.min(100, g.minStock > 0 ? g.newQty / (g.minStock * 2.5) * 100 : 100);
        const idx = groups.indexOf(g);
        return `<button class="scard ${g.low ? 'low' : ''}" onclick="openModelHistory(${idx})">
            <div class="scard-h"><span class="model">${esc(g.model)}</span><span class="grit">#${esc(g.grit)}</span>${g.low ? T('<span class="pill p-low">ใกล้หมด</span>') : ''}<div class="total"><small>${T('รวม')}</small><b>${fmtN(g.newQty + g.usedQty)}</b></div></div>
            <div class="nu">
                <div class="new"><span class="lab"><i></i>NEW</span><span class="v">${fmtN(g.newQty)}</span><div class="meter"><i style="width:${pct}%"></i></div>
                    <span class="hint">${g.weeksLeft !== null && g.weeksLeft !== undefined ? `${T('พอขายราว')} ${g.weeksLeft} ${TP(g.weeksLeft, 'สัปดาห์')}` : T('ยังไม่มียอดขาย 4 สัปดาห์')} · ${T('เกณฑ์')} ≤ ${g.minStock}</span></div>
                <div class="used"><span class="lab"><i></i>USED</span><span class="v">${fmtN(g.usedQty)}</span><span class="hint" style="margin-top:12px">${T('หินรับคืน / ทดลองคืน')}</span></div>
            </div>
            <span class="scard-tap">${T('ดูประวัติรุ่นนี้')} ›</span>
        </button>`;
    }).join('') || T('<div class="card empty">ไม่พบรุ่นที่ค้นหา</div>')}`;
}

async function openModelHistory(idx) {
    const g = groupStock()[idx]; if (!g) return;
    const slot = document.getElementById('modal-slot');
    slot.innerHTML = `<div class="modal-back" onclick="if(event.target===this)closeModal()"><div class="modal" role="dialog" aria-label="${T('ประวัติรุ่น')} ${esc(g.key)}">
        <div class="modal-h"><span class="model">${esc(g.model)}</span><span class="grit">#${esc(g.grit)}</span><button class="x" onclick="closeModal()" aria-label="${T('ปิด')}">✕</button></div>
        <div id="model-body"><div class="empty">${T('กำลังโหลดประวัติของรุ่นนี้...')}</div></div></div></div>`;
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
            <div class="kpi" style="--c:var(--primary)"><small>${T('คงเหลือ')}</small><b>${fmtN(g.newQty + g.usedQty)}</b><em class="muted">New ${g.newQty} · Used ${g.usedQty}</em></div>
            <div class="kpi" style="--c:var(--accent)"><small>${T('ขายเดือนนี้')}</small><b>${fmtN(soldMonth)}</b><em class="muted">${T('ปีนี้')} ${fmtN(soldYear)} ${T('ก้อน')}</em></div>
            <div class="kpi" style="--c:var(--orange)"><small>${T('อยู่ที่ลูกค้า')} (${T('ทดลอง')})</small><b>${fmtN(onTrial.reduce((a, l) => a + qtyOf(l), 0))}</b><em class="muted">${onTrial.length} ${TP(onTrial.length, 'ราย')}</em></div>
            <div class="kpi" style="--c:var(--purple)"><small>${T('รับเข้าล่าสุด')}</small><b style="font-size:18px">${lastIn ? thaiShort(lastIn) : '-'}</b><em class="muted">${g.weeklyRate ? T('ขายเฉลี่ย ') + g.weeklyRate + T(' ก้อน/สัปดาห์') : '&nbsp;'}</em></div>
        </div>
        ${topBuyers.length ? `<div class="card"><h2>🏢 ${T('ลูกค้าที่ซื้อรุ่นนี้')} (${T('ปีนี้')})</h2><table class="data-table"><tbody>${topBuyers.map(([c, q]) => `<tr><td>${esc(U(c))}</td><td class="num"><b>${fmtN(q)}</b> ${T('ก้อน')}</td></tr>`).join('')}</tbody></table></div>` : ''}
        <div class="card"><h2>🕒 ${T('ความเคลื่อนไหวล่าสุด')}</h2>
            ${logs.slice().reverse().slice(0, 20).map(l => {
        const q = qtySign(l), k = kindOf(l), d = logDate(l);
        return `<div class="list-row"><div class="avatar a-${k}">${KIND_ICON[k]}</div><div class="lr-main"><b>${esc(U(l.cust))}</b><small>${statusPill(l)} ${thaiShort(d)}</small></div><div class="lr-end"><b class="${q.cls}">${q.s}${fmtN(qtyOf(l))}</b><small>${esc(U(l.sale || ''))}</small></div></div>`;
    }).join('') || T('<div class="empty">ยังไม่มีประวัติ</div>')}
        </div>`;
}
function escClose(e) { if (e.key === 'Escape') closeModal(); }
function closeModal() { document.getElementById('modal-slot').innerHTML = ''; document.removeEventListener('keydown', escClose); }

// ============================================================
// ประวัติ — ตัวกรองตามประเภท / ช่วงเวลา / เซลล์ / คำค้น
// ============================================================
const histState = { kind: 'all', period: 'all', date: '', seller: 'all', q: '', limit: 40 };
const isBackdated = l => !!(l && l.recordedAt);
const isNoStock = l => !!(l && l.stockMode === 'NOSTOCK');
const KIND_FILTERS = [['all', T('ทั้งหมด'), ''], ['sale', T('ขาย'), 'var(--red)'], ['in', T('รับเข้า'), 'var(--accent)'], ['trial', T('ทดลอง'), 'var(--orange)'],
    ['claim', T('เคลม'), 'var(--purple)'], ['open', T('ค้างดำเนินการ'), 'var(--rose)'], ['cancel', T('ยกเลิก'), '#9aa39f'], ['bd', T('📅 ย้อนหลัง'), '']];

function histBaseFilter(l) {
    const st = histState, d = logDate(l), now = new Date();
    if (st.period === 'today' && !sameDay(d, now)) return false;
    if (st.period === '7' && !(d && daysSince(d) <= 6)) return false;
    if (st.period === 'month' && !(d && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear())) return false;
    if (st.period === 'date' && st.date) { const [y, m, dd] = st.date.split('-').map(Number); if (!sameDay(d, new Date(y, m - 1, dd))) return false; }
    if (st.seller !== 'all' && l.sale !== st.seller) return false;
    if (st.q) {
        const t = st.q.toLowerCase();
        if (![l.item, l.cust, l.sale, l.remark, l.id, TR[String(l.cust || '').trim()], TR[String(l.sale || '').trim()], TR[String(l.remark || '').trim()]].some(v => String(v || '').toLowerCase().includes(t))) return false;
    }
    return true;
}
function kindMatch(l, k) { return k === 'all' ? true : k === 'open' ? isOpen(l) : k === 'bd' ? isBackdated(l) : kindOf(l) === k; }
function bdPillsHtml(l) {
    return (isBackdated(l) ? T('<span class="pill p-bd">📅 ย้อนหลัง</span>') : '') + (isNoStock(l) ? `<span class="pill p-nost">${l.direction === 'IN' || String(l.typeLabel).startsWith('รับ') ? T('ไม่เพิ่มสต็อก') : T('ไม่ตัดสต็อก')}</span>` : '');
}
function bdNoteHtml(l) {
    if (!isBackdated(l)) return '';
    const rd = new Date(l.recordedAt);
    return `<div class="note bd-note">📅 ${T('บันทึกเมื่อ')} ${isNaN(rd) ? '-' : thaiShort(rd) + ' ' + thaiTime(rd)}${l.backdateReason ? T(' · เหตุผล: ') + esc(U(l.backdateReason)) : ''}</div>`;
}

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
    <div class="ptitle"><h1>${T('ประวัติ')}</h1><small id="hist-sub"></small></div>
    <div class="hist-layout">
        <div class="filters">
            <label class="search">🔍<input id="hist-q" type="search" placeholder="${T('ลูกค้า รุ่น เซลล์ หมายเหตุ')}" autocomplete="off" list="hist-cust-list" enterkeyhint="search"></label>
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
    document.getElementById('hist-sub').textContent = `${fmtN(allLogs.length)} ${T('รายการล่าสุด', 'r')}${totalLogs > allLogs.length ? ` ${T('จากทั้งหมด')} ${fmtN(totalLogs)}` : ''}`;
    const dl = customers.map(c => `<option value="${esc(c)}">`).join('');
    const dlEl = document.getElementById('hist-cust-list');
    if (dlEl.innerHTML !== dl) dlEl.innerHTML = dl;
    document.getElementById('hist-ctrl').innerHTML = `
            <div class="chips">${KIND_FILTERS.map(([k, t, c]) => `<button class="chip ${st.kind === k ? 'on' : ''}" onclick="histState.kind='${k}';histState.limit=40;renderHist()">${c ? `<span class="sw" style="background:${c}"></span>` : ''}${t} <span class="n">${base.filter(l => kindMatch(l, k)).length}</span></button>`).join('')}</div>
            <div class="frow">
                <select class="sel" id="hist-period" aria-label="${T('ช่วงเวลา')}">
                    ${[['all', T('ทุกช่วงเวลา')], ['today', T('วันนี้')], ['7', T('7 วันล่าสุด')], ['month', T('เดือนนี้')], ['date', T('เลือกวันที่...')]].map(([v, t]) => `<option value="${v}" ${st.period === v ? 'selected' : ''}>${t}</option>`).join('')}
                </select>
                ${st.period === 'date' ? `<input class="sel" type="date" id="hist-date" value="${esc(st.date)}">` : ''}
                <select class="sel" id="hist-seller" aria-label="${T('เซลล์')}"><option value="all">${T('ทุกเซลล์')}</option>${sellers.map(s => `<option value="${esc(s)}" ${st.seller === s ? 'selected' : ''}>${esc(U(s))}</option>`).join('')}</select>
            </div>`;
    document.getElementById('hist-results').innerHTML = `
            <div class="result"><span>${T('พบ')} ${fmtN(list.length)} ${TP(fmtN(list.length), 'รายการ')} · ${T('รวม')} ${fmtN(total)} ${T('ก้อน')}</span>${filtered ? T('<button onclick="clearHist()">ล้างตัวกรอง</button>') : ''}</div>
            ${groups.length ? groups.map(g => `<div class="day"><span>${g.d ? dayLabel(g.d) : T('ไม่ทราบวันที่')}</span><span>${g.rows.length} ${TP(g.rows.length, 'รายการ')}</span></div><div class="hlist">${g.rows.map(histRowHtml).join('')}</div>`).join('') : T('<div class="card empty">ไม่พบรายการที่ตรงกับตัวกรอง</div>')}
            ${list.length > st.limit ? `<button class="btn-more" onclick="histState.limit+=40;renderHist()">${T('ดูเพิ่ม')} (${T('เหลืออีก')} ${fmtN(list.length - st.limit)} ${TP(fmtN(list.length - st.limit), 'รายการ')})</button>` : ''}`;
    document.getElementById('hist-period').onchange = e => { st.period = e.target.value; st.limit = 40; renderHist(); };
    const dt = document.getElementById('hist-date'); if (dt) dt.onchange = e => { st.date = e.target.value; renderHist(); };
    document.getElementById('hist-seller').onchange = e => { st.seller = e.target.value; st.limit = 40; renderHist(); };
    renderCustomerCard(st.q.trim());
}
function clearHist() { Object.assign(histState, { kind: 'all', period: 'all', date: '', seller: 'all', q: '', limit: 40 }); renderHist(); }

function histRowHtml(l) {
    const q = qtySign(l), k = kindOf(l), d = logDate(l), id = esc(l.id);
    const acts = [];
    if (l.status === 'PENDING') acts.push(`<button class="mini g" onclick="confirmTestToSale('${id}')">💰 ${T('ลูกค้าซื้อแล้ว')}</button><button class="mini s" onclick="returnTestItem('${id}')">🔄 ${T('รับคืน')}</button>`);
    if (l.status === 'WAITING_CLAIM') acts.push(`<button class="mini p" onclick="closeClaim('${id}')">📦 ${T('ปิดงานเคลม')}</button>`);
    if (l.status === 'WAITING_STOCK') acts.push(`<button class="mini r" onclick="processStockClaim('${id}')">⚡ ${T('ของเข้าแล้ว ตัดสต็อก')}</button>`);
    if (isAdmin && l.status !== 'CANCELLED') {
        acts.push(`<button class="link" onclick="editRemark('${id}')">${T('แก้หมายเหตุ')}</button>`);
        if (!['RETURNED', 'CLAIMED'].includes(l.status)) acts.push(`<button class="link danger" onclick="cancelLog('${id}')">${T('ยกเลิกรายการ')}</button>`);
    }
    return `<div class="hrow ${k === 'cancel' ? 'cancelled' : ''}">
        <div class="avatar a-${k}">${KIND_ICON[k]}</div>
        <div><div class="head">${statusPill(l)}${bdPillsHtml(l)}<b>${esc(U(l.cust))}</b></div>
            <div class="items">${esc(itemsText(l))}</div>
            <div class="meta">${d ? thaiTime(d) : esc(l.date)} · ${T('เซลล์')} ${esc(U(l.sale) || '-')} · <span class="mono">${id}</span></div>
            ${bdNoteHtml(l)}
            ${l.remark ? `<div class="note">📝 ${esc(U(l.remark))}</div>` : ''}
            ${l.status === 'CANCELLED' ? `<div class="note cancel">${T('ยกเลิกแล้ว', 'r')}${l.cancelReason ? ' · ' + esc(U(l.cancelReason)) : ''}</div>` : ''}
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
        box.innerHTML = `<div class="card cust-card"><h2>👤 ${esc(U(name))}</h2><div class="empty">${T('กำลังโหลดประวัติทั้งหมดของลูกค้า...')}</div></div>`;
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
        <h2>👤 ${esc(U(name))} <span class="muted" style="font-size:12px;font-weight:600">${T('ประวัติทั้งหมด')} ${fmtN(custLookup.data.length)} ${TP(fmtN(custLookup.data.length), 'รายการ')}</span></h2>
        <div class="kpis">
            <div class="kpi" style="--c:var(--accent)"><small>${T('ซื้อแล้วทั้งหมด')}</small><b>${fmtN(total)}</b><em class="muted">${T('ก้อน', 'r')}${dates[0] ? T(' · ตั้งแต่ ') + thaiShort(dates[0]) : ''}</em></div>
            <div class="kpi" style="--c:var(--primary)"><small>${T('ซื้อล่าสุด')}</small><b style="font-size:18px">${last ? thaiShort(last) : '-'}</b><em class="muted">${gap !== null ? T('ห่างกันเฉลี่ย ') + gap + T(' วัน') : '&nbsp;'}</em></div>
            <div class="kpi" style="--c:var(--orange)"><small>${T('ทดลอง / เคลมค้าง')}</small><b>${openN}</b><em class="${openN ? 'down' : 'up'}">${openN ? T('มีรายการค้าง') : T('ไม่มีค้าง')}</em></div>
        </div>
        ${rows.length ? `<div class="table-scroll"><table class="data-table"><thead><tr><th>${T('รุ่น')}</th><th class="num">${T('ซื้อรวม')}</th><th class="num">${T('ครั้งล่าสุด')}</th></tr></thead><tbody>${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num">${fmtN(v.q)}</td><td class="num">${thaiShort(v.last)}</td></tr>`).join('')}</tbody></table></div>` : T('<div class="empty">ยังไม่มีประวัติการซื้อ</div>')}
    </div>`;
}

// ============================================================
// บันทึกรายการแบบตะกร้า (ผสมหลายรุ่น / New+Used ได้ในบิลเดียว)
// ============================================================
const REC_TYPES = LANG === 'en' ? { sale: 'Sale', trial: 'Trial', in: 'Receipt', claim: 'Claim' } : { sale: 'ขายสินค้า', trial: 'ส่งทดลอง', in: 'รับเข้า', claim: 'เคลม' };
const REC_SHORT = { sale: T('ขาย'), trial: T('ทดลอง'), in: T('รับเข้า'), claim: T('เคลม') };
const rec = { type: 'sale', cond: 'New', cart: {}, cust: '', sale: '', remark: '', cartOpen: false,
    // บันทึกย้อนหลัง (v2.4): on = เลือก "ย้อนหลัง", noStock = ไม่ตัด/เพิ่มสต็อก (Admin เท่านั้น)
    bd: { on: false, date: '', time: '', reason: '', noStock: false } };
function bdIsoDate(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function bdActive() { return rec.bd.on; }
function bdNoStock() { return rec.bd.on && rec.bd.noStock && isAdmin; }
/** ตรวจข้อมูลย้อนหลังฝั่งหน้าเว็บ (Server ตรวจซ้ำอีกชั้น) → ข้อความผิดพลาด หรือ '' */
function bdError() {
    if (!rec.bd.on) return '';
    if (!rec.bd.date) return T('กรุณาเลือกวันที่เกิดขึ้นจริง');
    const [y, m, d] = rec.bd.date.split('-').map(Number);
    const [hh, mm] = (rec.bd.time || '12:00').split(':').map(Number);
    const when = new Date(y, m - 1, d, hh || 0, mm || 0);
    if (isNaN(when)) return T('วันที่ไม่ถูกต้อง');
    if (when > new Date()) return T('วันที่ย้อนหลังต้องไม่เกินเวลาปัจจุบัน');
    if (daysSince(when) > BACKDATE_MAX_DAYS) return `${T('บันทึกย้อนหลังได้ไม่เกิน')} ${BACKDATE_MAX_DAYS} ${TP(BACKDATE_MAX_DAYS, 'วัน')}`;
    if (!rec.bd.reason.trim()) return T('กรุณาระบุเหตุผลที่บันทึกย้อนหลัง');
    if (rec.bd.noStock && !isAdmin) return T('การบันทึกแบบไม่ตัดสต็อกต้องเข้าสู่ระบบ Admin');
    return '';
}
function bdLabel() {
    if (!rec.bd.on || !rec.bd.date) return '';
    const [y, m, d] = rec.bd.date.split('-').map(Number);
    return `📅 ${T('ย้อนหลัง')} ${thaiShort(new Date(y, m - 1, d))}${rec.bd.time ? ' ' + rec.bd.time + T(' น.') : ''}${bdNoStock() ? (rec.type === 'in' ? T(' · ไม่เพิ่มสต็อก') : T(' · ไม่ตัดสต็อก')) : ''}`;
}
function setBd(patch, rerender) {
    Object.assign(rec.bd, patch);
    if (rec.bd.on && !rec.bd.date) { const d = new Date(); d.setDate(d.getDate() - 1); rec.bd.date = bdIsoDate(d); }
    if (rerender) { const y = window.scrollY; renderRec(); renderCartBar(); window.scrollTo(0, y); }
}
function bdBlockHtml() {
    const b = rec.bd, isIn = rec.type === 'in';
    const maxD = bdIsoDate(new Date()), minDd = new Date(); minDd.setDate(minDd.getDate() - BACKDATE_MAX_DAYS);
    const yesT = isIn ? T('เพิ่มเข้าคลัง (แนะนำ)') : T('ตัดสต็อก (แนะนำ)');
    const yesD = isIn ? T('หินที่รับเข้าวันนั้นยังไม่ได้นับในระบบ → เพิ่มจำนวนคงเหลือตอนบันทึก')
        : T('หินยังนับอยู่ในคลังตามระบบ → ตัดออกตอนบันทึกเหมือนปกติ') + (rec.type === 'sale' ? T(' ยอดขาย/กราฟนับเข้าวันที่จริง') : '');
    const noT = isIn ? T('ไม่เพิ่มสต็อก · บันทึกประวัติอย่างเดียว') : T('ไม่ตัดสต็อก · บันทึกประวัติอย่างเดียว');
    const noD = T('ใช้เมื่อปรับยอดในคลังไปแล้ว → เก็บเป็นประวัติ') + (rec.type === 'sale' ? T('/ยอดขาย') : '') + T(' แต่จำนวนคงเหลือไม่เปลี่ยน');
    const noStock = bdNoStock();
    return `<div class="card bd-card">
        <div class="bd-row"><b>${T('วันที่ทำรายการ')}</b>
            <div class="cond" role="group" aria-label="${T('วันที่ทำรายการ')}"><button class="${b.on ? '' : 'on'}" onclick="setBd({on:false},true)">${T('วันนี้')}</button><button class="${b.on ? 'on' : ''}" id="bd-on" onclick="setBd({on:true},true)">📅 ${T('ย้อนหลัง')}</button></div></div>
        ${b.on ? `<div class="bd-body">
            <div class="fields">
                <div class="field"><label for="bd-date">${T('วันที่เกิดขึ้นจริง')} *</label><input type="date" id="bd-date" value="${esc(b.date)}" max="${maxD}" min="${bdIsoDate(minDd)}" onchange="setBd({date:this.value},true)"></div>
                <div class="field"><label for="bd-time">${T('เวลา')} (${T('ไม่บังคับ')})</label><input type="time" id="bd-time" value="${esc(b.time)}" onchange="setBd({time:this.value},true)"></div>
            </div>
            <div class="field"><label for="bd-reason">${T('เหตุผลที่บันทึกย้อนหลัง')} *</label><input id="bd-reason" value="${esc(b.reason)}" maxlength="300" placeholder="${T('เช่น เซลล์ส่งของหน้างาน ลืมบันทึกในระบบ')}" oninput="rec.bd.reason=this.value" onchange="setBd({},true)"></div>
            <div class="field"><label>${isIn ? T('การเพิ่มสต็อก') : T('การตัดสต็อก')} *</label></div>
            <label class="bd-opt ${noStock ? '' : 'on'}"><input type="radio" name="bd-sm" ${noStock ? '' : 'checked'} onchange="setBd({noStock:false},true)"><span><b>${yesT}</b><small>${yesD}</small></span></label>
            <label class="bd-opt ${noStock ? 'on' : ''} ${isAdmin ? '' : 'dis'}"><input type="radio" name="bd-sm" id="bd-nostock" ${noStock ? 'checked' : ''} ${isAdmin ? '' : 'disabled'} onchange="setBd({noStock:true},true)"><span><b>${noT}</b> <span class="pill p-claim">Admin</span><small>${isAdmin ? noD : noD + T(' — ต้องเข้าสู่ระบบ Admin (รูปกุญแจ) ก่อน')}</small></span></label>
            ${noStock ? `<div class="notice">⚠️ ${T('รายการนี้จะ')}<b>${T('ไม่เปลี่ยนจำนวนคงเหลือ')}</b> ${T('ถ้าหินยังอยู่ในคลังจริง ยอดจะไม่ตรง')} — ${T('ใช้เฉพาะเมื่อปรับยอดไปแล้วเท่านั้น')}</div>` : ''}
        </div>` : ''}
    </div>`;
}

function startRec(type) {
    closeSheet();
    // เปลี่ยนประเภทระหว่างทาง: เก็บตะกร้าไว้ (เผื่อกดเลือกประเภทผิด) แล้วตรวจจำนวนใหม่ตอนยืนยัน
    rec.type = type;
    rec.cartOpen = false;
    if (type === 'claim') rec.cond = 'New';
    showPage('rec');
}
function recIsOut() { return rec.type === 'sale' || rec.type === 'trial'; }
/** จำกัดจำนวนตามสต็อกหรือไม่ — แบบไม่ตัดสต็อกไม่ต้องจำกัด (ยอดคลังปรับไปแล้ว) */
function recCapped() { return recIsOut() && !bdNoStock(); }
function cartEntries() { return Object.entries(rec.cart).filter(([, v]) => v > 0); }
function cartTotal() { return cartEntries().reduce((a, [, v]) => a + v, 0); }
function keyParts(k) { const [mg, cond] = k.split('|'); const [model, grit] = mg.split(' #'); return { model, grit, cond }; }

function setQty(key, qty) {
    const { model, grit, cond } = keyParts(key);
    let q = Math.max(0, Math.floor(Number(qty) || 0));
    if (recCapped()) q = Math.min(q, stockQty(model, grit, cond));
    if (q) rec.cart[key] = q; else delete rec.cart[key];
    const y = window.scrollY;
    renderRec(); renderCartBar();
    window.scrollTo(0, y);
}
function renderRec() {
    const el = document.getElementById('page-rec');
    const out = recCapped();
    const groups = groupStock();
    const items = cartEntries();
    const total = cartTotal();
    const shortClaim = rec.type === 'claim' && !bdNoStock() && items.some(([k, v]) => { const p = keyParts(k); return v > stockQty(p.model, p.grit, p.cond); });
    const plist = groups.map(g => {
        const key = `${g.model} #${g.grit}|${rec.cond}`;
        const have = stockQty(g.model, g.grit, rec.cond);
        const q = rec.cart[key] || 0;
        const disabled = out && have === 0;
        const ka = esc(key).replace(/'/g, '&#39;');
        return `<div class="prow ${disabled ? 'dis' : ''}"><div class="pm"><b>${esc(g.key)}</b> <span class="pill ${rec.cond === 'New' ? 'p-in' : 'p-trial'}">${rec.cond}</span>
            <small>${T('คงเหลือ')} ${fmtN(have)} ${T('ก้อน', 'r')}${rec.type === 'claim' && !bdNoStock() && q > have ? T(' · <span class="warn">ไม่พอ จะบันทึกเป็นรอของเข้า</span>') : ''}</small></div>
            ${disabled ? T('<span class="muted" style="font-size:12px">หมด</span>') : q ? `<div class="step"><button onclick="setQty('${ka}', ${q - 1})" aria-label="${T('ลด')}">−</button><input type="number" inputmode="numeric" min="0" value="${q}" aria-label="${T('จำนวน')} ${esc(g.key)}" onchange="setQty('${ka}', this.value)"><button onclick="setQty('${ka}', ${q + 1})" ${out && q >= have ? 'disabled' : ''} aria-label="${T('เพิ่ม')}">＋</button></div>`
                : `<button class="addbtn" onclick="setQty('${ka}', 1)">＋ ${T('ใส่ตะกร้า')}</button>`}</div>`;
    }).join('');
    const cartHtml = cls => `<div class="cartbox ${cls}" ${cls === '' ? 'id="cart-mobile"' : ''}>
        <h3><span>🛒 ${T('ตะกร้า')}</span><span class="muted" style="font-size:13px">${items.length} ${TP(items.length, 'รายการ')}</span></h3>
        ${items.length ? items.map(([k, v]) => { const p = keyParts(k); const ka = esc(k).replace(/'/g, '&#39;'); return `<div class="citem"><span>${esc(p.model)} #${esc(p.grit)} · ${esc(p.cond)}</span><span><b>× ${v}</b> <button class="link danger" onclick="setQty('${ka}', 0)">${T('ลบ')}</button></span></div>`; }).join('') : T('<div class="empty" style="padding:14px">ยังไม่มีสินค้า เลือกจากรายการ</div>')}
        ${items.length ? `<div class="ctotal"><span>${T('รวม')}</span><span>${fmtN(total)} ${T('ก้อน')}</span></div>` : ''}
        ${bdActive() ? `<div class="cart-bd">${esc(bdLabel())}${rec.bd.reason.trim() ? T('<br>เหตุผล: ') + esc(rec.bd.reason.trim()) : ''}</div>` : ''}
        ${shortClaim ? T('<div class="notice" style="margin-top:8px">มีรุ่นที่ของไม่พอ ระบบจะบันทึกเคลมนี้เป็น “รอของเข้า” ยังไม่ตัดสต็อก</div>') : ''}
        <div class="field" style="margin-top:12px"><label for="rec-remark${cls}">${T('หมายเหตุ')}</label><input id="rec-remark${cls}" value="${esc(rec.remark)}" placeholder="${rec.type === 'claim' ? T('อาการเสีย หรือข้อมูลเพิ่มเติม') : T('เช่น ส่งพร้อมใบกำกับ')}" oninput="rec.remark=this.value"></div>
        <button class="confirm" ${items.length ? '' : 'disabled'} onclick="submitRec()">✅ ${T('ยืนยัน', 'r')}${REC_TYPES[rec.type]}${bdActive() ? T(' (ย้อนหลัง)') : ''}${total ? ' ' + fmtN(total) + T(' ก้อน') : ''}</button>
    </div>`;
    el.innerHTML = `
    <div class="rec-head"><button class="back" onclick="showPage('dash')" aria-label="${T('กลับ')}">‹</button><div><small class="muted">${T('บันทึกรายการ')}</small><h1 style="margin:0;font-size:20px;color:var(--primary)">${REC_TYPES[rec.type]}</h1></div></div>
    <div class="typeseg">${Object.keys(REC_TYPES).map(t => `<button class="${t === rec.type ? 'on' : ''}" onclick="rec.type='${t}';if(rec.type==='claim')rec.cond='New';renderRec();renderCartBar()">${KIND_ICON[t]} ${REC_SHORT[t]}</button>`).join('')}</div>
    ${bdBlockHtml()}
    <div class="fields">
        <div class="field"><label for="rec-cust">${rec.type === 'in' ? T('รับจาก (Supplier / ลูกค้าที่คืน)') : T('ลูกค้า / โรงสี')}</label><input id="rec-cust" value="${esc(rec.cust)}" placeholder="${T('พิมพ์ชื่อ...')}" autocomplete="off" oninput="handleCustomerInput(this, event)"><datalist id="cust-list">${customers.map(c => `<option value="${esc(c)}">`).join('')}</datalist></div>
        <div class="field"><label for="rec-sale">${T('เซลล์ / ผู้ทำรายการ')}</label><select id="rec-sale" onchange="rec.sale=this.value">${sales.map(s => `<option value="${esc(s)}" ${rec.sale === s ? 'selected' : ''}>${esc(U(s))}</option>`).join('')}</select></div>
    </div>
    ${rec.type === 'trial' ? T('<div class="notice">ส่งทดลองหลายรุ่นในครั้งเดียวได้ · ตอนปิดงานจะปิดทั้งรายการ (ลูกค้าซื้อทั้งหมด หรือคืนทั้งหมด)</div>') : ''}
    ${rec.type === 'in' && rec.cond === 'Used' ? T('<div class="notice">รับคืนเป็น Used — ถ้าเป็นของทดลองที่ลูกค้าคืน ให้กด “รับคืน” ที่รายการทดลองแทน สต็อกจะไม่ซ้ำ</div>') : ''}
    <div class="rec-layout">
        <div style="display:flex;flex-direction:column;gap:10px;min-width:0">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><b style="font-size:15px">${T('เลือกสินค้า')}</b>
                ${rec.type === 'claim' ? T('<span class="muted" style="font-size:12px">เคลมเปลี่ยนเป็นหิน New</span>') : `<div class="cond">${['New', 'Used'].map(c => `<button class="${c === rec.cond ? 'on' : ''}" onclick="rec.cond='${c}';renderRec()">${c}</button>`).join('')}</div>`}</div>
            <div class="plist">${plist || T('<div class="empty">ยังไม่มีรุ่นหินในระบบ (Admin เพิ่มได้ที่ตั้งค่า)</div>')}</div>
            <small class="muted">${rec.type === 'claim' ? '' : T('สลับ New / Used แล้วเลือกต่อได้ ตะกร้าเก็บรายการไว้ทั้งหมด')}</small>
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
    slot.innerHTML = `<div class="cartbar mobile-only"><div class="cnt">🛒 ${n} ${TP(n, 'รายการ')}<b>${fmtN(cartTotal())} ${T('ก้อน')}</b></div>
        <button ${n ? '' : 'disabled'} onclick="rec.cartOpen=!rec.cartOpen;renderRec();renderCartBar();if(rec.cartOpen){const c=document.getElementById('cart-mobile');if(c)c.scrollIntoView({behavior:'smooth'})}">${rec.cartOpen ? T('ซ่อนตะกร้า') : T('ดูตะกร้า / ยืนยัน')}</button></div>`;
}
/** ช่องชื่อลูกค้า: คอมใช้รายการแนะนำ (datalist) ส่วนมือถือเติมชื่อให้อัตโนมัติขณะพิมพ์
 * เติมเฉพาะตอน "พิมพ์เพิ่ม" ที่ท้ายข้อความเท่านั้น — ตอนลบ (Backspace) / แก้กลางคำ / ระหว่างผสมคำ จะไม่เติม
 * (เดิมเติมทุกครั้งที่ปล่อยปุ่ม รวมถึงตอนลบ ทำให้ชื่อเด้งกลับมาลบไม่ออก) */
function handleCustomerInput(input, e) {
    rec.cust = input.value;
    if (window.innerWidth > 768) { input.setAttribute('list', 'cust-list'); return; }
    input.removeAttribute('list');
    const prevLen = Number(input.dataset.prevLen || 0);
    const val = input.value;
    input.dataset.prevLen = val.length;
    if (e && (e.isComposing || (e.inputType && !e.inputType.startsWith('insert')))) return;
    if (val.length <= prevLen) return;                       // ลบ/แทนที่ ไม่ใช่พิมพ์เพิ่ม
    if (input.selectionStart !== val.length) return;          // พิมพ์กลางคำ
    const typed = val.trim();
    if (typed.length < 2) return;
    const match = customers.find(c => String(c).toLowerCase().startsWith(typed.toLowerCase()));
    if (match && match.length > typed.length) {
        input.value = match; rec.cust = match;
        input.setSelectionRange(val.length, match.length);    // ส่วนที่เติมถูกเลือกไว้: พิมพ์ทับหรือกดลบได้เลย
    }
}
async function submitRec() {
    const cust = (rec.cust || '').trim();
    const items = cartEntries();
    if (!cust) { Swal.fire(T('กรุณาใส่ชื่อลูกค้า'), '', 'warning'); return; }
    if (!items.length) { Swal.fire(T('ตะกร้ายังว่าง'), T('กรุณาเลือกสินค้าอย่างน้อย 1 รายการ'), 'warning'); return; }
    if (!rec.sale && sales.length) rec.sale = sales[0];
    const bdErr = bdError();
    if (bdErr) { Swal.fire(T('ข้อมูลบันทึกย้อนหลังไม่ครบ'), bdErr, 'warning'); return; }
    // ตรวจของพออีกรอบ (ยอดอาจเปลี่ยนหลังเลือกใส่ตะกร้า) — แบบไม่ตัดสต็อกข้าม
    if (recCapped()) {
        const short = items.filter(([k, v]) => { const p = keyParts(k); return v > stockQty(p.model, p.grit, p.cond); });
        if (short.length) { Swal.fire(T('สต็อกไม่พอ'), short.map(([k]) => k.replace('|', ' ')).join(', '), 'error'); return; }
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
    const noStock = bdNoStock();
    if (noStock) direction = 'NONE';
    const backdate = bdActive() ? { date: rec.bd.date, time: rec.bd.time || '', reason: rec.bd.reason.trim(), noStock } : undefined;
    const bdHtml = backdate ? `<div class="cart-bd" style="margin-top:8px"><b>${esc(bdLabel())}</b><br>${T('เหตุผล')}: ${esc(backdate.reason)}<br>${noStock ? T('จำนวนคงเหลือ<b>ไม่เปลี่ยน</b>') : (rec.type === 'in' ? T('เพิ่มเข้าคลังตอนบันทึก') : T('ตัดสต็อกตอนบันทึก'))}</div>` : '';
    const ok = await Swal.fire({
        title: `${T('ยืนยัน', 'r')}${REC_TYPES[rec.type]}${backdate ? T(' (ย้อนหลัง)') : ''}?`, icon: 'question',
        html: `<div style="text-align:left;font-size:14px"><b>${esc(U(cust))}</b> · ${T('เซลล์')} ${esc(U(rec.sale) || '-')}<br>${items.map(([k, v]) => { const p = keyParts(k); return `• ${esc(p.model)} #${esc(p.grit)} ${esc(p.cond)} × ${v}`; }).join('<br>')}<br><b>${T('รวม')} ${fmtN(total)} ${T('ก้อน')}</b>${direction === 'NONE' && !noStock ? T('<br><small>ของไม่พอ — บันทึกเป็นรอของเข้า</small>') : ''}${bdHtml}</div>`,
        showCancelButton: true, confirmButtonColor: '#12a37a', confirmButtonText: T('บันทึก'), cancelButtonText: T('แก้ไข')
    });
    if (!ok.isConfirmed) return;
    const done = await syncAction('addMultiLogs', { data: [{ sale: rec.sale, cust, typeLabel, direction, item: itemStr, qty: total, remark: (rec.remark || '').trim(), backdate }] }, (LANG === 'en' ? `${REC_TYPES[rec.type]}${backdate ? ' (backdated)' : ''} saved` : `บันทึก${REC_TYPES[rec.type]}${backdate ? 'ย้อนหลัง' : ''}เรียบร้อย`));
    if (done) {
        rec.cart = {}; rec.cust = ''; rec.remark = ''; rec.cartOpen = false;
        rec.bd = { on: false, date: '', time: '', reason: '', noStock: false };
        showPage(rec.type === 'trial' ? 'dash' : 'hist');
    }
}

// ============================================================
// การทำรายการจากรายการเดิม
// ============================================================
async function confirmTestToSale(id) {
    const l = findLogById(id); if (!l) return Swal.fire(T('ไม่พบรายการนี้'), T('กรุณารีเฟรชแล้วลองใหม่'), 'error');
    const r = await Swal.fire({ title: T('ลูกค้าตกลงซื้อแล้ว?'), html: `${T('ปิดการขาย')} <b>${esc(itemsText(l, ', '))}</b><br>${T('ให้')} ${esc(U(l.cust))} (${T('ยอดขายนับวันนี้')})`, icon: 'question',
        showCancelButton: true, confirmButtonColor: '#0e4a38', confirmButtonText: T('ยืนยันขาย'), cancelButtonText: T('ยกเลิก') });
    if (r.isConfirmed) await syncAction('confirmTestToSale', { id }, T('ปิดการขายเรียบร้อย'));
}
async function returnTestItem(id) {
    const l = findLogById(id); if (!l) return Swal.fire(T('ไม่พบรายการนี้'), T('กรุณารีเฟรชแล้วลองใหม่'), 'error');
    if (l.stockMode === 'NOSTOCK') {
        // ทดลองที่บันทึกแบบไม่ตัดสต็อก → ถามว่ารับเข้าคลังหรือไม่ (ค่าเริ่มต้น: รับเข้าเป็น Used)
        const q = await Swal.fire({ title: T('รับคืนของทดลอง'), icon: 'question',
            html: `<div style="text-align:left;font-size:14px">${T('ตอนส่งทดลองรายการนี้')}<b>${T('ไม่ได้ตัดสต็อก')}</b> (${T('บันทึกย้อนหลัง')})<br><b>${esc(U(l.cust))}</b> · ${esc(itemsText(l, ', '))}</div>`,
            input: 'radio', inputValue: 'add',
            inputOptions: { add: T('รับเข้าคลังเป็น Used (แนะนำ)'), skip: T('ปิดรายการอย่างเดียว ไม่เพิ่มสต็อก') },
            showCancelButton: true, confirmButtonColor: '#64748b', confirmButtonText: T('ยืนยันรับคืน'), cancelButtonText: T('ยกเลิก') });
        if (q.isConfirmed) await syncAction('returnTestItem', { id, addStock: q.value !== 'skip' }, q.value === 'skip' ? T('ปิดรายการเรียบร้อย (ไม่เพิ่มสต็อก)') : T('รับคืนเข้าคลังเรียบร้อย'));
        return;
    }
    const r = await Swal.fire({ title: T('รับของทดลองคืน?'), html: `${T('รับคืน')} <b>${esc(itemsText(l, ', '))}</b><br>${T('จาก')} ${esc(U(l.cust))} ${T('เข้าคลังเป็น')} <b>Used</b>`, icon: 'question',
        showCancelButton: true, confirmButtonColor: '#64748b', confirmButtonText: T('ยืนยันรับคืน'), cancelButtonText: T('ยกเลิก') });
    if (r.isConfirmed) await syncAction('returnTestItem', { id }, T('รับคืนเข้าคลังเรียบร้อย'));
}
async function closeClaim(id) {
    const l = findLogById(id); if (!l) return Swal.fire(T('ไม่พบรายการนี้'), T('กรุณารีเฟรชแล้วลองใหม่'), 'error');
    const r = await Swal.fire({ title: T('ปิดงานเคลม?'), html: `${T('ได้รับหินเสียคืนจาก')} ${esc(U(l.cust))} ${T('แล้ว')}<br><small>${T('หินเสียไม่นับเข้าสต็อก')}</small>`, icon: 'info',
        showCancelButton: true, confirmButtonColor: '#7c5cd4', confirmButtonText: T('ยืนยันปิดงาน'), cancelButtonText: T('ยกเลิก') });
    if (r.isConfirmed) await syncAction('closeClaim', { id }, T('ปิดงานเคลมเรียบร้อย'));
}
async function processStockClaim(id) {
    const l = findLogById(id); if (!l) return Swal.fire(T('ไม่พบรายการนี้'), T('กรุณารีเฟรชแล้วลองใหม่'), 'error');
    const r = await Swal.fire({ title: T('ของเข้าคลังแล้ว?'), html: `${T('ตัดสต็อก')} <b>${esc(itemsText(l, ', '))}</b><br>${T('เพื่อเปลี่ยนให้')} ${esc(U(l.cust))} ${T('และปิดงานเคลม')}`, icon: 'warning',
        showCancelButton: true, confirmButtonColor: '#f43f5e', confirmButtonText: T('ยืนยันตัดสต็อก'), cancelButtonText: T('ยกเลิก') });
    if (r.isConfirmed) await syncAction('processStockClaim', { id }, T('ตัดสต็อกและปิดงานเคลมเรียบร้อย'));
}
async function cancelLog(id) {
    const l = findLogById(id); if (!l) return;
    const effect = isNoStock(l) ? T('รายการนี้บันทึกแบบไม่ตัดสต็อก จะไม่มีการปรับยอด') : l.direction === 'OUT' ? T('ระบบจะคืนสต็อกตามรายการนี้') : (l.direction === 'IN' ? T('ระบบจะหักสต็อกที่รับเข้าออก') : T('รายการนี้ยังไม่ได้ตัดสต็อก จะไม่มีการปรับยอด'));
    const { value: reason, isConfirmed } = await Swal.fire({
        title: T('ยกเลิกรายการนี้?'), html: `<b>${esc(T(l.typeLabel))}</b> · ${esc(U(l.cust))}<br>${esc(itemsText(l, ', '))}<br><small>${effect} · ${T('รายการยังอยู่ในประวัติพร้อมเหตุผล')}</small>`,
        input: 'text', inputPlaceholder: T('เหตุผล เช่น บันทึกผิดรุ่น'), icon: 'warning', showCancelButton: true,
        confirmButtonColor: '#d94f4f', confirmButtonText: T('ยืนยันยกเลิก'), cancelButtonText: T('ปิด'),
        inputValidator: v => (!v || !v.trim()) ? T('กรุณาระบุเหตุผล') : undefined
    });
    if (isConfirmed) await syncAction('cancelLog', { id, reason }, T('ยกเลิกรายการเรียบร้อย'));
}
async function editRemark(id) {
    if (!isAdmin) return;
    const l = findLogById(id);
    const { value, isConfirmed } = await Swal.fire({ title: T('แก้ไขหมายเหตุ'), input: 'text', inputValue: l ? l.remark || '' : '',
        showCancelButton: true, confirmButtonColor: '#0e4a38', confirmButtonText: T('บันทึก'), cancelButtonText: T('ยกเลิก') });
    if (isConfirmed) await syncAction('editRemark', { id, remark: value || '' }, T('แก้หมายเหตุแล้ว'));
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
    const lines = ['📦 สต็อกหินขัด RDS', `ณ ${thaiShortTH(now)} เวลา ${thaiTimeTH(now)}`, LINE_RULE,
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
    const lines = ['🧪 ลูกค้าทดลองใช้งาน RDS', `ณ ${thaiShortTH(new Date())} · ${trials.length} ราย`, LINE_RULE,
        ...trials.map(t => `${t.days > TRIAL_ALERT_DAYS ? '🔴' : t.days > TRIAL_WARN_DAYS ? '🟡' : '🟢'} ${t.cust} · ${t.days} วัน\n   ${itemsText(t, ', ')} (${t.sale || '-'})`)];
    copyText(lines.join('\n'));
}
function copyWeekly() {
    if (!summary || !summary.week) return Swal.fire(T('ยังไม่มีข้อมูลสรุป'), T('กรุณารีเฟรชข้อมูลก่อน'), 'info');
    const s = summary, w = s.week;
    const pct = w.salePrev > 0 ? Math.round((w.sale - w.salePrev) / w.salePrev * 100) : null;
    const trend = pct === null ? '' : (pct >= 0 ? ` (▲ ${pct}% จากสัปดาห์ก่อน)` : ` (▼ ${Math.abs(pct)}% จากสัปดาห์ก่อน)`);
    const overdue = s.open.filter(o => o.status === 'PENDING' && o.days > TRIAL_ALERT_DAYS);
    const low = s.stock.filter(g => g.low);
    const lines = ['📊 สรุปสัปดาห์ RDS', `${thaiShortTH(new Date(w.from))} – ${thaiShortTH(new Date(w.to))}`, LINE_RULE,
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
// Dashboard (เดิมชื่อ รายงานผู้บริหาร) — หน้าแรกของแอป
// ============================================================
let _chartTrend = null, _chartModels = null;
const CHART_COLORS = ['#12a37a', '#e08a3c', '#7c5cd4', '#d94f4f', '#0e4a38', '#4fd8a6'];
function renderExec() {
    const el = document.getElementById('page-exec');
    if (!summary) { el.innerHTML = T('<div class="ptitle"><h1>Dashboard</h1></div><div class="card empty">กำลังโหลดข้อมูลสรุป... ถ้าไม่ขึ้น ให้ตรวจว่า Deploy Google Script เวอร์ชันล่าสุดแล้ว</div>'); return; }
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
    <div class="ptitle"><div><small>${T('ข้อมูล ณ')} ${thaiShort(new Date(s.generatedAt))} ${thaiTime(new Date(s.generatedAt))} · ${T('คำนวณจากทุกรายการ')}</small><h1>Dashboard · ${TH_MONTHS_FULL[now.getMonth()]} ${yearLabel(now)}</h1></div></div>
    <div class="kpis">
        <div class="kpi" style="--c:var(--accent)"><small>${T('ขายเดือนนี้')}</small><b>${fmtN(m.thisMonth)} <span class="u">${T('ก้อน')}</span></b><em class="${pct === null ? 'muted' : (pct >= 0 ? 'up' : 'down')}">${pct === null ? T('เดือนก่อน ') + fmtN(m.lastMonth) : (pct >= 0 ? '▲ ' : '▼ ') + Math.abs(pct) + T('% จากเดือนก่อน (') + fmtN(m.lastMonth) + ')'}</em></div>
        <div class="kpi" style="--c:var(--primary)"><small>${T('ขายปีนี้')}</small><b>${fmtN(m.thisYear)} <span class="u">${T('ก้อน')}</span></b><em class="muted">${T('ม.ค.')}–${TH_MONTHS[now.getMonth()]}</em></div>
        <div class="kpi" style="--c:var(--orange)"><small>${T('ทดลองอยู่ที่ลูกค้า')}</small><b>${trials.length} <span class="u">${TP(trials.length, 'ราย')}</span></b><em class="${overdue.length ? 'down' : 'muted'}">${fmtN(trials.reduce((a, o) => a + Number(o.qty || 0), 0))} ${T('ก้อน', 'r')}${overdue.length ? ` · ${overdue.length} ${T('รายเกิน')} ${TRIAL_ALERT_DAYS} ${TP(TRIAL_ALERT_DAYS, 'วัน')}` : ''}</em></div>
        <div class="kpi" style="--c:var(--purple)"><small>${T('คงเหลือในคลัง')}</small><b>${fmtN(s.stockTotal.n + s.stockTotal.u)} <span class="u">${T('ก้อน')}</span></b><em class="muted">New ${fmtN(s.stockTotal.n)} · Used ${fmtN(s.stockTotal.u)}</em></div>
    </div>
    <div class="card trials"><div class="trials-head"><div class="ic">🧪</div><div><h2>${T('ลูกค้าทดลองใช้งาน')}</h2><small>${trials.length} ${TP(trials.length, 'ราย')} · ${T('เรียงจากค้างนานที่สุด')}</small></div>
        <button class="btn-ghost" style="margin-left:auto" onclick="copyTrials()">📋 ${T('คัดลอกรายชื่อ ส่ง')} LINE</button></div>${trialCardsHtml(trials, false)}</div>
    <div class="grid2">
        <div class="card"><h2>📦 ${T('สต็อกรายรุ่น')}</h2>
            ${stock.map(g => `<div class="bar-row"><span>${esc(g.key)}</span><span class="bar"><i class="bar-new" style="width:${g.newQty / maxStock * 100}%"></i><i class="bar-used" style="width:${g.usedQty / maxStock * 100}%"></i></span><span class="num"><b>${fmtN(g.newQty + g.usedQty)}</b>${g.low ? T(' <span class="pill p-low">ใกล้หมด</span>') : ''}</span></div>`).join('') || T('<div class="empty">ยังไม่มีสินค้า</div>')}
            <div class="legend"><span><i class="bar-new"></i>New</span><span><i class="bar-used"></i>Used</span></div>
            ${low.length ? `<div class="notice" style="margin-top:10px">${T('ใกล้หมด')}: ${low.map(g => LANG === 'en' ? `${esc(g.key)}: ${g.newQty} left${g.weeksLeft ? ` (about ${g.weeksLeft} weeks)` : ''}` : `${esc(g.key)} เหลือ ${g.newQty}${g.weeksLeft ? ` (พอขายราว ${g.weeksLeft} สัปดาห์)` : ''}`).join(' · ')}</div>` : ''}
        </div>
        <div class="card"><h2>👤 ${T('ยอดขายรายเซลล์')} (${T('เดือนนี้')})</h2>
            ${s.bySaleMonth.length ? `<table class="data-table"><tbody>${s.bySaleMonth.map(([k, v]) => `<tr><td>${esc(U(k))}</td><td class="num"><b>${fmtN(v)}</b></td><td class="num muted">${Math.round(v / totalSaleMonth * 100)}%</td></tr>`).join('')}</tbody></table>` : T('<div class="empty">เดือนนี้ยังไม่มียอดขาย</div>')}
            <h2 style="margin-top:16px">🏢 ${T('ลูกค้าซื้อสูงสุด')} (${T('ปีนี้')})</h2>
            ${s.topCustomersYear.length ? `<table class="data-table"><tbody>${s.topCustomersYear.map(([k, v]) => `<tr><td>${esc(U(k))}</td><td class="num"><b>${fmtN(v)}</b></td></tr>`).join('')}</tbody></table>` : T('<div class="empty">ปีนี้ยังไม่มียอดขาย</div>')}
        </div>
    </div>
    <div class="grid2 even">
        <div class="card"><h2>📈 ${tf('ยอดขาย 14 วันล่าสุด', 'Sales · last 14 days')}</h2><div class="chart-box"><canvas id="chart-trend"></canvas></div></div>
        <div class="card"><h2>🏆 ${tf('5 อันดับหินขายดี', 'Top 5 best sellers')} (${T('ปีนี้')})</h2><div class="chart-box"><canvas id="chart-models"></canvas></div></div>
    </div>
    <button class="btn-line" onclick="copyWeekly()">📋 ${T('คัดลอกสรุปสัปดาห์ที่แล้ว ส่ง')} LINE</button>`;
    drawExecCharts();
}
function drawExecCharts() {
    if (typeof Chart === 'undefined' || !summary) return;
    const t = document.getElementById('chart-trend');
    if (t) {
        if (_chartTrend) _chartTrend.destroy();
        _chartTrend = new Chart(t, { type: 'bar', data: { labels: summary.daily14.map(d => d.label), datasets: [{ label: T('ยอดขาย (ก้อน)'), data: summary.daily14.map(d => d.qty), backgroundColor: '#12a37a', borderRadius: 5, maxBarThickness: 26 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false } } } } });
    }
    const mEl = document.getElementById('chart-models');
    if (mEl) {
        if (_chartModels) _chartModels.destroy();
        _chartModels = new Chart(mEl, { type: 'bar', data: { labels: summary.topModelsYear.map(x => x[0]), datasets: [{ label: T('ขายได้ (ก้อน)'), data: summary.topModelsYear.map(x => x[1]), backgroundColor: CHART_COLORS, borderRadius: 5 }] },
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
    <div class="ptitle"><h1>${T('ตั้งค่าระบบ')}</h1><small>${tf('เฉพาะ Admin', 'Admin only')}</small></div>
    <div class="mgrid">
        <div class="card"><h2>📦 ${T('รุ่นหิน')} <button class="more" onclick="addModel()">＋ ${T('เพิ่ม')}</button></h2>
            ${groups.map((g, i) => `<div class="mrow"><span><b>${esc(g.key)}</b><small>${T('ใกล้หมดเมื่อ')} New ≤ ${g.minStock} · ${T('คงเหลือ')} ${g.newQty + g.usedQty}</small></span><span style="flex:none"><button class="link" onclick="editMinStock(${i})">${T('ตั้งเกณฑ์')}</button><button class="link danger" onclick="deleteModel(${i})">${T('ลบ')}</button></span></div>`).join('') || T('<div class="empty">ยังไม่มีรุ่น</div>')}</div>
        <div class="card"><h2>👤 ${T('ทีมงาน / เซลล์')} <button class="more" onclick="addData('SALE')">＋ ${T('เพิ่ม')}</button></h2>
            ${sales.map((s, i) => `<div class="mrow"><span>${esc(s)}${enNameHint(s)}</span><span style="flex:none"><button class="link" onclick="editEnName('SALE', ${i})">EN</button><button class="link danger" onclick="deleteData('SALE', ${i})">${T('ลบ')}</button></span></div>`).join('') || T('<div class="empty">ยังไม่มีรายชื่อ</div>')}</div>
        <div class="card"><h2>🏢 ${T('ลูกค้า')} <span class="muted" style="font-size:12px;font-weight:600">${T('เพิ่มอัตโนมัติตอนบันทึก')}</span></h2>
            ${customers.map((c, i) => `<div class="mrow"><span>${esc(c)}${enNameHint(c)}</span><span style="flex:none"><button class="link" onclick="editEnName('CUST', ${i})">EN</button><button class="link danger" onclick="deleteData('CUST', ${i})">${T('ลบ')}</button></span></div>`).join('') || T('<div class="empty">ยังไม่มีรายชื่อ</div>')}</div>
    </div>`;
}
function enNameHint(name) {
    const k = String(name || '').trim();
    if (!HAS_THAI.test(k)) return '';
    return TR[k] ? `<small>EN: ${esc(TR[k])}</small>` : `<small class="muted">${T('ยังไม่มีชื่อภาษาอังกฤษ')}</small>`;
}
async function addModel() {
    const { value: fV } = await Swal.fire({ title: T('เพิ่มรุ่นหินใหม่'), showCancelButton: true, confirmButtonText: T('เพิ่ม'), cancelButtonText: T('ยกเลิก'), confirmButtonColor: '#0e4a38',
        html: T('<input id="sw-m" class="swal2-input" placeholder="รุ่น (เช่น R2)"><input id="sw-g" class="swal2-input" placeholder="เบอร์ (ตัวเลข เช่น 600)" inputmode="numeric">'),
        preConfirm: () => {
            const m = document.getElementById('sw-m').value.trim(), g = document.getElementById('sw-g').value.trim();
            if (!m || !g) return Swal.showValidationMessage(T('กรุณากรอกรุ่นและเบอร์'));
            if (/[#,()|]/.test(m)) return Swal.showValidationMessage(T('ชื่อรุ่นห้ามมีเครื่องหมาย # , ( ) |'));
            if (!/^\d+$/.test(g)) return Swal.showValidationMessage(T('เบอร์ต้องเป็นตัวเลข'));
            return [m, g];
        } });
    if (fV) await syncAction('addModel', { model: fV[0], grit: fV[1] }, T('เพิ่มรุ่นแล้ว'));
}
async function deleteModel(i) {
    const g = groupStock()[i]; if (!g) return;
    if (g.newQty + g.usedQty !== 0) return Swal.fire(T('ยังลบไม่ได้'), `${g.key} ${T('ยังมีสต็อกคงเหลือ')} ${g.newQty + g.usedQty} ${T('ก้อน ลบได้เมื่อยอดเป็น')} 0`, 'info');
    const r = await Swal.fire({ title: T('ลบรุ่นนี้?'), text: `${T('ลบ')} "${g.key}" ${T('ออกจากระบบ')}`, icon: 'warning', showCancelButton: true, confirmButtonColor: '#d94f4f', confirmButtonText: T('ลบ'), cancelButtonText: T('ยกเลิก'), reverseButtons: true });
    if (r.isConfirmed) await syncAction('deleteModel', { model: g.model, grit: g.grit }, T('ลบรุ่นแล้ว'));
}
async function editMinStock(i) {
    const g = groupStock()[i]; if (!g) return;
    const { value, isConfirmed } = await Swal.fire({ title: `${T('เกณฑ์ใกล้หมด')} · ${g.key}`, input: 'number', inputValue: g.minStock,
        inputLabel: T('แจ้งเตือนเมื่อหิน New เหลือน้อยกว่าหรือเท่ากับ (ก้อน)'), inputAttributes: { min: 0, step: 1 },
        showCancelButton: true, confirmButtonColor: '#0e4a38', confirmButtonText: T('บันทึก'), cancelButtonText: T('ยกเลิก'),
        inputValidator: v => (v === '' || Number(v) < 0) ? T('กรุณาใส่ตัวเลข 0 ขึ้นไป') : undefined });
    if (isConfirmed) await syncAction('setMinStock', { model: g.model, grit: g.grit, minStock: Number(value) }, T('บันทึกเกณฑ์แล้ว'));
}
async function addData(type) {
    const typeText = type === 'SALE' ? tf('ทีมงาน', 'team member') : tf('ลูกค้า', 'customer');
    const { value: name } = await Swal.fire({ title: tf(`เพิ่ม${typeText}ใหม่`, `Add new ${typeText}`), input: 'text', inputPlaceholder: tf(`ชื่อ${typeText}`, 'Name'), showCancelButton: true, confirmButtonColor: '#12a37a', confirmButtonText: T('เพิ่ม'), cancelButtonText: T('ยกเลิก') });
    if (name && name.trim()) await syncAction('addData', { type, name: name.trim() }, tf(`เพิ่ม${typeText}แล้ว`, `Added ${typeText}`));
}
async function deleteData(type, i) {
    const name = (type === 'SALE' ? sales : customers)[i]; if (name === undefined) return;
    const typeText = type === 'SALE' ? tf('ทีมงาน', 'team member') : tf('ลูกค้า', 'customer');
    const r = await Swal.fire({ title: T('ยืนยันการลบ?'), text: tf(`ลบรายชื่อ${typeText} "${name}" (ประวัติเดิมยังอยู่)`, `Delete ${typeText} "${name}" (existing history is kept)`), icon: 'warning', showCancelButton: true, confirmButtonColor: '#d94f4f', confirmButtonText: T('ลบ'), cancelButtonText: T('ยกเลิก'), reverseButtons: true });
    if (r.isConfirmed) await syncAction('deleteData', { type, name }, tf(`ลบ${typeText}แล้ว`, `Deleted ${typeText}`));
}

// ============================================================
// ข้อความภาษาอังกฤษถึง Supplier ต่างชาติ (v2.5.0)
//   ข้อความที่คัดลอกเป็นภาษาอังกฤษเสมอ ไม่ว่าหน้าจอจะเป็นภาษาอะไร
// ============================================================
const COMPANY_EN = {
    name: 'C2 Tech Co., Ltd.',
    city: 'Chainat, Thailand',
    address: '99/3 Moo 9, Wang Kai Thuean, Hankha, Chainat 17130, Thailand',
    contact: 'Kant',
    phone: '+66 63 929 1999',
};
const EN_MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function enDate(d) { return d ? `${d.getDate()} ${EN_MON[d.getMonth()]} ${d.getFullYear()}` : '-'; }
function enTime(d) { return d ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : ''; }
// ชื่อลูกค้า/Supplier เป็นภาษาอังกฤษ (ใช้คำแปลในชีต Translations ถ้ามี)
function enName(s) {
    const t = String(s || '').trim();
    if (!HAS_THAI.test(t)) return t;
    if (TR[t]) return TR[t];
    if (!trAsked.has(t)) { trQueue.add(t); clearTimeout(trTimer); trTimer = setTimeout(flushTranslations, 350); }
    return t;
}
const sup = { tab: 'restock', qty: {}, inId: '', supplier: '' };
function suggestQty(g) { return Math.max(0, (g.minStock || 0) * 3 - g.newQty); }

function openSupplierMsg(tab) {
    sup.tab = tab || sup.tab;
    sup.qty = {};
    groupStock().forEach(g => { sup.qty[g.key] = g.low ? suggestQty(g) : 0; });
    const slot = document.getElementById('modal-slot');
    slot.innerHTML = `<div class="modal-back" onclick="if(event.target===this)closeModal()"><div class="modal sup-modal" role="dialog" aria-label="${T('ข้อความถึง Supplier (ภาษาอังกฤษ)')}">
        <div class="modal-h"><div><b style="font-size:17px">🌐 ${T('ข้อความถึง Supplier')}</b><small class="muted" style="display:block">${T('ข้อความเป็นภาษาอังกฤษ แก้ไขได้ก่อนคัดลอก')}</small></div><button class="x" onclick="closeModal()" aria-label="${T('ปิด')}">✕</button></div>
        <div class="chips sup-tabs" id="sup-tabs"></div>
        <div id="sup-body"></div></div></div>`;
    document.addEventListener('keydown', escClose);
    renderSupplierBody();
}
function setSupQty(i, v) { const k = (sup.keys || [])[i]; if (k === undefined) return; sup.qty[k] = Math.max(0, parseInt(v) || 0); updateSupPreview(); }
function setSupTab(t) { sup.tab = t; renderSupplierBody(); }
function renderSupplierBody() {
    const tabs = document.getElementById('sup-tabs'), body = document.getElementById('sup-body');
    if (!tabs || !body) return;
    tabs.innerHTML = [['restock', '🛒 ' + T('ขอสั่งซื้อเพิ่ม')], ['stock', '📦 ' + T('รายงานสต็อก')], ['received', '📥 ' + T('ยืนยันรับของ')]]
        .map(([k, l]) => `<button class="chip ${sup.tab === k ? 'on' : ''}" onclick="setSupTab('${k}')">${l}</button>`).join('');
    if (sup.tab === 'restock') {
        const groups = groupStock().slice().sort((a, b) => (b.low - a.low) || a.key.localeCompare(b.key));
        sup.keys = groups.map(g => g.key);
        body.innerHTML = `
        <div class="card sup-card"><h2>${T('จำนวนที่จะสั่ง')}</h2><small class="muted">${T('ระบบแนะนำให้รุ่นที่ใกล้หมด = เกณฑ์ × 3 − New คงเหลือ · แก้ตัวเลขได้')}</small>
            <div class="sup-rows">${groups.map((g, i) => `<div class="sup-row${g.low ? ' low' : ''}"><span><b>${esc(g.key)}</b><small>New ${g.newQty} · ${T('เกณฑ์')} ${g.minStock}${g.low ? ' · ' + T('ใกล้หมด') : ''}</small></span>
                <input type="number" inputmode="numeric" min="0" value="${sup.qty[g.key] || 0}" aria-label="${T('จำนวน')} ${esc(g.key)}" oninput="setSupQty(${i}, this.value)"></div>`).join('')}</div>
        </div>
        ${supPreviewHtml()}`;
    } else if (sup.tab === 'stock') {
        body.innerHTML = supPreviewHtml();
    } else {
        const ins = allLogs.filter(l => l.direction === 'IN' && l.status !== 'CANCELLED').slice().reverse().slice(0, 30);
        if (!sup.inId || !ins.some(l => l.id === sup.inId)) sup.inId = ins[0] ? ins[0].id : '';
        body.innerHTML = ins.length ? `
        <div class="card sup-card"><h2>${T('เลือกรายการรับเข้า')}</h2>
            <select class="sel" style="width:100%;border-radius:12px;height:44px" onchange="sup.inId=this.value;updateSupPreview()">${ins.map(l => `<option value="${esc(l.id)}" ${l.id === sup.inId ? 'selected' : ''}>${esc(thaiShort(logDate(l)))} · ${esc(U(l.cust) || '-')} · ${fmtN(l.qty)} ${T('ก้อน')}</option>`).join('')}</select>
        </div>
        ${supPreviewHtml()}` : T('<div class="card empty">ยังไม่มีรายการรับเข้า</div>');
    }
}
function supPreviewHtml() {
    return `<div class="card sup-card"><h2>${T('ตัวอย่างข้อความ')} <span class="muted" style="font-size:12px;font-weight:600">English</span></h2>
        <textarea id="sup-text" class="sup-text" spellcheck="false" aria-label="${T('ข้อความภาษาอังกฤษ')}">${esc(supplierText())}</textarea>
        <button class="btn-line sup-copy" onclick="copySupplier()">📋 ${T('คัดลอกข้อความ')}</button></div>`;
}
function updateSupPreview() { const t = document.getElementById('sup-text'); if (t) t.value = supplierText(); }
function copySupplier() {
    const t = document.getElementById('sup-text'); if (!t) return;
    copyText(t.value, T('คัดลอกแล้ว นำไปวางในอีเมลหรือแชทได้เลย'));
}
function supplierText() {
    const now = new Date();
    if (sup.tab === 'restock') {
        const rows = groupStock().filter(g => (sup.qty[g.key] || 0) > 0);
        const total = rows.reduce((a, g) => a + sup.qty[g.key], 0);
        return [
            'Subject: Restock Request — RDS Roller Diamond Stones',
            '',
            'Dear Supplier,',
            '',
            `${COMPANY_EN.name} would like to order the following items:`,
            '',
            ...(rows.length ? rows.map((g, i) => `${i + 1}. ${g.model} #${g.grit} (New) — ${sup.qty[g.key]} pcs`) : ['(no items selected)']),
            '',
            `Total: ${total} pcs`,
            '',
            'Ship to:',
            COMPANY_EN.name,
            COMPANY_EN.address,
            `Contact: ${COMPANY_EN.contact} · ${COMPANY_EN.phone}`,
            '',
            'Please confirm availability, unit price and the estimated delivery date.',
            '',
            'Best regards,',
            `${COMPANY_EN.contact}`,
            `${COMPANY_EN.name} · ${COMPANY_EN.phone}`,
            `Date: ${enDate(now)}`,
        ].join('\n');
    }
    if (sup.tab === 'stock') {
        const groups = groupStock();
        const n = groups.reduce((a, g) => a + g.newQty, 0), u = groups.reduce((a, g) => a + g.usedQty, 0);
        const low = groups.filter(g => g.low);
        return [
            `RDS Stock Report — ${COMPANY_EN.name}`,
            `As of ${enDate(now)}, ${enTime(now)} (GMT+7)`,
            '',
            ...groups.map(g => `${g.model} #${g.grit}: New ${g.newQty} · Used ${g.usedQty} = ${g.newQty + g.usedQty} pcs${g.low ? ' (low)' : ''}`),
            '',
            `Total: ${n + u} pcs (New ${n} · Used ${u})`,
            ...(low.length ? [`Low stock: ${low.map(g => g.key).join(', ')}`] : []),
        ].join('\n');
    }
    const l = allLogs.find(x => x.id === sup.inId);
    if (!l) return '';
    const items = parseItems(l.item, l.typeLabel);
    const from = enName(l.cust);
    return [
        'Subject: Goods Received Confirmation',
        '',
        `Dear ${from || 'Supplier'},`,
        '',
        `We confirm that ${COMPANY_EN.name} received the following items on ${enDate(logDate(l))}:`,
        '',
        ...items.map(it => `• ${it.model} #${it.grit} (${it.condition}) × ${it.qty} pcs`),
        '',
        `Total: ${items.reduce((a, it) => a + it.qty, 0)} pcs`,
        `Our reference: ${l.id}`,
        '',
        'Thank you for your support.',
        '',
        'Best regards,',
        `${COMPANY_EN.contact}`,
        `${COMPANY_EN.name} · ${COMPANY_EN.phone}`,
    ].join('\n');
}

// ---- Admin: แก้ชื่อภาษาอังกฤษของลูกค้า / ทีมงาน ----
async function editEnName(type, i) {
    const name = (type === 'SALE' ? sales : customers)[i]; if (name === undefined) return;
    const { value, isConfirmed } = await Swal.fire({
        title: T('ชื่อภาษาอังกฤษ'), html: `<div style="font-size:14px;color:#6b6b63">${esc(name)}</div>`,
        input: 'text', inputValue: TR[String(name).trim()] || '', inputPlaceholder: 'English name',
        showCancelButton: true, confirmButtonColor: '#0e4a38', confirmButtonText: T('บันทึก'), cancelButtonText: T('ยกเลิก'),
        inputValidator: v => String(v || '').length > 200 ? T('ข้อความยาวเกินไป') : undefined
    });
    if (isConfirmed) await syncAction('setTranslation', { th: String(name).trim(), en: String(value || '').trim() }, T('บันทึกชื่อภาษาอังกฤษแล้ว'));
}

// ปิดการซูมบนมือถือ — iPhone ไม่สนใจ user-scalable=no จึงกันการถ่างนิ้วตรงนี้ ส่วนแตะสองครั้งปิดด้วย touch-action ใน CSS
document.addEventListener('gesturestart', e => e.preventDefault(), { passive: false });

init();
