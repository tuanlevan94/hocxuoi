# HƯỚNG DẪN: Thêm trang học mới cho web HỌC XUÔI

> File này để anh Tuấn tự làm theo, hoặc gửi kèm cho Claude ở cuộc trò chuyện mới để Claude hiểu ngay toàn bộ hệ thống mà không phải hỏi lại.
> Cập nhật lần cuối: 28/10/2026.

---

## 1. Tổng quan hệ thống

| Thành phần | Ở đâu | Vai trò |
|---|---|---|
| File Excel `KOREAN.xlsx` | máy anh | Nơi soạn và lưu từ vựng tiếng Hàn. Mỗi sheet là một trang. |
| Database SQL Server `chinese_V2` | máy anh (SQL Server Express, mở bằng SSMS) | Lưu mọi ngôn ngữ đang học. Mỗi trang là một bảng `pageXX`. |
| Web HỌC XUÔI | `D:\Dropbox\hoc-xuoi-web` → GitHub `tuanlevan94/hocxuoi` → Vercel | Web học trên iPhone. Push lên GitHub là Vercel tự cập nhật. |

Luồng làm việc: **Excel → SQL (database) → JSON (web) → mp3 (âm thanh) → git push**

---

## 2. Quy ước đánh số trang

| Trang | Nội dung |
|---|---|
| 1 – 49 | Tiếng Trung |
| 200 – 212 | Tiếng Hàn: từ vựng (đã học đến 209, đang học 210) |
| 213 – 219 | Để trống (dự phòng cho từ vựng sau này) |
| 220 – 230 | Tiếng Hàn: câu giao tiếp hằng ngày |
| 250 trở đi | Tiếng Hàn chuyên ngành (xi mạ, anod, máy móc). **Không đụng vào khi làm trang thường.** |

Mỗi trang tối đa **250** từ hoặc câu.

Nội dung các trang câu giao tiếp:

- **220:** chào hỏi, làm quen, những câu dùng khi không hiểu
- **221:** ở công ty
- **222:** ăn uống
- **223:** mua sắm, đi lại
- **224:** trò chuyện xã giao, hẹn gặp
- **225:** phản ứng nhanh, cảm xúc, câu cửa miệng
- **226:** nhà ở, sinh hoạt
- **227:** bệnh viện, ngân hàng, thủ tục
- **228:** làm việc với khách hàng và tại nhà máy (báo giá, lắp đặt, vận hành, sự cố)
- **229:** đi chơi, giải trí, điện thoại
- **230:** nói câu dài: ý kiến, lý do, kể chuyện (cột ghi chú có tên mẫu ngữ pháp)

---

## 3. Cấu trúc dữ liệu (giống nhau ở cả 3 nơi)

| Cột Excel / SQL | Trường JSON | Ý nghĩa |
|---|---|---|
| `Id` | `id` | Số thứ tự trong trang (1 → 250) |
| `Hanzi` | `hanzi` | Chữ Hàn hoặc chữ Hán (tên cột giữ từ thời học tiếng Trung) |
| `Pinyin` | `pinyin` | Phiên âm. Tiếng Hàn dùng Revised Romanization theo cách đọc thật, chữ thường (vd: 감사합니다 → `gamsahamnida`) |
| `Meaning` | `meaning` | Nghĩa tiếng Việt |
| `Example` | `example` | Ghi chú ngắn: mức lịch sự (lịch sự / trang trọng / thân mật), "đáp lại câu trên", mẫu ngữ pháp… Web hiện dòng này khi bấm GỢI Ý. |

**Bảng SQL** (bảng mới tạo đúng theo mẫu này):
```sql
CREATE TABLE [dbo].[pageXXX](
    [Id] [int] NULL,
    [Hanzi] [nvarchar](300) NULL,
    [Pinyin] [nvarchar](300) NULL,
    [Meaning] [nvarchar](max) NULL,
    [Example] [nvarchar](max) NULL
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
```

**File JSON của web** (`data/pageXXX.json`): mảng các object `{"id", "hanzi", "pinyin", "meaning", "example"}`, thụt lề 4 dấu cách, mã UTF-8.

---

## 4. Quy tắc khi thêm từ hoặc câu mới

1. **Không trùng lặp.** So cột `Hanzi` với **toàn bộ** các trang đã có (200–212, 220–230, 250+ và sheet `total`). So sánh sau khi bỏ dấu cách và dấu câu (`. ? ! , … ~`). Từ nào đã có thì bỏ.
2. **Không sửa** các trang đã học (≤ 209) và các trang chuyên ngành (≥ 250).
3. Lấy từ vựng mới **theo thứ tự** trong sheet `total`, mỗi trang đủ 250 từ rồi mới sang trang tiếp theo.
4. Câu giao tiếp:
   - Nói tự nhiên như người Hàn nói thật, chủ yếu đuôi 해요체.
   - Ghi rõ trong cột Example khi câu dùng 합쇼체 (trang trọng) hoặc 반말 (thân mật).
   - Câu hỏi và câu trả lời đặt liền nhau.
   - Dịch 반말 sang tiếng Việt bằng tớ/cậu (không dùng tao/mày).
   - Không có dấu chấm cuối câu.

---

## 5. Các bước thêm trang mới (ví dụ trang 231)

### Bước 1: Excel
Thêm sheet `231` vào `KOREAN.xlsx`, đặt trước sheet `250`. Giữ đúng 5 cột `Id | Hanzi | Pinyin | Meaning | Example`.

### Bước 2: Đưa vào database (SSMS)
Chạy script INSERT (Claude có thể tạo sẵn script từ file Excel). Script nên:
- Tạo bảng nếu chưa có (`IF OBJECT_ID(N'[dbo].[page231]', N'U') IS NULL CREATE TABLE ...`).
- Dừng lại nếu bảng đã có dữ liệu, để chạy nhầm 2 lần cũng không bị nhân đôi.
- Chạy trong `BEGIN TRANSACTION ... COMMIT`.
- Dùng tiền tố `N'...'` cho chữ Hàn và tiếng Việt.

### Bước 3: Tạo file JSON cho web
Cách cũ, làm trong SSMS:
```sql
SELECT 
  Id      AS [id],
  Hanzi   AS [hanzi],
  Pinyin  AS [pinyin],
  Meaning AS [meaning],
  Example AS [example]
FROM page231
ORDER BY Id
FOR JSON PATH;
```
Copy kết quả vào `data/page231.json` trong VS Code, bấm `Alt+Shift+F` cho đẹp, rồi lưu.

Cách nhanh hơn: gửi Excel cho Claude và nhờ tạo sẵn file `data/page231.json`.

### Bước 4: Tạo âm thanh (mở Git Bash tại `D:\Dropbox\hoc-xuoi-web`)
```
py -u tools/make_audio.py
```
- Script chỉ tạo mp3 cho từ hoặc câu **chưa có** âm thanh, nên chạy lại bao nhiêu lần cũng được.
- Chỉ làm vài trang: `py -u tools/make_audio.py 231 232`
- Tiếng Trung (thêm `--zh`): `py -u tools/make_audio.py --zh 23`
- Giọng nam: thêm `--voice-ko ko-KR-InJoonNeural`
- `-u` để số tiến độ hiện ra ngay trong Git Bash. Không có `-u` thì vẫn chạy, chỉ là đến cuối mới hiện chữ.
- Máy mới chưa cài thư viện thì chạy trước một lần: `py -m pip install edge-tts`

### Bước 5: Đưa lên web
```
git add .
git commit -m "them trang 231"
git push origin master
```
Lệnh `git add` có **dấu cách** trước dấu chấm. Đợi 1–2 phút để Vercel cập nhật, rồi mở web trên iPhone và kéo xuống tải lại trang.

---

## 6. Cấu trúc thư mục web

```
hoc-xuoi-web/
├─ index.html          giao diện
├─ app.js              logic học, đồng hồ, phát âm
├─ style.css           giao diện
├─ data/pageXX.json    dữ liệu từng trang
├─ audio/ko/*.mp3      âm thanh tiếng Hàn
├─ audio/zh/*.mp3      âm thanh tiếng Trung (nếu tạo)
└─ tools/make_audio.py script tạo mp3
```

**Cách web tìm file âm thanh:** tên file là 16 ký tự đầu của mã SHA-1 tính từ chữ trong `hanzi` (đã chuẩn hoá Unicode NFC và bỏ khoảng trắng 2 đầu), đặt trong `audio/ko/` hoặc `audio/zh/` tuỳ có chữ Hàn hay không. Vì vậy **không cần sửa file JSON** khi thêm âm thanh. Câu nào chưa có mp3 thì web tự dùng giọng đọc của iPhone.

**Giao diện, lưu ý quan trọng khi sửa web:**
- Hàng nút phía trên (BẮT ĐẦU HỌC, GỢI Ý, ĐÃ THUỘC, BỎ QUA, HỌC LẠI, XÓA TIẾN ĐỘ TRANG, GỢI Ý, đồng hồ) đã được sắp xếp tối ưu để bấm một tay trên iPhone, cả tay trái và tay phải. **Không thay đổi vị trí, thứ tự hay kích thước các nút này.**
- Thanh phát âm (🔊 NGHE, 🐢 CHẬM) cố định ở cuối màn hình. Chạm vào thẻ chữ cũng phát âm.
- Tiến độ học và đồng hồ lưu trong localStorage của trình duyệt, theo từng trang.

---

## 7. Mẫu tin nhắn gửi Claude lần sau

> Chào Claude, anh đang học tiếng Hàn bằng web HỌC XUÔI. Đọc file hướng dẫn đính kèm để hiểu hệ thống nhé. Anh gửi kèm `KOREAN.xlsx` (và file zip dự án `hoc-xuoi-web` nếu cần sửa web).
> Nhờ em: [ví dụ: soạn thêm 3 trang câu giao tiếp 231–233 về chủ đề …, không trùng với các trang đã có] rồi tạo luôn cho anh:
> (1) file Excel cập nhật, (2) script SQL để chạy trong SSMS, (3) các file `data/pageXXX.json` cho web.
> Anh tự chạy tạo âm thanh và git push.
