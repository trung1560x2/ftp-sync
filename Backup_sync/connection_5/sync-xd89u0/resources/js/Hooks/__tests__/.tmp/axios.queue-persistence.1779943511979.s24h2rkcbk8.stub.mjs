const axios = {
  async post() {
    throw new Error('axios.post should not be called in queue persistence tests');
  },
  isCancel() {
    return false;
  },
};
export default axios;