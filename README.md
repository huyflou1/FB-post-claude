# 🐣 FB Scrat & AutoPost by HuyFlou

Đăng bài tự động lên nhiều Fanpage Facebook, từ nhiều nick, qua **Graph API chính thức**. Chạy trên máy của bạn, dữ liệu và token chỉ nằm trong thư mục `storage/`.

## Chạy app

Nhấp đúp `run.bat` (cần Node.js 20+). App mở tại http://localhost:3100.
Chế độ phát triển: `run.bat dev`.

Giữ cửa sổ app mở thì bài hẹn giờ mới tự đăng.

## Menu

Xếp theo luồng làm việc: **Săn bài → Kho nội dung → Soạn bài → Lịch đăng** (số nhỏ trên icon menu).

| | Mục | Dùng để |
|---|---|---|
| 🏡 | Tổng quan | Số liệu, bài sắp đăng, bài hot vừa săn, hoạt động gần đây |
| 🔎 | 1 · Săn bài | Theo dõi Fanpage, cào bài kèm lượt cảm xúc / bình luận / chia sẻ, lọc bài hot, tự cào định kỳ |
| 🗃️ | 2 · Kho nội dung | Bài đã lưu (⭐) và mẫu viết sẵn |
| ✍️ | 3 · Soạn bài | Viết tay hoặc nhờ AI, gắn ảnh/video/link, chọn trang, đăng ngay / hẹn giờ / lưu nháp |
| 📅 | 4 · Lịch đăng | Hàng chờ và lịch sử: tiến độ từng trang, dừng, thử lại, sửa, nhân bản |
| 📜 | Nhật ký | Ghi chép mọi lần đăng và cào |
| 👥 | Nick & Trang | Thêm nick bằng token, bật/tắt từng trang, gia hạn token |
| ⚙️ | Cài đặt | Đăng an toàn, App Facebook, API key AI |

## Săn bài

- Thêm nguồn bằng link trang (`facebook.com/tentrang`), tên người dùng hoặc ID. Trang của bạn có nút thêm nhanh.
- **Trang do nick của bạn quản lý:** cào được ngay.
- **Trang công khai khác:** App Facebook cần quyền *Page Public Content Access* (Facebook phải duyệt). Chưa có thì app báo rõ lý do.
- App dùng Graph API chính thức, không đăng nhập giả lập hay dùng cookie, nên không làm khoá nick.
- Mỗi bài có nút **AI viết lại** (mở Soạn bài kèm ảnh, bật sẵn Trợ lý AI) và **Dùng** (đưa nguyên văn vào Soạn bài).
- Chỉ đăng lại nội dung bạn có quyền dùng; nên viết lại bằng AI và ghi nguồn ảnh.

## Thêm nick

1. Vào [Graph API Explorer](https://developers.facebook.com/tools/explorer/), chọn App.
2. Thêm quyền `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`.
3. **Generate Access Token**, đăng nhập nick, chọn các trang, copy token và dán vào mục Nick & Trang.
4. Nên làm: nhập App ID + App Secret ở Cài đặt rồi bấm **Gia hạn** trên thẻ nick. Token trang lấy từ token dài hạn sẽ không hết hạn.

Chưa có token? Bấm **Thêm nick demo** để thử toàn bộ app mà không gọi Facebook.

## Trợ lý viết bài AI

Trong Soạn bài bấm **✨ Viết bằng AI**: chọn mô hình, nhập chủ đề (hoặc viết lại bài đang có), chọn giọng văn, độ dài, số phiên bản, emoji / hashtag / kêu gọi hành động / spintax, rồi chọn bài ưng ý.

| Mô hình | Cần |
|---|---|
| 🧡 Claude (Opus 5.5 mặc định, Sonnet 5.5, Haiku 5.5, Fable 5.1) | API key Anthropic |
| 💚 ChatGPT | API key OpenAI |
| 💙 Gemini | API key Google AI Studio |
| 🐳 DeepSeek | API key DeepSeek |
| 🌐 OpenRouter | 1 key dùng được hàng trăm mô hình |
| 🦙 Ollama | Không cần key, chạy trên máy (cài Ollama rồi `ollama pull qwen2.5:7b`) |

Nhập key ở **Cài đặt → Trợ lý AI** (chỉ cần một nhà cung cấp). Ô mô hình có gợi ý nhưng gõ được tên mô hình bất kỳ của nhà cung cấp đó. Mỗi lần viết là một lượt gọi API tính phí theo bảng giá của nhà cung cấp (trừ Ollama).

## Nội dung động

- Spintax: `{Chào|Xin chào|Hello} cả nhà` → mỗi trang nhận một lựa chọn ngẫu nhiên.
- Biến: `{{page}}` tên trang, `{{account}}` tên nick, `{{date}}`, `{{time}}`.

## Giới hạn của Facebook

- Ứng dụng chỉ đăng được lên **Trang** mà nick quản lý. Trang cá nhân và nhóm không đăng được qua API chính thức.
- Mỗi bài: tối đa 10 ảnh, hoặc 1 video (không kèm ảnh).
- Bài đăng lần lượt từng trang, nghỉ ngẫu nhiên giữa các trang; có giới hạn số bài mỗi trang mỗi ngày.
