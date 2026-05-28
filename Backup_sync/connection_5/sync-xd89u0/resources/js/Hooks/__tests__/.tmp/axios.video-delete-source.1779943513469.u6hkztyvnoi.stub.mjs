const axios = {
  async post(...args) {
    globalThis.__VIDEO_UPLOAD_TEST_AXIOS_POSTS__ ??= [];
    globalThis.__VIDEO_UPLOAD_TEST_AXIOS_POSTS__.push(args);
    if (typeof globalThis.__VIDEO_UPLOAD_TEST_AXIOS_POST_HANDLER__ === "function") {
      return globalThis.__VIDEO_UPLOAD_TEST_AXIOS_POST_HANDLER__(...args);
    }
    return { data: { success: true, video: { id: 1 } } };
  },
  isCancel(error) {
    return error?.message === "Upload cancelled";
  },
};
export default axios;