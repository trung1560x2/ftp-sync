# Node.js FTP Sync Service

Hệ thống đồng bộ hóa FTP tự động, hỗ trợ 2 chiều (Bi-directional), Real-time Watcher và Resume.

## Cài đặt

1.  Cài đặt dependencies:
    ```bash
    npm install
    ```

2.  Cấu hình:
    *   Mở file `.env`
    *   Điền thông tin FTP Host, User, Password.
    *   Cấu hình `LOCAL_ROOT` (thư mục máy tính) và `REMOTE_ROOT` (thư mục trên server).
    *   Chọn `SYNC_MODE`: `bi_directional` (2 chiều), `upload_only` (chỉ đẩy lên), hoặc `download_only`.

## Chạy ứng dụng

### Chạy thủ công (Console)
```bash
node index.js
```
Hoặc dùng script npm:
```bash
npm start
```

### Chạy dưới dạng Service (Background)
Để chạy ứng dụng này liên tục ngay cả khi đóng cửa sổ dòng lệnh, bạn nên dùng **PM2**.

1.  Cài đặt PM2:
    ```bash
    npm install pm2 -g
    ```
2.  Khởi động service:
    ```bash
    pm2 start index.js --name "ftp-sync"
    ```
3.  Xem log:
    ```bash
    pm2 logs ftp-sync
    ```
4.  Dừng service:
    ```bash
    pm2 stop ftp-sync
    ```

## Tính năng chi tiết

*   **Tự động phát hiện thay đổi (Watcher)**: Khi bạn sửa file ở `LOCAL_ROOT`, file sẽ được upload ngay lập tức.
*   **Đồng bộ định kỳ**: Mỗi 60 giây (cấu hình `SYNC_INTERVAL`), hệ thống quét server để tải các file mới về.
*   **Xử lý xung đột**: File nào có thời gian sửa đổi (Modified Time) mới hơn sẽ được ưu tiên.
*   **Resume**: Nếu mất mạng, hệ thống sẽ tự động thử lại ở lần quét tiếp theo.
*   **Logging**:
    *   Log tổng hợp: `logs/combined.log`
    *   Log lỗi: `logs/error.log`

## Cấu trúc dự án
*   `src/config.js`: Quản lý cấu hình.
*   `src/logger.js`: Quản lý ghi log.
*   `src/ftp-service.js`: Các hàm core xử lý FTP.
*   `src/sync-manager.js`: Logic đồng bộ hóa.
