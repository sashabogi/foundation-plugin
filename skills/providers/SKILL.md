---
name: providers
description: |
  Show LLM provider status and routing configuration.
  Lists all configured Seldon providers, their health, and routing rules.
  Trigger: /foundation:providers
user-invocable: true
---

# Providers

Show LLM provider status and routing configuration.

## Instructions

1. Call `mcp__foundation__seldon_providers_list` to get all configured providers.
2. Call `mcp__foundation__seldon_providers_test` to check their health status.
3. Present a clear table showing:
   - Provider name
   - Status (healthy/unhealthy/unknown)
   - Configured roles (coder, critic, reviewer, designer)
   - Current routing rules
4. Highlight any unhealthy providers or misconfigured routes.
