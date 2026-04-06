import { normalizeChatType } from "../../channels/chat-type.js";
import { getChannelPlugin, normalizeChannelId } from "../../channels/plugins/index.js";
import { resolveSenderLabel } from "../../channels/sender-label.js";
import type { EnvelopeFormatOptions } from "../envelope.js";
import { formatEnvelopeTimestamp } from "../envelope.js";
import type { TemplateContext } from "../templating.js";

function safeTrim(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function formatConversationTimestamp(
  value: unknown,
  envelope?: EnvelopeFormatOptions,
): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  return formatEnvelopeTimestamp(value, envelope);
}

function resolveInboundChannel(ctx: TemplateContext): string | undefined {
  let channelValue = safeTrim(ctx.OriginatingChannel) ?? safeTrim(ctx.Surface);
  if (!channelValue) {
    const provider = safeTrim(ctx.Provider);
    if (provider !== "webchat" && ctx.Surface !== "webchat") {
      channelValue = provider;
    }
  }
  return channelValue;
}

function resolveInboundFormattingHints(ctx: TemplateContext):
  | {
      text_markup: string;
      rules: string[];
    }
  | undefined {
  const channelValue = resolveInboundChannel(ctx);
  if (!channelValue) {
    return undefined;
  }
  const normalizedChannel = normalizeChannelId(channelValue) ?? channelValue;
  return getChannelPlugin(normalizedChannel)?.agentPrompt?.inboundFormattingHints?.({
    accountId: safeTrim(ctx.AccountId) ?? undefined,
  });
}

// RouteClaw: builds the trusted metadata block as a compact user-context snippet
// instead of injecting it into the system prompt. This keeps the system prompt
// static across turns so providers can cache it, saving tokens on every request.
function buildInboundMetaTrustedBlock(ctx: TemplateContext): string {
  const chatType = normalizeChatType(ctx.ChatType);
  const isDirect = !chatType || chatType === "direct";
  const channelValue = resolveInboundChannel(ctx);

  const payload = {
    schema: "openclaw.inbound_meta.v1",
    chat_id: safeTrim(ctx.OriginatingTo),
    account_id: safeTrim(ctx.AccountId),
    channel: channelValue,
    provider: safeTrim(ctx.Provider),
    surface: safeTrim(ctx.Surface),
    chat_type: chatType ?? (isDirect ? "direct" : undefined),
    response_format: resolveInboundFormattingHints(ctx),
  };

  return ["Inbound context (trusted metadata):", "```json", JSON.stringify(payload, null, 2), "```"].join("\n");
}

export function buildInboundMetaSystemPrompt(_ctx: TemplateContext): string {
  // RouteClaw: metadata moved to buildInboundUserContextPrefix for prompt caching.
  // Keeping system prompt static across turns allows providers to cache the prefix.
  return "";
}

export function buildInboundUserContextPrefix(
  ctx: TemplateContext,
  envelope?: EnvelopeFormatOptions,
): string {
  const blocks: string[] = [];

  // RouteClaw: inject trusted metadata here (moved from system prompt for caching)
  const trustedMeta = buildInboundMetaTrustedBlock(ctx);
  if (trustedMeta) {
    blocks.push(trustedMeta);
  }
  const chatType = normalizeChatType(ctx.ChatType);
  const isDirect = !chatType || chatType === "direct";
  const directChannelValue = resolveInboundChannel(ctx);
  const includeDirectConversationInfo = Boolean(
    directChannelValue && directChannelValue !== "webchat",
  );
  const shouldIncludeConversationInfo = !isDirect || includeDirectConversationInfo;

  const messageId = safeTrim(ctx.MessageSid);
  const messageIdFull = safeTrim(ctx.MessageSidFull);
  const resolvedMessageId = messageId ?? messageIdFull;
  const timestampStr = formatConversationTimestamp(ctx.Timestamp, envelope);

  const conversationInfo = {
    message_id: shouldIncludeConversationInfo ? resolvedMessageId : undefined,
    reply_to_id: shouldIncludeConversationInfo ? safeTrim(ctx.ReplyToId) : undefined,
    sender_id: shouldIncludeConversationInfo ? safeTrim(ctx.SenderId) : undefined,
    conversation_label: isDirect ? undefined : safeTrim(ctx.ConversationLabel),
    sender: shouldIncludeConversationInfo
      ? (safeTrim(ctx.SenderName) ??
        safeTrim(ctx.SenderE164) ??
        safeTrim(ctx.SenderId) ??
        safeTrim(ctx.SenderUsername))
      : undefined,
    timestamp: timestampStr,
    group_subject: safeTrim(ctx.GroupSubject),
    group_channel: safeTrim(ctx.GroupChannel),
    group_space: safeTrim(ctx.GroupSpace),
    thread_label: safeTrim(ctx.ThreadLabel),
    topic_id: ctx.MessageThreadId != null ? String(ctx.MessageThreadId) : undefined,
    is_forum: ctx.IsForum === true ? true : undefined,
    is_group_chat: !isDirect ? true : undefined,
    was_mentioned: ctx.WasMentioned === true ? true : undefined,
    has_reply_context: ctx.ReplyToBody ? true : undefined,
    has_forwarded_context: ctx.ForwardedFrom ? true : undefined,
    has_thread_starter: safeTrim(ctx.ThreadStarterBody) ? true : undefined,
    history_count:
      Array.isArray(ctx.InboundHistory) && ctx.InboundHistory.length > 0
        ? ctx.InboundHistory.length
        : undefined,
  };
  if (Object.values(conversationInfo).some((v) => v !== undefined)) {
    blocks.push(
      [
        "Conversation info (untrusted metadata):",
        "```json",
        JSON.stringify(conversationInfo, null, 2),
        "```",
      ].join("\n"),
    );
  }

  const senderInfo = {
    label: resolveSenderLabel({
      name: safeTrim(ctx.SenderName),
      username: safeTrim(ctx.SenderUsername),
      tag: safeTrim(ctx.SenderTag),
      e164: safeTrim(ctx.SenderE164),
      id: safeTrim(ctx.SenderId),
    }),
    id: safeTrim(ctx.SenderId),
    name: safeTrim(ctx.SenderName),
    username: safeTrim(ctx.SenderUsername),
    tag: safeTrim(ctx.SenderTag),
    e164: safeTrim(ctx.SenderE164),
  };
  if (senderInfo?.label) {
    blocks.push(
      ["Sender (untrusted metadata):", "```json", JSON.stringify(senderInfo, null, 2), "```"].join(
        "\n",
      ),
    );
  }

  if (safeTrim(ctx.ThreadStarterBody)) {
    blocks.push(
      [
        "Thread starter (untrusted, for context):",
        "```json",
        JSON.stringify({ body: ctx.ThreadStarterBody }, null, 2),
        "```",
      ].join("\n"),
    );
  }

  if (ctx.ReplyToBody) {
    blocks.push(
      [
        "Replied message (untrusted, for context):",
        "```json",
        JSON.stringify(
          {
            sender_label: safeTrim(ctx.ReplyToSender),
            is_quote: ctx.ReplyToIsQuote === true ? true : undefined,
            body: ctx.ReplyToBody,
          },
          null,
          2,
        ),
        "```",
      ].join("\n"),
    );
  }

  if (ctx.ForwardedFrom) {
    blocks.push(
      [
        "Forwarded message context (untrusted metadata):",
        "```json",
        JSON.stringify(
          {
            from: safeTrim(ctx.ForwardedFrom),
            type: safeTrim(ctx.ForwardedFromType),
            username: safeTrim(ctx.ForwardedFromUsername),
            title: safeTrim(ctx.ForwardedFromTitle),
            signature: safeTrim(ctx.ForwardedFromSignature),
            chat_type: safeTrim(ctx.ForwardedFromChatType),
            date_ms: typeof ctx.ForwardedDate === "number" ? ctx.ForwardedDate : undefined,
          },
          null,
          2,
        ),
        "```",
      ].join("\n"),
    );
  }

  if (Array.isArray(ctx.InboundHistory) && ctx.InboundHistory.length > 0) {
    blocks.push(
      [
        "Chat history since last reply (untrusted, for context):",
        "```json",
        JSON.stringify(
          ctx.InboundHistory.map((entry) => ({
            sender: entry.sender,
            timestamp_ms: entry.timestamp,
            body: entry.body,
          })),
          null,
          2,
        ),
        "```",
      ].join("\n"),
    );
  }

  return blocks.filter(Boolean).join("\n\n");
}
