"""Shared Groq model and structured-output configuration."""

import os


DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b"
GROQ_MODEL = os.environ.get("GROQ_MODEL", DEFAULT_GROQ_MODEL).strip() or DEFAULT_GROQ_MODEL


def get_completion_settings() -> dict:
    """Return model-specific options while keeping env-only rollback possible."""
    settings = {"model": GROQ_MODEL}
    if GROQ_MODEL.startswith("openai/gpt-oss-"):
        settings.update({
            "reasoning_effort": "low",
            "include_reasoning": False,
        })
    return settings


def get_json_response_format(name: str, schema: dict) -> dict:
    """Use strict schemas on GPT-OSS and JSON Object mode on fallback models."""
    if not GROQ_MODEL.startswith("openai/gpt-oss-"):
        return {"type": "json_object"}

    return {
        "type": "json_schema",
        "json_schema": {
            "name": name,
            "strict": True,
            "schema": schema,
        },
    }
