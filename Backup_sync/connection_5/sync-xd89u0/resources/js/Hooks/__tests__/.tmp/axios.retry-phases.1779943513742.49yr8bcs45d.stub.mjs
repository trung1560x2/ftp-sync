const axios = {
  async post(...args) {
    globalThis.__UPLOAD_TEST_AXIOS_POSTS__ ??= [];
    globalThis.__UPLOAD_TEST_AXIOS_POSTS__.push(args);
    if (typeof globalThis.__UPLOAD_TEST_AXIOS_POST_HANDLER__ === "function") {
      return globalThis.__UPLOAD_TEST_AXIOS_POST_HANDLER__(...args);
    }
    return { data: { success: true, path: "ok" } };
  },
  isCancel(error) {
    return error?.message === "Upload cancelled";
  },
};
export default axios;