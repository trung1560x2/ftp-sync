const axios = {
  async post(...args) {
    globalThis.__UPLOAD_TEST_AXIOS_POSTS__ ??= [];
    if (args[0] !== "/upload/check-duplicates") {
      globalThis.__UPLOAD_TEST_AXIOS_POSTS__.push(args);
    }
    if (typeof globalThis.__UPLOAD_TEST_AXIOS_POST_HANDLER__ === "function") {
      return globalThis.__UPLOAD_TEST_AXIOS_POST_HANDLER__(...args);
    }
    return { data: { success: true } };
  },
  isCancel() {
    return false;
  },
};
export default axios;