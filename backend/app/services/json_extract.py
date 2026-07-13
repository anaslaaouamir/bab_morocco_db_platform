import json
import logging
import re

logger = logging.getLogger(__name__)


def extract_json(raw: str) -> dict | list:
    """Extract and parse JSON from a Claude response that may contain markdown fences or surrounding text."""
    text = raw.strip()

    # Strip markdown code fences (```json ... ``` or ``` ... ```)
    text = re.sub(r"^```(?:json)?\s*\n?", "", text)
    text = re.sub(r"\n?```\s*$", "", text)
    text = text.strip()

    # Find the outermost JSON structure
    for open_char, close_char in [("{", "}"), ("[", "]")]:
        start = text.find(open_char)
        if start == -1:
            continue
        end = text.rfind(close_char)
        if end == -1 or end <= start:
            continue
        candidate = text[start : end + 1]
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            continue

    # Last resort: try the whole string
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        logger.error("extract_json failed | raw=%.500s", raw)
        raise ValueError(f"Could not extract valid JSON from Claude response: {exc}") from exc
