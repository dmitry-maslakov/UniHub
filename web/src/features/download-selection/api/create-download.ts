import { api } from '@/shared/api';

// asks the hub for a zip of the items; it answers with where to fetch it
export const useCreateDownload = () =>
  api.useMutation('post', '/api/downloads');
