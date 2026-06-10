---
name: providers
description: |
  Show LLM provider status for the Foundation provider registry.
  Lists all configured providers and their health (used by demerzel_analyze).
  Trigger: /foundation:providers
user-invocable: true
---

# Providers

Show the status of the configured LLM providers in Foundation's shared provider
registry (the same registry `demerzel_analyze` routes through).

## Instructions

1. Call `mcp__foundation__provider_list` to get all configured providers and their health.
2. For any provider whose health is unknown or that you want to re-check, call
   `mcp__foundation__provider_test` with the provider name.
3. Present a clear table showing:
   - Provider name
   - Status (healthy/unhealthy/unknown)
4. Highlight any unhealthy providers and suggest `foundation provider add` / `foundation setup`
   if none are configured.
