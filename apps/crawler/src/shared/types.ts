export interface DealPayload {
  message_id: number;
  chat: string;
  chat_id: string;
  ts: string;
  text: string;
  links: string[];
  price?: number;
  coupons?: string[];
  store?: string;
  description?: string;
  product?: string;
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
}

export interface ExtractionResult {
  price: number | null;
  coupons: string[];
  product: string | null;
  store: string | null;
  description: string | null;
}
