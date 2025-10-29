Chạy server kiểm tra đáp án (server‑side)

1) Cài đặt và chạy
- Yêu cầu Node.js 18+
- Tại thư mục `server/` chạy:
  - `npm install`
  - `npm start`
- Server lắng nghe tại `http://localhost:3000` và bật CORS.

2) Dữ liệu câu hỏi
- Mặc định đọc từ `server/data/quiz.json` (có đáp án) — bản mẫu đã kèm 1 MC + 1 Đ/S.
- Để dùng bộ 120 câu, thay nội dung file này bằng JSON đầy đủ (giữ các trường `correct` cho MC và `answer` cho Đ/S).

3) API
- GET `/api/quiz`: trả về bộ câu hỏi đã loại bỏ đáp án (client dùng để render).
- POST `/api/check`:
  - MC: `{ type:"mc", id:number, key:string }` → `{ correct:boolean, correctKey?:string, explain?:string }`
  - TF: `{ type:"tf", id:number, statementKey:string, value:boolean }` → `{ correct:boolean, explain?:string }`

4) Frontend
- File `tin-12-on-tap-gk1.html` đã được chỉnh để:
  - Lấy câu hỏi qua `GET /api/quiz` khi khởi động.
  - Gửi bài chọn qua `POST /api/check` để chấm và chỉ highlight đáp án đúng từ kết quả server.

