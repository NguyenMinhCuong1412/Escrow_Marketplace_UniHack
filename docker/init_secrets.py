"""Generate distinct, persistent runtime secrets for Docker Compose on first boot."""
import os
import secrets
from pathlib import Path

OUT = Path(os.environ.get("SECRETS_FILE", "/run/secrets-env/secrets.env"))


def _read_existing(path: Path) -> dict[str, str]:
    data: dict[str, str] = {}
    if not path.exists():
        return data
    for line in path.read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            data[k.strip()] = v.strip()
    return data


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    existing = _read_existing(OUT)

    session_secret = (os.environ.get("SESSION_SECRET") or existing.get("SESSION_SECRET") or "").strip()
    attest_api_key = (os.environ.get("ATTEST_API_KEY") or existing.get("ATTEST_API_KEY") or "").strip()

    if len(session_secret) < 32:
        session_secret = secrets.token_urlsafe(48)
    if len(attest_api_key) < 32 or attest_api_key == session_secret:
        while True:
            cand = secrets.token_urlsafe(48)
            if cand != session_secret:
                attest_api_key = cand
                break

    tmp = OUT.with_suffix(".tmp")
    tmp.write_text(f"SESSION_SECRET={session_secret}\nATTEST_API_KEY={attest_api_key}\n", encoding="utf-8")
    os.chmod(tmp, 0o644)
    tmp.replace(OUT)
    print(f"Runtime secrets ready at {OUT} (distinct=True, reused={bool(existing)})")


if __name__ == "__main__":
    main()
