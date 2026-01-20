import { FtpClientAdapter } from './FtpClientAdapter.js';
import { SftpClientAdapter } from './SftpClientAdapter.js';
export class TransferClientFactory {
    static createClient(protocol, timeout = 30000) {
        if (protocol === 'sftp') {
            return new SftpClientAdapter();
        }
        // Default to FTP/FTPS (BasicFTP handles both via same client, just different connect options)
        return new FtpClientAdapter(timeout);
    }
}
