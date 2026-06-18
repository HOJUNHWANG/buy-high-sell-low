const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";

export const GROQ_MODEL =
  process.env.GROQ_MODEL?.trim() || DEFAULT_GROQ_MODEL;

const supportsStrictJsonSchema = GROQ_MODEL.startsWith("openai/gpt-oss-");

export function getGroqCompletionSettings() {
  if (supportsStrictJsonSchema) {
    return {
      model: GROQ_MODEL,
      reasoning_effort: "low" as const,
      include_reasoning: false,
    };
  }

  return { model: GROQ_MODEL };
}

export function getGroqJsonResponseFormat(
  name: string,
  schema: Record<string, unknown>
) {
  if (!supportsStrictJsonSchema) {
    return { type: "json_object" as const };
  }

  return {
    type: "json_schema" as const,
    json_schema: {
      name,
      strict: true,
      schema,
    },
  };
}
