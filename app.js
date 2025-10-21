// ===== Cấu hình =====
const DATA_DIR = "data"; // thư mục chứa các file pageXX.json

// ===== State =====
let words = [];            // [{id,hanzi,pinyin,meaning,example}]
let remainingIds = [];     // [id,...] các từ còn lại
let lastWordId = null;     // id vừa hỏi gần nhất
let currentWord = null;    // object đang hiển thị

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

// ===== Bind =====
btnStart.addEventListener("click", start);
btnHint.addEventListener("click", showHint);
btnHint2.addEventListener("click", showHint);
btnOk  .addEventListener("click", onOk);
btnSkip.addEventListener("click", onSkip);
btnReset.addEventListener("click", resetProgress);

// ===== Helpers =====
function key(page){ return `progress_page_${page}`; }
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

function pickNext(){
  if(remainingIds.length === 0){
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
  pinyinEl.classList.add("show");
  meaningEl.classList.add("show");
}
function onOk(){
  remainingIds = remainingIds.filter(id => id !== currentWord.id);
  saveProgressLocal(pageNoEl.value);
  pickNext();
}
function onSkip(){
  saveProgressLocal(pageNoEl.value);
  pickNext();
}
async function start(){
  const page = parseInt(pageNoEl.value, 10);
  if(!page){ alert("Nhập số trang trước nhé!"); return; }
  await loadWords(page);

  const pr = loadProgressLocal(page);               // lấy tiến độ cũ (nếu có)
  const { ids, last } = sanitizeProgress(pr);       // làm sạch theo JSON hiện tại
  remainingIds = ids;
  lastWordId = last;
  saveProgressLocal(page);                          // lưu lại tiến độ đã làm sạch

  pickNext();
}

function resetProgress(){
  const page = parseInt(pageNoEl.value, 10);
  if(!page) return;
  if(!confirm("Bạn chắc muốn học lại từ đầu trang này?")) return;
  remainingIds = words.map(w => w.id);
  lastWordId = null;
  saveProgressLocal(page);
  pickNext();
}

const btnClear = document.getElementById("btnClear");
btnClear.addEventListener("click", () => {
  const page = parseInt(pageNoEl.value, 10);
  if(!page) return alert("Nhập số trang trước đã!");
  localStorage.removeItem(key(page));
  alert(`Đã xoá tiến độ trang ${page}. Bấm BẮT ĐẦU HỌC để khởi tạo lại.`);
});

