#!/bin/bash

# Guardian Claude Code Agent System Test Script
# Tests that all agents and commands are properly configured

echo "🏥 Guardian Claude Code Agent System Test"
echo "========================================"

# Test directory structure
echo "📁 Testing directory structure..."
required_dirs=(
    ".claude/agents"
    ".claude/memory/sergei"
    ".claude/memory/tessa"
    ".claude/memory/prue"
    ".claude/memory/quinn"
    ".claude/memory/cleo"
    ".claude/memory/ana"
    ".claude/memory/groot"
    ".claude/memory/shared"
    ".claude/commands/infra"
    ".claude/commands/ai"
    ".claude/commands/ui"
    ".claude/commands/test"
    ".claude/commands/health"
    ".claude/commands/analytics"
    ".claude/commands/growth"
    ".claude/scripts"
)

for dir in "${required_dirs[@]}"; do
    if [ -d "$dir" ]; then
        echo "✅ $dir exists"
    else
        echo "❌ $dir missing"
    fi
done

# Test agent files
echo ""
echo "🤖 Testing agent files..."
agents=(
    "infrastructure-sergei.md"
    "ai-processing-tessa.md"
    "frontend-prue.md"
    "quality-quinn.md"
    "healthcare-data-cleo.md"
    "analytics-ana.md"
    "growth-groot.md"
)

for agent in "${agents[@]}"; do
    if [ -f ".claude/agents/$agent" ]; then
        echo "✅ $agent exists"
    else
        echo "❌ $agent missing"
    fi
done

# Test slash commands
echo ""
echo "⚡ Testing slash commands..."
commands=(
    "infra/deploy.md"
    "infra/migrate.md"
    "ai/process.md"
    "ai/optimize.md"
    "ui/component.md"
    "test/medical.md"
    "health/fhir.md"
    "analytics/metrics.md"
    "growth/experiment.md"
)

for cmd in "${commands[@]}"; do
    if [ -f ".claude/commands/$cmd" ]; then
        echo "✅ $cmd exists"
    else
        echo "❌ $cmd missing"
    fi
done

# Test configuration files
echo ""
echo "⚙️  Testing configuration files..."
config_files=(
    ".claude/README.md"
    ".claude/ARCHITECTURE.md"
    ".claude/hooks.json"
)

for config in "${config_files[@]}"; do
    if [ -f "$config" ]; then
        echo "✅ $config exists"
    else
        echo "❌ $config missing"
    fi
done

# Test memory initialization
echo ""
echo "🧠 Testing memory initialization..."
memory_files=(
    ".claude/memory/sergei/infrastructure-knowledge.md"
    ".claude/memory/tessa/ai-processing-insights.md"
    ".claude/memory/prue/ui-patterns.md"
    ".claude/memory/quinn/quality-strategies.md"
    ".claude/memory/cleo/healthcare-standards.md"
    ".claude/memory/ana/analytics-insights.md"
    ".claude/memory/groot/growth-strategies.md"
    ".claude/memory/shared/project-decisions.md"
)

for memory in "${memory_files[@]}"; do
    if [ -f "$memory" ]; then
        echo "✅ $memory exists"
    else
        echo "❌ $memory missing"
    fi
done

echo ""
echo "🎯 System Test Complete!"
echo ""
echo "To test the agent system:"
echo "1. Try: 'Sergei, help me with database optimization'"
echo "2. Try: '/infra:deploy --help'"
echo "3. Try: 'Tessa, process this medical document'"
echo "4. Try: '/ai:optimize processing costs'"
echo ""
echo "The agents should automatically delegate based on keywords and context!"