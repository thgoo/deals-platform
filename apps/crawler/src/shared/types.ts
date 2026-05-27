export interface DealPayload {
  message_id: number;
  chat: string;
  chat_id: string;
  ts: string;
  text: string;
  links: string[];
  media?: MediaInfo;
}

export interface MediaInfo {
  type: 'photo' | 'document' | 'webpage' | 'unknown';
  photo_id?: string;
  document_id?: string;
  mime_type?: string;
  file_name?: string;
  webpage_url?: string;
  webpage_title?: string;
  webpage_description?: string;
  local_path?: string;
}
