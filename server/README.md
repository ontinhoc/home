# Server ôn thi TNTHPT Tin học

## Chạy server
- Yêu cầu `Node.js 18+`
- Trong thư mục [server](c:\Users\csonline\Documents\home\server):
```bash
npm install
npm start
```
- Server mặc định chạy tại `http://localhost:3000`

## Mật khẩu admin v1
- Đặt qua biến môi trường `ADMIN_PASSWORD`
- Nếu không đặt, server dùng mặc định: `TinHoc2026!`

## Dữ liệu
- Đề thi lưu tại [server/data/exams.json](c:\Users\csonline\Documents\home\server\data\exams.json)
- Lượt làm bài và kết quả lưu tại [server/data/attempts.json](c:\Users\csonline\Documents\home\server\data\attempts.json)

## API chính
- `POST /api/admin/login`
- `GET /api/exams`
- `GET /api/exams/:id`
- `POST /api/exams`
- `PUT /api/exams/:id`
- `DELETE /api/exams/:id`
- `POST /api/exams/:id/publish`
- `POST /api/exams/import`
- `GET /api/exams/:id/export`
- `POST /api/attempts/start`
- `PUT /api/attempts/:id/save`
- `POST /api/attempts/:id/submit`
- `GET /api/results?examId=...`
- `GET /api/results/:attemptId`

## JSON đề thi mẫu
```json
{
  "code": "0502",
  "title": "Đề ôn thi số 2",
  "description": "Mô tả ngắn",
  "status": "draft",
  "questions": [
    {
      "type": "multiple_choice",
      "text": "Nội dung câu hỏi",
      "explanation": "Lời giải ngắn",
      "choices": [
        { "key": "A", "text": "Đáp án A", "correct": false },
        { "key": "B", "text": "Đáp án B", "correct": true },
        { "key": "C", "text": "Đáp án C", "correct": false },
        { "key": "D", "text": "Đáp án D", "correct": false }
      ]
    },
    {
      "type": "true_false_group",
      "text": "Đọc đoạn mô tả rồi chọn đúng/sai",
      "explanation": "Gợi ý hoặc tổng kết",
      "statements": [
        { "key": "a", "text": "Nhận định 1", "answer": true, "explanation": "Giải thích 1" },
        { "key": "b", "text": "Nhận định 2", "answer": false, "explanation": "Giải thích 2" }
      ]
    }
  ]
}
```
