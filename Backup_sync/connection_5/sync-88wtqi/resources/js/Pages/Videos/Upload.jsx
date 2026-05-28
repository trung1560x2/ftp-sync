import { Head } from '@inertiajs/react';
import GalleryLayout from '@/Layouts/GalleryLayout';
import { VideoUpload } from '@/Components/Videos';

/**
 * Video Upload Page
 * Dedicated page for uploading videos to Shorts
 * Requirements: 1.1 - Dedicated upload interface separate from image upload
 */
export default function Upload({
  auth,
  quotaInfo,
  storageProviders = {},
  availableTags = [],
  captionProvider = 'gemini',
}) {
  return (
    <GalleryLayout title="Tải lên Video">
      <Head title="Tải lên Video" />

      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-2">
              <a
                href="/shorts"
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              >
                <svg
                  className="w-5 h-5 text-gray-600 dark:text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </a>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Tải lên Video</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Chia sẻ video ngắn của bạn với mọi người
                </p>
              </div>
            </div>
          </div>

          {/* Storage Quota Info */}
          {quotaInfo && (
            <div
              className={`mb-6 p-4 rounded-lg ${
                quotaInfo.is_warning
                  ? 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800'
                  : 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`p-2 rounded-full ${
                      quotaInfo.is_warning
                        ? 'bg-yellow-100 dark:bg-yellow-800'
                        : 'bg-blue-100 dark:bg-blue-800'
                    }`}
                  >
                    <svg
                      className={`w-5 h-5 ${
                        quotaInfo.is_warning
                          ? 'text-yellow-600 dark:text-yellow-400'
                          : 'text-blue-600 dark:text-blue-400'
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"
                      />
                    </svg>
                  </div>
                  <div>
                    <p
                      className={`text-sm font-medium ${
                        quotaInfo.is_warning
                          ? 'text-yellow-800 dark:text-yellow-300'
                          : 'text-blue-800 dark:text-blue-300'
                      }`}
                    >
                      Dung lượng lưu trữ
                    </p>
                    <p
                      className={`text-xs ${
                        quotaInfo.is_warning
                          ? 'text-yellow-600 dark:text-yellow-400'
                          : 'text-blue-600 dark:text-blue-400'
                      }`}
                    >
                      {quotaInfo.used_formatted} / {quotaInfo.quota_formatted} (
                      {quotaInfo.percentage}%)
                    </p>
                  </div>
                </div>
                <div className="w-32">
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all ${
                        quotaInfo.percentage >= 90
                          ? 'bg-red-500'
                          : quotaInfo.percentage >= 80
                            ? 'bg-yellow-500'
                            : 'bg-blue-500'
                      }`}
                      style={{ width: `${Math.min(quotaInfo.percentage, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
              {quotaInfo.is_warning && (
                <p className="mt-2 text-xs text-yellow-600 dark:text-yellow-400">
                  ⚠️ Dung lượng lưu trữ sắp đầy. Hãy xóa bớt file hoặc nâng cấp để tiếp tục tải lên.
                </p>
              )}
            </div>
          )}

          {/* Upload Component */}
          <VideoUpload
            storageProviders={storageProviders}
            availableTags={availableTags}
            captionProvider={captionProvider}
            onCancel={() => window.history.back()}
          />

          {/* Tips */}
          <div className="mt-6 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
            <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-2">
              💡 Mẹo tải lên video
            </h3>
            <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
              <li>• Video dọc (9:16) sẽ hiển thị tốt nhất trên Shorts</li>
              <li>• Hỗ trợ định dạng: MP4, WebM, MOV, AVI, MKV</li>
              <li>• Video lớn sẽ được tải lên theo từng phần để đảm bảo ổn định</li>
              <li>• Thêm tiêu đề và mô tả để video dễ tìm kiếm hơn</li>
            </ul>
          </div>
        </div>
      </div>
    </GalleryLayout>
  );
}
