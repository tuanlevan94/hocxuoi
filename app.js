// ===== Cấu hình =====
const DATA_DIR = "data"; // thư mục chứa các file pageXX.json

// ===== State =====
let words = [];            // [{id,hanzi,pinyin,meaning,example}]
let remainingIds = [];     // [id,...] các từ còn lại
let lastWordId = null;     // id vừa hỏi gần nhất
let currentWord = null;    // object đang hiển thị
let currentPage = null;

// ===== DOM =====
const pageNoEl   = document.getElementById("pageNo");
const btnStart   = document.getElementById("btnStart");
const btnHint    = document.getElementById("btnHint");
const btnHint2 = document.getElementById("btnHint2");
const btnOk      = document.getElementById("btnOk");
const btnSkip    = document.getElementById("btnSkip");
const btnReset   = document.getElementById("btnReset");
const leftCount  = document.getElementById("leftCount");
const hanziEl    = document.getElementById("hanzi");
const pinyinEl   = document.getElementById("pinyin");
const meaningEl  = document.getElementById("meaning");
const timerEl   = document.getElementById("timer");


// ===== Bind =====
btnStart.addEventListener("click", start);
btnHint.addEventListener("click", showHint);
btnHint2.addEventListener("click", showHint);
btnOk  .addEventListener("click", onOk);
btnSkip.addEventListener("click", onSkip);
btnReset.addEventListener("click", resetProgress);

// ===== Helpers =====
function key(page){ return `progress_page_${page}`; }
function timerKey(page){ return `timer_page_${page}`; }

function loadTimerLocal(page){
  const raw = localStorage.getItem(timerKey(page));
  return raw ? JSON.parse(raw) : null;
}

function saveTimerLocal(page, data){
  localStorage.setItem(timerKey(page), JSON.stringify(data));
}

function clearTimerLocal(page){
  localStorage.removeItem(timerKey(page));
}

function loadProgressLocal(page){
  const raw = localStorage.getItem(key(page));
  return raw ? JSON.parse(raw) : null;
}
function saveProgressLocal(page){
  localStorage.setItem(key(page), JSON.stringify({ remainingIds, lastWordId }));
}
async function loadWords(page){
  const res = await fetch(`${DATA_DIR}/page${page}.json`, { cache: "no-store" });
  if(!res.ok) throw new Error("Không tìm thấy dữ liệu trang " + page);
  words = await res.json();
}
function sanitizeProgress(progress){
  const valid = new Set(words.map(w => w.id));               // id tồn tại trong JSON hiện tại
  let ids = Array.isArray(progress?.remainingIds) ? progress.remainingIds : [];
  ids = ids.filter(id => valid.has(id));                      // chỉ giữ id hợp lệ
  if (ids.length === 0) ids = words.map(w => w.id);           // nếu rỗng thì reset full
  const last = valid.has(progress?.lastWordId) ? progress.lastWordId : null;
  return { ids, last };
}

// ===== Timer =====
let timerInterval = null;
let timerBaseMs = 0;           // ms đã tích lũy (khi pause)
let timerStartedAt = null;     // epoch ms khi start/resume
let inactivityTimeout = null;  // auto stop
let timerLastTouchAt = null;   // lần “chạm” cuối (start/hint/ok/skip)
let timerLastSavedSec = -1;    // để tránh save quá dày

function pad2(n){ return String(n).padStart(2, "0"); }

function formatTime(ms){
  const totalSec = Math.floor(ms / 1000);
  const hh = Math.floor(totalSec / 3600);
  const mm = Math.floor((totalSec % 3600) / 60);
  const ss = totalSec % 60;
  return `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`;
}

function getElapsedMs(){
  if (timerStartedAt == null) return timerBaseMs;
  return timerBaseMs + (Date.now() - timerStartedAt);
}

function persistTimer(){
  if (!currentPage) return;
  saveTimerLocal(currentPage, {
    baseMs: timerBaseMs,
    startedAt: timerStartedAt,
    lastTouchAt: timerLastTouchAt
  });
}

function renderTimer(){
  if (!timerEl) return;

  const ms = getElapsedMs();
  timerEl.textContent = formatTime(ms);

  // chỉ lưu mỗi khi đổi giây (nhẹ localStorage)
  const sec = Math.floor(ms / 1000);
  if (sec !== timerLastSavedSec){
    timerLastSavedSec = sec;
    persistTimer();
  }
}

function clearAutoStop(){
  if (inactivityTimeout){
    clearTimeout(inactivityTimeout);
    inactivityTimeout = null;
  }
}

function armAutoStop(remainingMs = 15000){
  clearAutoStop();
  inactivityTimeout = setTimeout(() => {
    stopTimer();
  }, Math.max(0, remainingMs));
}

function startTimer(){
  const now = Date.now();
  if (timerStartedAt == null) timerStartedAt = now;

  if (!timerLastTouchAt) timerLastTouchAt = now;

  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(renderTimer, 250);

  renderTimer();
  const remain = 15000 - (now - timerLastTouchAt);
  armAutoStop(remain);
  persistTimer();
}

function stopTimer(){
  if (timerStartedAt != null){
    timerBaseMs += (Date.now() - timerStartedAt);
    timerStartedAt = null;
  }
  if (timerInterval){
    clearInterval(timerInterval);
    timerInterval = null;
  }
  clearAutoStop();
  renderTimer();
  persistTimer();
}

function resetTimer(andStart = false){
  if (timerInterval){
    clearInterval(timerInterval);
    timerInterval = null;
  }
  clearAutoStop();

  timerBaseMs = 0;
  timerStartedAt = null;
  timerLastTouchAt = null;
  timerLastSavedSec = -1;

  renderTimer();
  persistTimer();
  if (andStart) startTimer();
}

function touchTimer(){
  const now = Date.now();
  timerLastTouchAt = now;

  if (timerInterval == null && timerStartedAt == null){
    startTimer(); // đang dừng -> resume
  } else {
    armAutoStop(15000); // đang chạy -> gia hạn 15s
  }
  persistTimer();
}

// Restore timer theo trang (giúp refresh không mất giờ)
function restoreTimerForPage(page){
  currentPage = page;

  const data = loadTimerLocal(page);
  if (!data){
    // chưa có -> bắt đầu mới
    timerBaseMs = 0;
    timerStartedAt = null;
    timerLastTouchAt = null;
    timerLastSavedSec = -1;
    renderTimer();
    return;
  }

  timerBaseMs = Number(data.baseMs || 0);
  timerStartedAt = data.startedAt != null ? Number(data.startedAt) : null;
  timerLastTouchAt = data.lastTouchAt != null ? Number(data.lastTouchAt) : null;
  timerLastSavedSec = -1;

  const now = Date.now();

  // Nếu trước đó đang chạy:
  if (timerStartedAt != null){
    const stopAt = (timerLastTouchAt != null ? timerLastTouchAt : timerStartedAt) + 15000;

    if (now >= stopAt){
      // đáng ra đã auto-stop -> chỉ cộng tới stopAt (không cộng thêm idle)
      timerBaseMs += Math.max(0, stopAt - timerStartedAt);
      timerStartedAt = null;
      renderTimer();
      persistTimer();
    } else {
      // vẫn còn trong “15s hoạt động” -> tiếp tục chạy
      timerBaseMs += Math.max(0, now - timerStartedAt);
      timerStartedAt = null; // chuyển sang startTimer() để chạy tiếp mượt
      renderTimer();
      startTimer();
    }
  } else {
    // trước đó đang dừng -> hiển thị, rồi start lại khi bấm Start
    renderTimer();
  }
}

// đảm bảo thoát tab vẫn lưu
window.addEventListener("pagehide", () => {
  persistTimer();
});



function pickNext(){
  if(remainingIds.length === 0){
    //stopTimer();
    resetTimer(true);
    currentWord = null;
    hanziEl.textContent = "🎉 Bạn đã học hoàn tất trang này!";
    pinyinEl.classList.remove("show");
    meaningEl.classList.remove("show");
    btnHint.disabled = btnOk.disabled = btnSkip.disabled = true;
    btnHint2.disabled = true;
    return;
  }
  const len = remainingIds.length;
  let id = remainingIds[0];
  if (len > 1) {
    let attempts = 0;
    do {
      id = remainingIds[Math.floor(Math.random() * len)];
    } while (id === lastWordId && attempts++ < 50);
  }
  currentWord = words.find(w => w.id === id);
  if (!currentWord) {
    // Nếu vẫn lệch, lọc lại remainingIds rồi thử lại
    const valid = new Set(words.map(w => w.id));
    remainingIds = remainingIds.filter(x => valid.has(x));
    saveProgressLocal(pageNoEl.value);
    return pickNext();
  }
  lastWordId = id;
  renderWord();
}

function renderWord(){
  hanziEl.textContent = currentWord.hanzi;
  pinyinEl.textContent = currentWord.pinyin || "";
  meaningEl.textContent = currentWord.meaning || "";
  pinyinEl.classList.remove("show");
  meaningEl.classList.remove("show");
  leftCount.textContent = remainingIds.length.toString();
  btnHint.disabled = btnOk.disabled = btnSkip.disabled = false;
  btnHint2.disabled = false;  
  btnReset.disabled = false;
}
function showHint(){
  touchTimer();
  pinyinEl.classList.add("show");
  meaningEl.classList.add("show");
}
function onOk(){
  touchTimer();
  remainingIds = remainingIds.filter(id => id !== currentWord.id);
  saveProgressLocal(pageNoEl.value);
  pickNext();
}
function onSkip(){
  touchTimer();
  saveProgressLocal(pageNoEl.value);
  pickNext();
}
async function start(){
  const page = parseInt(pageNoEl.value, 10);
  if(!page){ alert("Nhập số trang trước nhé!"); return; }

  // restore timer theo trang trước (để refresh không mất)
  restoreTimerForPage(page);

  await loadWords(page);

  const pr = loadProgressLocal(page);
  const { ids, last } = sanitizeProgress(pr);
  remainingIds = ids;
  lastWordId = last;
  saveProgressLocal(page);

  pickNext();

  // BẮT ĐẦU HỌC -> bắt đầu/tiếp tục timer (không reset)
  startTimer();
}


function resetProgress(){
  const page = parseInt(pageNoEl.value, 10);
  if(!page) return;
  if(!confirm("Bạn chắc muốn học lại từ đầu trang này?")) return;

  currentPage = page;
  resetTimer(true);

  remainingIds = words.map(w => w.id);
  lastWordId = null;
  saveProgressLocal(page);
  pickNext();
}


const btnClear = document.getElementById("btnClear");
btnClear.addEventListener("click", () => {
  const page = parseInt(pageNoEl.value, 10);
  if(!page) return alert("Nhập số trang trước đã!");

  clearTimerLocal(page);     // xóa timer
  localStorage.removeItem(key(page)); // xóa progress

  alert(`Đã xoá tiến độ + timer trang ${page}. Bấm BẮT ĐẦU HỌC để khởi tạo lại.`);
});


