"""Patched Azure LLM client to align with BaseOpenAIClient's expected signature.

BaseOpenAIClient._create_structured_completion is invoked with reasoning & verbosity
keywords, but the Azure implementation shipped in graphiti_core lacks these parameters.
Until upstream updates, this shim preserves compatibility.
"""
from typing import Any
from openai import AsyncAzureOpenAI
from pydantic import BaseModel
from graphiti_core.llm_client.azure_openai_client import AzureOpenAILLMClient


class PatchedAzureOpenAILLMClient(AzureOpenAILLMClient):
    class _Shim:
        def __init__(self, output_text: str):
            self.output_text = output_text

    async def _create_structured_completion(  # type: ignore[override]
        self,
        model: str,
        messages: list[Any],
        temperature: float | None,
        max_tokens: int,
        response_model: type[BaseModel],
        reasoning: str | None = None,  # accepted but unused (Azure beta parse currently ignores)
        verbosity: str | None = None,  # accepted but unused
    ):
        resp = await self.client.beta.chat.completions.parse(
            model=model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
            response_format=response_model,  # type: ignore
        )
        # Adapt OpenAI parse response to what BaseOpenAIClient expects: object.output_text -> JSON string
        try:
            parsed = resp.choices[0].message.parsed  # pydantic model
            if hasattr(parsed, "model_dump_json"):
                json_text = parsed.model_dump_json()
            elif hasattr(parsed, "model_dump"):
                import json as _json
                json_text = _json.dumps(parsed.model_dump())  # type: ignore
            else:
                json_text = str(parsed)
            return self._Shim(json_text)
        except Exception:
            # Fallback: attempt to serialize entire response
            import json as _json
            try:
                json_text = _json.dumps(resp.model_dump())  # type: ignore
            except Exception:
                json_text = "{}"
            return self._Shim(json_text)
