/**
 * WeChat iLink protocol types (mirrors proto: GetUpdatesReq/Resp, WeixinMessage, SendMessageReq).
 * API uses JSON over HTTP; bytes fields are base64 strings in JSON.
 *
 * Ported from @tencent-weixin/openclaw-weixin with standalone OMP integration.
 */

// ============================================================================
// Upload media types
// ============================================================================

/** proto: UploadMediaType */
export const UploadMediaType = {
	IMAGE: 1,
	VIDEO: 2,
	FILE: 3,
} as const;

export interface GetUploadUrlReq {
	base_info?: BaseInfo;
	filekey?: string;
	media_type?: number;
	to_user_id?: string;
	rawsize?: number;
	rawfilemd5?: string;
	filesize?: number;
	thumb_rawsize?: number;
	thumb_rawfilemd5?: string;
	thumb_filesize?: number;
}

export interface GetUploadUrlResp {
	ret?: number;
	errcode?: number;
	errmsg?: string;
	upload_param?: string;
	thumb_upload_param?: string;
}

// ============================================================================
// Message types
// ============================================================================

/** proto: MessageType */
export const MessageType = {
	NONE: 0,
	USER: 1,
	BOT: 2,
} as const;

/** proto: MessageItemType */
export const MessageItemType = {
	TEXT: 1,
	IMAGE: 2,
	VIDEO: 3,
	FILE: 4,
	VOICE: 5,
} as const;

/** proto: MessageState */
export const MessageState = {
	NEW: 0,
	GENERATING: 1,
	FINISH: 2,
} as const;

export interface TextItem {
	text?: string;
}

/** CDN media reference; aes_key is base64-encoded bytes in JSON. */
export interface CDNMedia {
	aes_key?: string;
	encrypt_query_param?: string;
	full_url?: string;
	len?: string;
	md5?: string;
}

export interface ImageItem {
	media?: CDNMedia;
	thumb_media?: CDNMedia;
	width?: number;
	height?: number;
}

export interface VoiceItem {
	media?: CDNMedia;
	text?: string;
	duration?: number;
}

export interface FileItem {
	media?: CDNMedia;
	file_name?: string;
	len?: string;
}

export interface VideoItem {
	media?: CDNMedia;
	thumb_media?: CDNMedia;
	video_size?: string;
	duration?: number;
}

export interface RefMessage {
	message_item?: MessageItem;
}

export interface MessageItem {
	type?: number;
	text_item?: TextItem;
	image_item?: ImageItem;
	voice_item?: VoiceItem;
	file_item?: FileItem;
	video_item?: VideoItem;
	ref_msg?: RefMessage;
}

/** Unified message (proto: WeixinMessage) */
export interface WeixinMessage {
	message_id?: string;
	seq?: number;
	from_user_id?: string;
	to_user_id?: string;
	client_id?: string;
	message_type?: number;
	message_state?: number;
	item_list?: MessageItem[];
	create_time_ms?: number;
	context_token?: string;
	session_id?: string;
}

/** GetUpdates request */
export interface GetUpdatesReq {
	base_info?: BaseInfo;
	get_updates_buf?: string;
}

/** GetUpdates response */
export interface GetUpdatesResp {
	ret?: number;
	errcode?: number;
	errmsg?: string;
	msgs?: WeixinMessage[];
	get_updates_buf?: string;
	longpolling_timeout_ms?: number;
}

/** SendMessage request */
export interface SendMessageReq {
	base_info?: BaseInfo;
	msg?: WeixinMessage;
}

export interface SendMessageResp {
	ret?: number;
	errcode?: number;
	errmsg?: string;
}

/** Typing status: 1 = typing, 2 = cancel typing */
export const TypingStatus = {
	TYPING: 1,
	CANCEL: 2,
} as const;

/** SendTyping request */
export interface SendTypingReq {
	base_info?: BaseInfo;
	ilink_user_id?: string;
	typing_ticket?: string;
	status?: number;
}

export interface SendTypingResp {
	ret?: number;
	errcode?: number;
	errmsg?: string;
}

/** GetConfig response */
export interface GetConfigResp {
	ret?: number;
	errcode?: number;
	errmsg?: string;
	typing_ticket?: string;
}

// ============================================================================
// Base types
// ============================================================================

/** Common request metadata attached to every CGI request. */
export interface BaseInfo {
	channel_version?: string;
}

// ============================================================================
// Auth / QR Login types
// ============================================================================

export interface QRCodeResponse {
	qrcode?: string;
	/** URL for the QR code image */
	qrcode_img_content?: string;
}

export interface QRStatusResponse {
	status?: "wait" | "scaned" | "confirmed" | "expired" | "scaned_but_redirect";
	/** Bot token received on confirmation */
	bot_token?: string;
	/** Bot ID received on confirmation */
	ilink_bot_id?: string;
	/** Base URL for subsequent API calls (may differ from default) */
	baseurl?: string;
	/** WeChat user ID of the person who scanned */
	ilink_user_id?: string;
	/** New host to redirect polling to when status is scaned_but_redirect */
	redirect_host?: string;
}
