import { Router, Request, Response } from 'express';

const router = Router();

interface DiffItem {
  name: string;
  localName: string | null;
  isDirectory: boolean;
  status: 'synchronized' | 'newer_local' | 'newer_remote' | 'missing_local' | 'missing_remote' | 'different_size';
  local: { size: number; modifiedAt: string } | null;
  remote: { size: number; modifiedAt: string } | null;
  containsChanges?: boolean;
}

const formatSize = (bytes: number | undefined | null) => {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

router.post('/explain-diff', async (req: Request, res: Response) => {
  const { connectionId, diffs, customApiKey, model } = req.body as { connectionId: number; diffs: DiffItem[]; customApiKey?: string; model?: string };

  const selectedModel = model || 'gemini-1.5-flash';
  const apiKey = customApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    return res.status(400).json({
      success: false,
      error: 'GEMINI_API_KEY_MISSING',
      message: 'Google Gemini API Key chưa được cấu hình. Vui lòng bật Copilot và điền API Key vào phần Settings trong giao diện AI Copilot.'
    });
  }

  if (!diffs || diffs.length === 0) {
    return res.json({
      success: true,
      explanation: 'KHÔNG PHÁT HIỆN SỰ THAY ĐỔI NÀO GIỮA THƯ MỤC CỤC BỘ VÀ MÁY CHỦ REMOTE. HAI THƯ MỤC ĐANG TRẠNG THÁI ĐỒNG BỘ HOÀN TOÀN.'
    });
  }

  // Filter out synchronized items to focus LLM only on actual changes
  const changedItems = diffs.filter(item => item.status !== 'synchronized' || item.containsChanges);
  
  if (changedItems.length === 0) {
    return res.json({
      success: true,
      explanation: 'TẤT CẢ CÁC FILE ĐỀU ĐANG TRONG TRẠNG THÁI ĐỒNG BỘ (SYNCHRONIZED).'
    });
  }

  // Prepare diff summary for prompt
  const diffSummary = changedItems.map((item, idx) => {
    const typeStr = item.isDirectory ? 'Thư mục' : 'File';
    let statusDesc = '';
    switch (item.status) {
      case 'newer_local':
        statusDesc = 'Mới hơn ở Local (cần upload)';
        break;
      case 'newer_remote':
        statusDesc = 'Mới hơn ở Remote (cần download)';
        break;
      case 'missing_local':
        statusDesc = 'Thiếu ở Local (cần download)';
        break;
      case 'missing_remote':
        statusDesc = 'Thiếu ở Remote (cần upload)';
        break;
      case 'different_size':
        statusDesc = 'Khác biệt kích thước';
        break;
      default:
        statusDesc = 'Có thay đổi ở thư mục con';
    }

    const localSize = item.local ? formatSize(item.local.size) : 'N/A';
    const remoteSize = item.remote ? formatSize(item.remote.size) : 'N/A';

    return `${idx + 1}. ${typeStr}: "${item.name}"
   - Trạng thái: ${statusDesc}
   - Kích thước: Local (${localSize}) vs Remote (${remoteSize})`;
  }).join('\n');

  const prompt = `Dưới đây là danh sách các thay đổi được quét giữa thư mục cục bộ (Local) và thư mục máy chủ FTP/SFTP (Remote) của dự án.
Hãy đóng vai trò là một AI Copilot hỗ trợ DevOps / lập trình viên, viết một bản tóm tắt và giải thích bằng tiếng Việt thật dễ hiểu, ngắn gọn và có cấu trúc rõ ràng về các thay đổi này để họ hiểu nhanh họ sắp đồng bộ cái gì.

Quy tắc giải thích:
1. Viết hoa toàn bộ nội dung giải thích (UPPERCASE) để phù hợp với giao diện bảng điều khiển kỹ thuật HUD/Terminal màu tối của ứng dụng.
2. Tóm tắt số lượng file mới, file cần cập nhật, file bị thiếu ở mỗi bên.
3. Nhóm các thay đổi theo loại hoặc thư mục chính nếu có thể (ví dụ: các file mã nguồn, file tài liệu, asset hình ảnh, etc.) để dễ quét mắt.
4. Đưa ra lời khuyên hành động cụ thể (ví dụ: nên thực hiện upload các file cục bộ mới lên, hay download các file từ remote về để tránh mất mát dữ liệu).
5. Giữ độ dài ngắn gọn, không giải thích dài dòng, tập trung vào giá trị thực tế của các file thay đổi.

Danh sách thay đổi cụ thể:
${diffSummary}

BẢN GIẢI THÍCH (UPPERCASE):`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 1024,
          }
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Google API returned ${response.status}: ${errText}`);
    }

    const data = await response.json() as any;
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    if (!text) {
      throw new Error('Không nhận được phản hồi text từ Gemini API.');
    }

    res.json({
      success: true,
      explanation: text.trim()
    });
  } catch (error: any) {
    console.error('Gemini API call failed:', error);
    res.status(500).json({
      success: false,
      error: 'GEMINI_API_ERROR',
      message: `Lỗi kết nối với Google Gemini API: ${error.message}`
    });
  }
});

export default router;
