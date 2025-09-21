"""Patched Azure LLM client to align with BaseOpenAIClient's expected signature.

BaseOpenAIClient._create_structured_completion is invoked with reasoning & verbosity
keywords, but the Azure implementation shipped in graphiti_core lacks these parameters.
Until upstream updates, this shim preserves compatibility.
"""
import os
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
        """Invoke Azure structured completion with defensive token limiting & adaptive retry.

        Problems observed during batch Graphiti ingestion:
          * Azure responses hitting 'Output length exceeded max tokens 8192' causing hard failures.

        Mitigations applied here:
          1. Clamp requested max_tokens to GRAPHITI_LLM_MAX_TOKENS (default 4096) to avoid overly large generations.
          2. On 'Output length exceeded max tokens' errors, retry once with a halved token budget (min 512).
        """

        # 1. Clamp via env var override
        try:
            cap = int(os.getenv("GRAPHITI_LLM_MAX_TOKENS", "4096"))
            if cap > 0:
                if max_tokens > cap:
                    max_tokens = cap
        except Exception:
            # Ignore parsing errors; proceed with provided max_tokens
            pass

        async def _call(requested_tokens: int):
            return await self.client.beta.chat.completions.parse(
                model=model,
                messages=messages,
                temperature=temperature,
                max_tokens=requested_tokens,
                response_format=response_model,  # type: ignore
            )

        try:
            resp = await _call(max_tokens)
        except Exception as e:  # noqa: BLE001
            msg = str(e)
            if "Output length exceeded max tokens" in msg and max_tokens > 512:
                # 2. Adaptive single retry with halved token budget (floor 512)
                reduced = max(512, max_tokens // 2)
                try:
                    resp = await _call(reduced)
                except Exception:
                    raise
            else:
                raise

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
