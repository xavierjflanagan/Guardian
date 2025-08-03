# MCP Servers for Guardian

This directory will contain custom MCP servers for external data integration:

## Planned MCP Servers

### supabase-logs.js
- Connect to Supabase analytics and logs
- Provide real-time database performance metrics
- Healthcare data processing insights

### render-metrics.js  
- Connect to Render.com infrastructure metrics
- Performance and scaling data
- Infrastructure cost and usage analytics

### healthcare-references.js
- Connect to medical terminology databases
- Drug interaction and allergy databases
- Clinical reference standards

## Implementation Notes

These MCP servers will be implemented as the system matures and external data integration becomes needed. For now, agents can function with their private memory and shared context.

## Testing MCP Integration

Use these commands when MCP servers are implemented:
```bash
claude mcp add guardian-db "npx @modelcontextprotocol/server-postgres $SUPABASE_URL"
claude mcp add supabase-logs "./scripts/mcp-servers/supabase-logs.js"
claude mcp add render-metrics "./scripts/mcp-servers/render-metrics.js"
```