import "server-only";

import type Anthropic from "@anthropic-ai/sdk";

import { isBizraportConfigured } from "@/lib/bizraport/client";
import { getErpSchemaText } from "@/lib/erp-schema/store";
import { isGooglePlacesConfigured } from "@/lib/google-places/client";

import { expandSchemaPlaceholder } from "./prompt-cache-core";
import { getPrompts } from "./prompt-store";

/**
 * The prompt *texts* now live in `chatbot.system_prompts` and are edited from
 * the admin panel (`prompt-store.ts` caches them, with the shipped wording in
 * `prompt-defaults.ts` as the fallback). This module only assembles them into
 * the block layout Anthropic's prompt cache expects.
 *
 * Moving the text to the DB does not weaken caching: the cache is a prefix match
 * on exact bytes, and a stored prompt is just as byte-stable between requests as
 * a hardcoded one. Only an actual edit invalidates it — costing one cache write
 * (1.25x input) on the next call, then cache reads (0.1x) as before.
 */
export async function buildSystemPrompt(
  webSearchEnabled: boolean,
): Promise<Anthropic.TextBlockParam[]> {
  const [prompts, erpSchema] = await Promise.all([
    getPrompts(),
    getErpSchemaText(),
  ]);

  // Static (config-level, not per-session) blocks first: the ERP prompt plus the
  // BizRaport/Google instructions when those integrations are configured. Tools
  // render before `system`, so a single cache breakpoint on the LAST static block
  // caches tools + all of these together — cache-read ($0.30/1M) instead of full
  // input ($3/1M) on every call. The per-session web-search block is appended AFTER
  // the breakpoint so toggling it never invalidates the cached prefix.
  const blocks: Anthropic.TextBlockParam[] = [
    {
      type: "text",
      text: expandSchemaPlaceholder(prompts.chat_system, erpSchema),
    },
  ];
  if (isBizraportConfigured()) {
    blocks.push({ type: "text", text: prompts.chat_bizraport });
  }
  if (isGooglePlacesConfigured()) {
    blocks.push({ type: "text", text: prompts.chat_google_rating });
  }
  blocks[blocks.length - 1].cache_control = { type: "ephemeral" };
  if (webSearchEnabled) {
    blocks.push({ type: "text", text: prompts.chat_web_search });
  }
  return blocks;
}

/**
 * System prompt for `row_from_table` quick actions: the row data is already
 * fetched deterministically and handed to the model, so there are NO tools and NO
 * SQL — the model only turns the provided data into a Polish answer.
 */
export async function buildDataAnswerSystemPrompt(): Promise<
  Anthropic.TextBlockParam[]
> {
  const prompts = await getPrompts();
  return [
    {
      type: "text",
      text: prompts.data_answer,
      cache_control: { type: "ephemeral" },
    },
  ];
}
