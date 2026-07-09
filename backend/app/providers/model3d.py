"""Model3DProvider — the AI-3D swap seam (spec §3, §5.3).

The task/admin flow only ever talks to this interface. Current implementations:

  MockModel3DProvider   no external service; "generates" the bundled demo GLB
                        after a short delay. Default for dev/demo.
  MeshyModel3DProvider  real image→3D via the Meshy API (MESHY_API_KEY).

Zoustec's official AI-3D engine later ships one more implementation of this
same interface and is selected via MODEL3D_PROVIDER — nothing else changes
(see docs/model3d-integration-seam.md).

Contract notes:
  - submit() is called with a local path to the uploaded source image and must
    return a provider job reference immediately (non-blocking).
  - poll() is called repeatedly until it returns a terminal result. On success
    it returns a URL that the browser can fetch the GLB from — either an
    external (provider-hosted) URL or a platform /media path.
  - Output must target the agreed GLB spec (docs/glb-spec.md): GLB, ≤~50k tris,
    textures ≤2K, Draco where possible. Providers are responsible for
    requesting compliant output; validate() does a cheap sanity check.
"""

import os
from abc import ABC, abstractmethod
from dataclasses import dataclass

import httpx


@dataclass(frozen=True)
class SubmitResult:
    provider_job_id: str


@dataclass(frozen=True)
class PollResult:
    status: str  # "processing" | "succeeded" | "failed"
    glb_url: str | None = None
    error: str | None = None


@dataclass(frozen=True)
class RigPollResult:
    status: str  # "processing" | "succeeded" | "failed"
    walk_glb_url: str | None = None
    run_glb_url: str | None = None
    error: str | None = None


class Model3DProvider(ABC):
    """The seam. One instance per configured engine."""

    name: str
    # Auto-rig + preset animations (walk/run). Engines without it keep the
    # default; the API returns an explicit "unsupported" error to the studio.
    supports_rigging: bool = False
    # Text-prompt re-texturing of a finished model (per-model style edits).
    supports_retexture: bool = False

    @abstractmethod
    async def submit(self, image_path: str, job_id: str, prompt: str = "") -> SubmitResult:
        """Start an image→3D generation. `prompt` is an optional user hint that
        guides texturing/style (engines that don't support it just ignore it).
        Returns the provider's job reference."""

    @abstractmethod
    async def poll(self, provider_job_id: str) -> PollResult:
        """Check job progress. Called until a terminal status is returned."""

    async def submit_rigging(self, input_task_id: str) -> SubmitResult:
        """Start auto-rigging of a previously generated model."""
        raise NotImplementedError

    async def poll_rigging(self, rig_task_id: str) -> RigPollResult:
        """Check rigging progress; terminal result carries animated GLB URLs."""
        raise NotImplementedError

    async def submit_retexture(self, input_task_id: str, prompt: str) -> SubmitResult:
        """Start re-texturing a previously generated model from a text prompt."""
        raise NotImplementedError

    async def poll_retexture(self, retexture_task_id: str) -> PollResult:
        """Check retexture progress; terminal result carries the new GLB URL."""
        raise NotImplementedError


# ---------------------------------------------------------------------------


class MockModel3DProvider(Model3DProvider):
    """Deterministic stand-in engine: after N polls the bundled demo mascot GLB
    "is generated". Keeps the whole pipeline (upload → job → poll → GLB → AR)
    fully working with zero external dependencies or API keys."""

    name = "mock"

    # provider_job_id → number of polls seen (in-memory; fine for a mock).
    _polls: dict[str, int] = {}

    POLLS_UNTIL_DONE = 2
    RESULT_GLB_URL = "/models/mascot.glb"  # served by the frontend origin

    async def submit(self, image_path: str, job_id: str, prompt: str = "") -> SubmitResult:
        provider_job_id = f"mock-{job_id}"
        self._polls[provider_job_id] = 0
        return SubmitResult(provider_job_id=provider_job_id)

    async def poll(self, provider_job_id: str) -> PollResult:
        seen = self._polls.get(provider_job_id, self.POLLS_UNTIL_DONE)
        self._polls[provider_job_id] = seen + 1
        if seen + 1 >= self.POLLS_UNTIL_DONE:
            self._polls.pop(provider_job_id, None)
            # Unique-per-job URL (same file; static serving ignores the query)
            # so the builder can tell WHICH job a task's model came from —
            # otherwise every mock job collapses into the "demo" option.
            suffix = provider_job_id.removeprefix("mock-")[:8]
            return PollResult(
                status="succeeded", glb_url=f"{self.RESULT_GLB_URL}?m={suffix}"
            )
        return PollResult(status="processing")


class MeshyModel3DProvider(Model3DProvider):
    """Meshy Image-to-3D (https://docs.meshy.ai) — real engine.

    Requires MESHY_API_KEY. The source image must be publicly reachable or sent
    as a data URI; we send a data URI so local uploads work without public
    storage. Output: GLB URL hosted by Meshy (time-limited), which we download
    into /media so AR keeps working after the provider URL expires.
    """

    name = "meshy"
    supports_rigging = True
    supports_retexture = True
    BASE = "https://api.meshy.ai/openapi/v1"

    def __init__(self) -> None:
        self.api_key = os.environ.get("MESHY_API_KEY", "")

    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {self.api_key}"}

    async def submit(self, image_path: str, job_id: str, prompt: str = "") -> SubmitResult:
        import base64
        import mimetypes

        mime = mimetypes.guess_type(image_path)[0] or "image/png"
        with open(image_path, "rb") as f:
            data_uri = f"data:{mime};base64,{base64.b64encode(f.read()).decode()}"

        payload = {
            "image_url": data_uri,
            "should_remesh": True,
            # Target the agreed GLB spec (docs/glb-spec.md).
            "target_polycount": 30000,
        }
        if prompt.strip():
            # User style/material hint — guides Meshy's texturing pass.
            payload["texture_prompt"] = prompt.strip()[:600]

        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                f"{self.BASE}/image-to-3d",
                headers=self._headers(),
                json=payload,
            )
        resp.raise_for_status()
        return SubmitResult(provider_job_id=resp.json()["result"])

    async def poll(self, provider_job_id: str) -> PollResult:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(
                f"{self.BASE}/image-to-3d/{provider_job_id}", headers=self._headers()
            )
        if resp.status_code != 200:
            return PollResult(status="failed", error=f"meshy poll {resp.status_code}")
        body = resp.json()
        status = body.get("status")
        if status == "SUCCEEDED":
            glb = (body.get("model_urls") or {}).get("glb")
            if not glb:
                return PollResult(status="failed", error="meshy returned no GLB url")
            # Remote (time-limited) URL — the service downloads it into in-DB
            # media; the container disk is ephemeral, files there don't survive.
            return PollResult(status="succeeded", glb_url=glb)
        if status in ("FAILED", "CANCELED"):
            return PollResult(status="failed", error=body.get("task_error", {}).get("message", status))
        return PollResult(status="processing")

    async def submit_rigging(self, input_task_id: str) -> SubmitResult:
        """Auto-rig a finished image-to-3d task (humanoid, textured models).
        Meshy's rigging task also renders walk/run preset animations."""
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{self.BASE}/rigging",
                headers=self._headers(),
                json={"input_task_id": input_task_id},
            )
        resp.raise_for_status()
        return SubmitResult(provider_job_id=resp.json()["result"])

    async def poll_rigging(self, rig_task_id: str) -> RigPollResult:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(
                f"{self.BASE}/rigging/{rig_task_id}", headers=self._headers()
            )
        if resp.status_code != 200:
            return RigPollResult(status="failed", error=f"meshy rig poll {resp.status_code}")
        body = resp.json()
        status = body.get("status")
        if status == "SUCCEEDED":
            anims = (body.get("result") or {}).get("basic_animations") or {}
            walk, run = anims.get("walking_glb_url"), anims.get("running_glb_url")
            if not walk and not run:
                return RigPollResult(status="failed", error="meshy returned no animation GLB")
            return RigPollResult(status="succeeded", walk_glb_url=walk, run_glb_url=run)
        if status in ("FAILED", "CANCELED"):
            return RigPollResult(
                status="failed",
                error=(body.get("task_error") or {}).get("message") or status,
            )
        return RigPollResult(status="processing")

    async def submit_retexture(self, input_task_id: str, prompt: str) -> SubmitResult:
        """Re-texture a finished model from a text style description."""
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{self.BASE}/retexture",
                headers=self._headers(),
                json={
                    "input_task_id": input_task_id,
                    "text_style_prompt": prompt.strip()[:600],
                },
            )
        resp.raise_for_status()
        return SubmitResult(provider_job_id=resp.json()["result"])

    async def poll_retexture(self, retexture_task_id: str) -> PollResult:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(
                f"{self.BASE}/retexture/{retexture_task_id}", headers=self._headers()
            )
        if resp.status_code != 200:
            return PollResult(status="failed", error=f"meshy retexture poll {resp.status_code}")
        body = resp.json()
        status = body.get("status")
        if status == "SUCCEEDED":
            glb = (body.get("model_urls") or {}).get("glb")
            if not glb:
                return PollResult(status="failed", error="meshy returned no GLB url")
            return PollResult(status="succeeded", glb_url=glb)
        if status in ("FAILED", "CANCELED"):
            return PollResult(
                status="failed",
                error=(body.get("task_error") or {}).get("message") or status,
            )
        return PollResult(status="processing")


# ---------------------------------------------------------------------------

_provider: Model3DProvider | None = None


def get_model3d_provider() -> Model3DProvider:
    """Engine selection — the single place the implementation is chosen."""
    global _provider
    if _provider is None:
        which = os.environ.get("MODEL3D_PROVIDER", "mock").lower()
        if which == "meshy":
            _provider = MeshyModel3DProvider()
        else:
            _provider = MockModel3DProvider()
    return _provider


def reset_model3d_provider() -> None:
    global _provider
    _provider = None
