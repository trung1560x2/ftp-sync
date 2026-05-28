export function usePage() {
  return { props: { settings: { video_upload_chunk_size: 0.001, video_upload_concurrent_chunks: 1 } } };
}