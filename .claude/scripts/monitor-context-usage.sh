#!/bin/bash

# Guardian Context Window Usage Monitor
# Tracks and reports context usage to prevent overflow

echo "🔍 Guardian Context Window Usage Analysis"
echo "========================================"

# Function to estimate context size for each agent
estimate_agent_context() {
    local agent=$1
    local agent_file=".claude/agents/${agent}.md"
    local memory_dir=".claude/memory/${agent}"
    local total_lines=0
    
    echo "📊 Analyzing $agent context usage:"
    
    # Agent definition file
    if [ -f "$agent_file" ]; then
        local agent_lines=$(wc -l < "$agent_file")
        echo "  Agent definition: $agent_lines lines"
        total_lines=$((total_lines + agent_lines))
    fi
    
    # Private memory files
    if [ -d "$memory_dir" ]; then
        local memory_lines=0
        for file in "$memory_dir"/*.md; do
            if [ -f "$file" ]; then
                local file_lines=$(wc -l < "$file")
                memory_lines=$((memory_lines + file_lines))
            fi
        done
        echo "  Private memory: $memory_lines lines"
        total_lines=$((total_lines + memory_lines))
    fi
    
    # Estimate shared memory contribution (1/7 of shared memory)
    local shared_lines=0
    for file in .claude/memory/shared/*.md; do
        if [ -f "$file" ]; then
            local file_lines=$(wc -l < "$file")
            shared_lines=$((shared_lines + file_lines))
        fi
    done
    local shared_contribution=$((shared_lines / 7))
    echo "  Shared memory: ~$shared_contribution lines"
    total_lines=$((total_lines + shared_contribution))
    
    echo "  🎯 Total estimated context: $total_lines lines"
    
    # Warning thresholds
    if [ $total_lines -gt 1000 ]; then
        echo "  ⚠️  WARNING: High context usage ($total_lines lines)"
    elif [ $total_lines -gt 500 ]; then
        echo "  ⚡ MODERATE: Context usage getting large ($total_lines lines)"
    else
        echo "  ✅ HEALTHY: Context usage is reasonable ($total_lines lines)"
    fi
    
    echo ""
}

# Analyze each agent
agents=(
    "infrastructure-sergei"
    "ai-processing-tessa" 
    "frontend-prue"
    "quality-quinn"
    "healthcare-data-cleo"
    "analytics-ana"
    "growth-groot"
)

for agent in "${agents[@]}"; do
    estimate_agent_context "$agent"
done

# Overall system analysis
echo "🌍 Overall System Context Analysis:"
echo "=================================="

total_agent_files=0
total_memory_files=0
total_shared_memory=0

# Count agent definition files
for agent in "${agents[@]}"; do
    if [ -f ".claude/agents/${agent}.md" ]; then
        local lines=$(wc -l < ".claude/agents/${agent}.md")
        total_agent_files=$((total_agent_files + lines))
    fi
done

# Count all private memory
for agent_dir in .claude/memory/*/; do
    if [ -d "$agent_dir" ] && [[ ! "$agent_dir" =~ shared ]]; then
        for file in "$agent_dir"*.md; do
            if [ -f "$file" ]; then
                local lines=$(wc -l < "$file")
                total_memory_files=$((total_memory_files + lines))
            fi
        done
    fi
done

# Count shared memory
for file in .claude/memory/shared/*.md; do
    if [ -f "$file" ]; then
        local lines=$(wc -l < "$file")
        total_shared_memory=$((total_shared_memory + lines))
    fi
done

echo "Agent definitions: $total_agent_files lines"
echo "Private memories: $total_memory_files lines"  
echo "Shared memory: $total_shared_memory lines"
echo "Total system context: $((total_agent_files + total_memory_files + total_shared_memory)) lines"

# Recommendations
echo ""
echo "💡 Recommendations:"
echo "==================="

if [ $total_memory_files -gt 2000 ]; then
    echo "🔄 RUN MEMORY ROTATION: Private memories are getting large"
    echo "   Execute: ./.claude/scripts/manage-memory.sh"
fi

if [ $total_shared_memory -gt 1000 ]; then
    echo "📁 PARTITION SHARED MEMORY: Shared memory should be split by topic"
    echo "   Consider splitting shared memory into topic-specific files"
fi

if [ $((total_agent_files + total_memory_files + total_shared_memory)) -gt 5000 ]; then
    echo "⚠️  CRITICAL: Total context approaching limits"
    echo "   Implement aggressive memory management immediately"
fi

echo ""
echo "🎯 Run this script weekly to monitor context window health"