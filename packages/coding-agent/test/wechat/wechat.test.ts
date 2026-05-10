/**
 * Tests for WeChat integration — markdown filter, context token store, API helpers.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { extractTextBody } from "../../src/wechat/bot";
import { clearContextTokensForAccount, getContextToken, setContextToken } from "../../src/wechat/context-token-store";
import { filterMarkdown, StreamingMarkdownFilter } from "../../src/wechat/markdown-filter";
import { MessageItemType, TypingStatus } from "../../src/wechat/types";

// ============================================================================
// Markdown filter tests
// ============================================================================

describe("StreamingMarkdownFilter", () => {
	test("passes plain text through unchanged", () => {
		expect(filterMarkdown("hello world")).toBe("hello world");
	});

	test("strips bold-italic markers", () => {
		// Note: ** (double star) is NOT stripped — only *** (triple star) is.
		// The filter holds back ** because it might become ***.
		expect(filterMarkdown("***bold italic***")).toBe("bold italic");
		expect(filterMarkdown("**bold**")).toBe("**bold**");
	});

	test("strips italic markers", () => {
		expect(filterMarkdown("*italic*")).toBe("italic");
	});

	test("strips strikethrough markers", () => {
		expect(filterMarkdown("~~strike~~")).toBe("strike");
	});

	test("strips inline code backticks", () => {
		expect(filterMarkdown("`code`")).toBe("code");
	});

	test("strips code fences but preserves content", () => {
		const input = "before\n```\ncode line\n```\nafter";
		const result = filterMarkdown(input);
		expect(result).toContain("code line");
		expect(result).not.toContain("```");
	});

	test("strips image syntax", () => {
		expect(filterMarkdown("![alt text](url)")).toBe("");
	});

	test("strips heading markers", () => {
		// H5/H6 are stripped by the filter
		expect(filterMarkdown("##### heading5")).toBe("heading5");
		expect(filterMarkdown("###### heading6")).toBe("heading6");
	});

	test("strips blockquote markers", () => {
		expect(filterMarkdown("> quoted text")).toBe("quoted text");
	});

	test("handles mixed content", () => {
		const input = "***bold italic*** and *italic* and `code`";
		const result = filterMarkdown(input);
		expect(result).toBe("bold italic and italic and code");
	});

	test("streaming feed produces same result as batch", () => {
		const input = "Hello **world** this is `code` and ~~strike~~ text";
		const batch = filterMarkdown(input);

		const filter = new StreamingMarkdownFilter();
		let streaming = "";
		for (const char of input) {
			streaming += filter.feed(char);
		}
		streaming += filter.flush();

		expect(streaming).toBe(batch);
	});

	test("handles empty string", () => {
		expect(filterMarkdown("")).toBe("");
	});

	test("preserves newlines", () => {
		expect(filterMarkdown("line1\nline2")).toBe("line1\nline2");
	});
});

// ============================================================================
// Context token store tests
// ============================================================================

describe("context token store", () => {
	const testAccountId = `test-account-${Date.now()}`;

	afterEach(async () => {
		await clearContextTokensForAccount(testAccountId);
	});

	test("set and get context token", () => {
		setContextToken(testAccountId, "user1", "token-abc");
		expect(getContextToken(testAccountId, "user1")).toBe("token-abc");
	});

	test("returns undefined for missing token", () => {
		expect(getContextToken(testAccountId, "nonexistent")).toBeUndefined();
	});

	test("overwrites existing token", () => {
		setContextToken(testAccountId, "user1", "token-1");
		setContextToken(testAccountId, "user1", "token-2");
		expect(getContextToken(testAccountId, "user1")).toBe("token-2");
	});

	test("clear removes all tokens for account", async () => {
		setContextToken(testAccountId, "user1", "token-1");
		setContextToken(testAccountId, "user2", "token-2");
		await clearContextTokensForAccount(testAccountId);
		expect(getContextToken(testAccountId, "user1")).toBeUndefined();
		expect(getContextToken(testAccountId, "user2")).toBeUndefined();
	});

	test("different accounts are independent", () => {
		const otherAccount = `other-${Date.now()}`;
		setContextToken(testAccountId, "user1", "token-a");
		setContextToken(otherAccount, "user1", "token-b");
		expect(getContextToken(testAccountId, "user1")).toBe("token-a");
		expect(getContextToken(otherAccount, "user1")).toBe("token-b");
	});
});

// ============================================================================
// Message extraction tests
// ============================================================================

describe("extractTextBody", () => {
	test("extracts text from text item", () => {
		const result = extractTextBody([{ type: MessageItemType.TEXT, text_item: { text: "Hello" } }]);
		expect(result).toBe("Hello");
	});

	test("returns empty string for no items", () => {
		expect(extractTextBody()).toBe("");
		expect(extractTextBody([])).toBe("");
	});

	test("skips non-text items", () => {
		const result = extractTextBody([{ type: MessageItemType.IMAGE, image_item: {} }]);
		expect(result).toBe("");
	});

	test("returns first text item", () => {
		const result = extractTextBody([
			{ type: MessageItemType.IMAGE, image_item: {} },
			{ type: MessageItemType.TEXT, text_item: { text: "Found it" } },
		]);
		expect(result).toBe("Found it");
	});
});

// ============================================================================
// Type constants tests
// ============================================================================

describe("WeChat type constants", () => {
	test("MessageItemType values", () => {
		expect(MessageItemType.TEXT).toBe(1);
		expect(MessageItemType.IMAGE).toBe(2);
		expect(MessageItemType.VIDEO).toBe(3);
		expect(MessageItemType.FILE).toBe(4);
		expect(MessageItemType.VOICE).toBe(5);
	});

	test("TypingStatus values", () => {
		expect(TypingStatus.TYPING).toBe(1);
		expect(TypingStatus.CANCEL).toBe(2);
	});
});
