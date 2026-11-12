# dz-sandbox Python Client

Minimal Python test helper for [dz-sandbox](../../README.md).

```bash
pip install ./packages/python-client
```

```python
from dz_sandbox import SandboxClient

sandbox = SandboxClient()
sandbox.reset()
sandbox.scenario("chargily", "duplicate_webhook")
hooks = sandbox.wait_for_webhook(provider="chargily", count=2, timeout_ms=5000)
```
