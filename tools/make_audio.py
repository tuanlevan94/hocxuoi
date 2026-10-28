# -*- coding: utf-8 -*-
"""
Tạo file âm thanh (mp3) cho web HỌC XUÔI bằng giọng đọc Microsoft (Edge, giọng neural).

Cách dùng (mở terminal tại thư mục hoc-xuoi-web):
    pip install edge-tts
    python tools/make_audio.py              # mặc định: mọi trang có chữ Hàn
    python tools/make_audio.py 220 221      # chỉ các trang chỉ định
    python tools/make_audio.py --zh 23      # thêm tiếng Trung cho trang 23
    python tools/make_audio.py --dry-run    # chỉ đếm, không tạo file

- File lưu ở audio/ko/<hash>.mp3 (Hàn) và audio/zh/<hash>.mp3 (Trung).
  <hash> = 16 ký tự đầu SHA-1 của chữ (chuẩn hoá NFC, bỏ khoảng trắng 2 đầu),
  web tự tính đúng cách này nên KHÔNG cần sửa các file data/pageXX.json.
- File đã có thì bỏ qua -> chạy lại bao nhiêu lần cũng được, bị ngắt giữa chừng
  thì chạy lại là làm tiếp. Thêm trang mới thì chạy lại là xong.
- Sửa chữ của một từ trong JSON -> hash đổi -> chạy lại sẽ tạo file mới cho từ đó.
"""
import argparse
import asyncio
import glob
import hashlib
import json
import os
import re
import sys
import unicodedata

try:
    import edge_tts
except ImportError:
    sys.exit("Chưa cài edge-tts. Chạy:  pip install edge-tts")

# Windows / Git Bash: tránh lỗi in tiếng Việt, tiếng Hàn ra màn hình
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT, "data")
AUDIO_DIR = os.path.join(ROOT, "audio")

VOICES = {
    "ko": "ko-KR-SunHiNeural",       # giọng nữ Hàn; giọng nam: ko-KR-InJoonNeural
    "zh": "zh-CN-XiaoxiaoNeural",    # giọng nữ Trung; giọng nam: zh-CN-YunxiNeural
}
HANGUL = re.compile("[\\u1100-\\u11ff\\u3130-\\u318f\\uac00-\\ud7a3]")  # chữ cái + âm tiết Hàn


def norm(text):
    return unicodedata.normalize("NFC", str(text or "")).strip()


def lang_of(text):
    return "ko" if HANGUL.search(text) else "zh"


def audio_name(text):
    return hashlib.sha1(text.encode("utf-8")).hexdigest()[:16] + ".mp3"


def page_no(path):
    m = re.search(r"page(\d+)\.json$", path)
    return int(m.group(1)) if m else None


def load_page(no):
    with open(os.path.join(DATA_DIR, f"page{no}.json"), encoding="utf-8-sig") as f:
        return json.load(f)


def collect(pages, include_zh):
    """Trả về {đường_dẫn_mp3: (lang, text)} cần có."""
    jobs = {}
    for no in pages:
        try:
            words = load_page(no)
        except FileNotFoundError:
            print(f"  ! Không có data/page{no}.json, bỏ qua")
            continue
        for w in words:
            text = norm(w.get("hanzi"))
            if not text:
                continue
            lang = lang_of(text)
            if lang == "zh" and not include_zh:
                continue
            jobs[os.path.join(AUDIO_DIR, lang, audio_name(text))] = (lang, text)
    return jobs


async def make_one(path, lang, text, voice_override, sem, stats):
    async with sem:
        tmp = path + ".part"
        for attempt in range(4):
            try:
                voice = voice_override.get(lang) or VOICES[lang]
                await edge_tts.Communicate(text, voice).save(tmp)
                if os.path.getsize(tmp) == 0:
                    raise RuntimeError("file rỗng")
                os.replace(tmp, path)
                stats["ok"] += 1
                done = stats["ok"] + stats["fail"]
                if done % 50 == 0 or done == stats["total"]:
                    print(f"  {done}/{stats['total']}")
                return
            except Exception as e:  # mạng chập chờn -> thử lại
                err = e
                await asyncio.sleep(2 * (attempt + 1))
        if os.path.exists(tmp):
            os.remove(tmp)
        stats["fail"] += 1
        print(f"  ! Lỗi: {text}  ({err})")


async def main():
    ap = argparse.ArgumentParser(description="Tạo mp3 cho web HỌC XUÔI")
    ap.add_argument("pages", nargs="*", type=int, help="số trang (bỏ trống = mọi trang có chữ Hàn)")
    ap.add_argument("--zh", action="store_true", help="tạo cả tiếng Trung")
    ap.add_argument("--voice-ko", help="đổi giọng Hàn, vd ko-KR-InJoonNeural")
    ap.add_argument("--voice-zh", help="đổi giọng Trung, vd zh-CN-YunxiNeural")
    ap.add_argument("--jobs", type=int, default=4, help="số file tạo song song (mặc định 4)")
    ap.add_argument("--dry-run", action="store_true", help="chỉ đếm, không tạo")
    args = ap.parse_args()

    pages = args.pages
    if not pages:
        pages = []
        for path in sorted(glob.glob(os.path.join(DATA_DIR, "page*.json")), key=lambda p: page_no(p) or 0):
            no = page_no(path)
            if no is None:
                continue
            words = load_page(no)
            if args.zh or any(HANGUL.search(norm(w.get("hanzi"))) for w in words):
                pages.append(no)
    print("Trang:", ", ".join(map(str, pages)))

    jobs = collect(pages, include_zh=args.zh)
    todo = {p: v for p, v in jobs.items() if not os.path.exists(p)}
    print(f"Tổng {len(jobs)} câu/từ, đã có {len(jobs) - len(todo)}, cần tạo {len(todo)}")
    if args.dry_run or not todo:
        return

    for lang in ("ko", "zh"):
        os.makedirs(os.path.join(AUDIO_DIR, lang), exist_ok=True)
    voice_override = {"ko": args.voice_ko, "zh": args.voice_zh}
    stats = {"ok": 0, "fail": 0, "total": len(todo)}
    sem = asyncio.Semaphore(max(1, args.jobs))
    await asyncio.gather(*(make_one(p, lang, text, voice_override, sem, stats)
                           for p, (lang, text) in todo.items()))

    size = sum(os.path.getsize(p) for p in jobs if os.path.exists(p))
    print(f"Xong: tạo mới {stats['ok']}, lỗi {stats['fail']}. "
          f"Tổng dung lượng audio các trang này: {size / 1024 / 1024:.1f} MB")
    if stats["fail"]:
        print("Có file lỗi -> chạy lại lệnh y như cũ để tạo tiếp phần còn thiếu.")


if __name__ == "__main__":
    asyncio.run(main())
