"""Generate distinct, persistent runtime secrets for Docker Compose on first boot."""
from __future__ import annotations

import os
import secrets
from pathlib import Path

OUT = Path(os.environ.get("SECRETS_FILE", "/run/secrets-env/secrets.env"))


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


def _read_existing(path: Path) -> dict[str, str]:
    data: dict[str, str] = {}
    if not path.exists():
        return data
    for line in path.read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            data[k.strip()] = v.strip()
    return data


def _distinct_secret(candidate: str, used: set[str]) -> str:
    val = (candidate or "").strip()
    if len(val) >= 32 and val not in used:
        return val
    while True:
        cand = secrets.token_urlsafe(48)
        if cand not in used:
            return cand


def _write_restricted_env(path: Path, entries: list[tuple[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        os.chmod(path.parent, 0o700)
    except OSError:
        pass
    tmp = path.with_suffix(".tmp")
    content = "".join(f"{k}={v}\n" for k, v in entries)
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(content)
    except Exception:
        if tmp.exists():
            tmp.unlink()
        raise
    os.chmod(tmp, 0o600)
    tmp.replace(path)
    os.chmod(path, 0o600)


def main() -> None:
    frontend_out_raw = (os.environ.get("FRONTEND_SECRETS_FILE") or "").strip()
    frontend_out = Path(frontend_out_raw) if frontend_out_raw else None
    init_ops_jwt = _env_bool("INIT_OPS_JWT_SECRET", False)
    ops_split = _env_bool("OPS_SPLIT_SECRETS", False)

    existing_main = _read_existing(OUT)
    existing_frontend = _read_existing(frontend_out) if frontend_out is not None else {}

    used: set[str] = set()
    session_secret = _distinct_secret(
        os.environ.get("SESSION_SECRET")
        or existing_frontend.get("SESSION_SECRET")
        or existing_main.get("SESSION_SECRET")
        or "",
        used,
    )
    used.add(session_secret)

    attest_api_key = _distinct_secret(
        os.environ.get("ATTEST_API_KEY")
        or existing_main.get("ATTEST_API_KEY")
        or existing_frontend.get("ATTEST_API_KEY")
        or "",
        used,
    )
    used.add(attest_api_key)

    ops_jwt_secret: str | None = None
    if init_ops_jwt:
        ops_jwt_secret = _distinct_secret(
            os.environ.get("OPS_JWT_SECRET") or existing_main.get("OPS_JWT_SECRET") or "",
            used,
        )
        used.add(ops_jwt_secret)

    if ops_split and frontend_out is not None:
        backend_entries: list[tuple[str, str]] = [("ATTEST_API_KEY", attest_api_key)]
        if ops_jwt_secret is not None:
            backend_entries.append(("OPS_JWT_SECRET", ops_jwt_secret))
        _write_restricted_env(OUT, backend_entries)
        _write_restricted_env(
            frontend_out,
            [
                ("SESSION_SECRET", session_secret),
                ("ATTEST_API_KEY", attest_api_key),
            ],
        )
    else:
        entries: list[tuple[str, str]] = [
            ("SESSION_SECRET", session_secret),
            ("ATTEST_API_KEY", attest_api_key),
        ]
        if ops_jwt_secret is not None:
            entries.append(("OPS_JWT_SECRET", ops_jwt_secret))
        _write_restricted_env(OUT, entries)
        if frontend_out is not None:
            _write_restricted_env(
                frontend_out,
                [
                    ("SESSION_SECRET", session_secret),
                    ("ATTEST_API_KEY", attest_api_key),
                ],
            )

    reused = bool(existing_main or existing_frontend)
    print(
        f"Runtime secrets ready at {OUT} "
        f"(ops_jwt={ops_jwt_secret is not None}, split={ops_split}, distinct=True, mode=0600, reused={reused})"
    )


if __name__ == "__main__":
    main()
