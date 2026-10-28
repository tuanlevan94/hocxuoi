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
const noteEl     = document.getElementById("note");
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
const IDLE_MS = 15000;         // không chạm gì quá 15s -> coi như ngừng học

// Thời điểm cuối cùng còn được tính là "đang học"
function activeUntil(){
  const lastTouch = timerLastTouchAt != null ? timerLastTouchAt : timerStartedAt;
  return lastTouch + IDLE_MS;
}

// "Bây giờ" nhưng bị chặn trên bởi activeUntil().
// iOS đóng băng JS khi tắt màn hình / thoát Safari, nên setTimeout auto-stop
// không chạy đúng giờ. Chặn ở đây thì dù JS bị đóng băng bao lâu,
// thời gian cũng không bị cộng dư.
function effectiveNow(){
  return Math.min(Date.now(), activeUntil());
}

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
  return timerBaseMs + Math.max(0, effectiveNow() - timerStartedAt);
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

function armAutoStop(remainingMs = IDLE_MS){
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
  const remain = IDLE_MS - (now - timerLastTouchAt);
  armAutoStop(remain);
  persistTimer();
}

function stopTimer(){
  if (timerStartedAt != null){
    timerBaseMs += Math.max(0, effectiveNow() - timerStartedAt);
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
  // Đang "chạy" nhưng thực ra đã quá 15s không chạm (JS bị đóng băng nên
  // auto-stop chưa kịp chạy) -> chốt thời gian tới mốc 15s trước đã
  if (timerStartedAt != null && Date.now() > activeUntil()){
    stopTimer();
  }

  timerLastTouchAt = Date.now();

  if (timerStartedAt == null){
    startTimer(); // đang dừng -> resume
  } else {
    armAutoStop(IDLE_MS); // đang chạy -> gia hạn 15s
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

  // Nếu lần trước đang chạy (vd Safari bị tắt ngang): chỉ cộng tới
  // lần chạm cuối + 15s, không cộng khoảng thời gian bỏ đi
  if (timerStartedAt != null){
    timerBaseMs += Math.max(0, effectiveNow() - timerStartedAt);
    timerStartedAt = null;
  }
  renderTimer();
  persistTimer();
}

// Thoát web / khoá màn hình / chuyển app -> DỪNG timer ngay lập tức.
// Quay lại thì timer chạy tiếp khi bạn bấm nút bất kỳ (gợi ý / đã thuộc / bỏ qua).
document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopTimer();
  else renderTimer();
});
window.addEventListener("pagehide", () => {
  stopTimer();
});



function pickNext(){
  if(remainingIds.length === 0){
    //stopTimer();
    resetTimer(true);
    currentWord = null;
    hanziEl.textContent = "🎉 Bạn đã học hoàn tất trang này!";
    hanziEl.classList.remove("long", "xlong");
    noteEl.classList.remove("show");
    pinyinEl.classList.remove("show");
    meaningEl.classList.remove("show");
    btnHint.disabled = btnOk.disabled = btnSkip.disabled = true;
    btnHint2.disabled = true;
    btnPlay.disabled = btnSlow.disabled = true;
    stopAudio();
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
  noteEl.textContent = currentWord.example || "";
  pinyinEl.classList.remove("show");
  meaningEl.classList.remove("show");
  noteEl.classList.remove("show");
  // câu dài -> chữ nhỏ lại cho vừa thẻ
  const len = (currentWord.hanzi || "").length;
  hanziEl.classList.toggle("long",  len > 10 && len <= 18);
  hanziEl.classList.toggle("xlong", len > 18);
  leftCount.textContent = remainingIds.length.toString();
  btnHint.disabled = btnOk.disabled = btnSkip.disabled = false;
  btnHint2.disabled = false;  
  btnReset.disabled = false;
  btnPlay.disabled = btnSlow.disabled = false;
  stopAudio();
  prepareAudio(currentWord);
}
function showHint(){
  touchTimer();
  pinyinEl.classList.add("show");
  meaningEl.classList.add("show");
  if (noteEl.textContent.trim()) noteEl.classList.add("show");
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

  // chốt timer của trang đang học (nếu có) trước khi chuyển trang
  stopTimer();

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
  touchTimer();
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

// ===== Phát âm =====
// Ưu tiên file mp3 trong thư mục audio/ (tạo bằng tools/make_audio.py).
// Tên file = 16 ký tự đầu SHA-1 của chữ (đã chuẩn hoá NFC + bỏ khoảng trắng 2 đầu):
//   audio/ko/<hash>.mp3 (tiếng Hàn)   audio/zh/<hash>.mp3 (tiếng Trung)
// Chưa có file mp3 -> dùng giọng đọc có sẵn của điện thoại.
const AUDIO_DIR = "audio";
const btnPlay = document.getElementById("btnPlay");
const btnSlow = document.getElementById("btnSlow");
const player  = new Audio();
let audioUrl = null;     // url mp3 của từ đang hiện
let audioOk  = false;    // file mp3 có tồn tại không
let audioToken = 0;

function langOf(text){ return /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7a3]/.test(text) ? "ko" : "zh"; }

async function hashText(text){
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

// Gọi mỗi khi đổi từ: tính sẵn url + kiểm tra file có không,
// để lúc bấm NGHE phát được ngay (iPhone chỉ cho phát khi đang bấm)
async function prepareAudio(word){
  const token = ++audioToken;
  audioUrl = null; audioOk = false;
  try {
    const text = (word.hanzi || "").normalize("NFC").trim();
    if (!text || !(window.crypto && crypto.subtle)) return;
    const url = `${AUDIO_DIR}/${langOf(text)}/${await hashText(text)}.mp3`;
    const res = await fetch(url, { method: "HEAD" });
    if (token !== audioToken) return;          // đã sang từ khác
    audioUrl = url; audioOk = res.ok;
  } catch (e) { /* không có mạng / không có file -> dùng giọng máy */ }
}

function stopAudio(){
  player.pause();
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  hanziEl.classList.remove("speaking");
}

function speakTTS(text, slow){
  if (!("speechSynthesis" in window)) return;
  const lang = langOf(text) === "ko" ? "ko-KR" : "zh-CN";
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  u.rate = slow ? 0.6 : 0.9;
  const voice = speechSynthesis.getVoices().find(v => v.lang && v.lang.replace("_", "-").startsWith(lang.slice(0, 2)));
  if (voice) u.voice = voice;
  u.onend = u.onerror = () => hanziEl.classList.remove("speaking");
  hanziEl.classList.add("speaking");
  speechSynthesis.speak(u);
}

function playCurrent(slow = false){
  if (!currentWord) return;
  touchTimer();
  stopAudio();
  if (audioOk && audioUrl){
    if (!player.src.endsWith(audioUrl)) player.src = audioUrl;
    player.currentTime = 0;
    player.defaultPlaybackRate = player.playbackRate = slow ? 0.7 : 1;
    hanziEl.classList.add("speaking");
    player.play().catch(() => { hanziEl.classList.remove("speaking"); speakTTS(currentWord.hanzi || "", slow); });
  } else {
    speakTTS(currentWord.hanzi || "", slow);
  }
}
player.addEventListener("ended", () => hanziEl.classList.remove("speaking"));
player.addEventListener("pause", () => hanziEl.classList.remove("speaking"));

hanziEl.addEventListener("click", () => playCurrent(false));   // chạm thẻ chữ = NGHE
btnPlay.addEventListener("click", () => playCurrent(false));
btnSlow.addEventListener("click", () => playCurrent(true));
