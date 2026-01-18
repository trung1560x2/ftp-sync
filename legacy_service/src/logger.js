const winston = require('winston');
const path = require('path');
const fs = require('fs-extra');

const logDir = 'logs';
fs.ensureDirSync(logDir);

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss'
        }),
        winston.format.errors({ stack: true }),
        winston.format.splat(),
        winston.format.json()
    ),
    defaultMeta: { service: 'ftp-sync-service' },
    transports: [
        // Ghi tất cả log ra file combined.log
        new winston.transports.File({ filename: path.join(logDir, 'combined.log') }),
        // Ghi log lỗi ra file error.log
        new winston.transports.File({ filename: path.join(logDir, 'error.log'), level: 'error' }),
    ],
});

// Nếu không phải production, ghi log ra console với format dễ đọc
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize(),
            winston.format.printf(({ level, message, timestamp }) => {
                return `${timestamp} [${level}]: ${message}`;
            })
        ),
    }));
}

module.exports = logger;
