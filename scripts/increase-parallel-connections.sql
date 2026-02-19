-- Script để tăng parallel_connections cho tất cả FTP connections
-- Chạy script này để tăng tốc độ upload/download

-- Xem config hiện tại
SELECT id, name, parallel_connections, buffer_size 
FROM ftp_connections;

-- Tăng parallel_connections lên 5 (khuyến nghị cho server mạnh)
UPDATE ftp_connections 
SET parallel_connections = 5 
WHERE parallel_connections IS NULL OR parallel_connections < 5;

-- Hoặc tăng lên 10 (maximum, cho server rất mạnh)
-- UPDATE ftp_connections SET parallel_connections = 10;

-- Tăng buffer_size lên 32MB (tùy chọn, cho file lớn)
-- UPDATE ftp_connections SET buffer_size = 32 WHERE buffer_size IS NULL OR buffer_size < 32;

-- Kiểm tra lại
SELECT id, name, parallel_connections, buffer_size 
FROM ftp_connections;
