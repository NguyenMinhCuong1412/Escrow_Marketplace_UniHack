---
trigger: model_decision
description: "Use for security reviews or changes involving authentication, authorization, user data, secrets, external inputs, transactions, or deployment."
---

# Security Rules

- Apply least privilege, deny-by-default for sensitive operations, and explicit role checks.
- Never read or print secret values; never commit `.env`, private keys, seed phrases, tokens or credentials.
- Keep untrusted input validated and encoded; protect against injection, SSRF and unsafe deserialization where relevant.
- Review authentication, session management, authorization, data protection, logging, API exposure and configuration against OWASP ASVS 5.0.
- Use OWASP Top 10:2025 as web risk awareness and OWASP Smart Contract Top 10:2025 for applicable contract threats.
- Do not use real funds/mainnet in dev/demo. Testnet keys are still secrets and must be protected.
- Never let AI output directly trigger a transfer, release, refund or contract privileged action.
- Security findings require severity, evidence, impact, preconditions and remediation. Do not claim audit certification.
