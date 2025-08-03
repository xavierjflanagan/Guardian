#!/bin/bash

# Guardian Agent Memory Management Script
# Manages context window size by rotating and summarizing agent memory

MEMORY_DIR=".claude/memory"
MAX_MEMORY_LINES=500  # Maximum lines per memory file
ARCHIVE_DIR=".claude/memory/archive"

echo "🧠 Managing Agent Memory for Context Window Optimization"
echo "====================================================="

# Create archive directory if it doesn't exist
mkdir -p "$ARCHIVE_DIR"

# Function to manage individual agent memory
manage_agent_memory() {
    local agent=$1
    local memory_file="$MEMORY_DIR/$agent/recent-work.md"
    
    if [ -f "$memory_file" ]; then
        local line_count=$(wc -l < "$memory_file")
        echo "📊 $agent memory: $line_count lines"
        
        if [ $line_count -gt $MAX_MEMORY_LINES ]; then
            echo "🔄 Rotating $agent memory (too large: $line_count lines)"
            
            # Archive old content
            local archive_file="$ARCHIVE_DIR/$agent-$(date +%Y%m%d).md"
            head -n $((line_count - 100)) "$memory_file" > "$archive_file"
            
            # Keep only recent content
            tail -n 100 "$memory_file" > "$memory_file.tmp"
            mv "$memory_file.tmp" "$memory_file"
            
            # Add summary header
            echo "# Recent Work (Last 100 entries)" > "$memory_file.new"
            echo "# Older entries archived to: $archive_file" >> "$memory_file.new"
            echo "" >> "$memory_file.new"
            cat "$memory_file" >> "$memory_file.new"
            mv "$memory_file.new" "$memory_file"
            
            echo "✅ $agent memory rotated and archived"
        else
            echo "✅ $agent memory size is healthy"
        fi
    fi
}

# Manage shared memory
manage_shared_memory() {
    local shared_file="$MEMORY_DIR/shared/recent-changes.md"
    
    if [ -f "$shared_file" ]; then
        local line_count=$(wc -l < "$shared_file")
        echo "📊 Shared memory: $line_count lines"
        
        if [ $line_count -gt $((MAX_MEMORY_LINES * 2)) ]; then
            echo "🔄 Rotating shared memory (too large: $line_count lines)"
            
            # Archive old shared content
            local archive_file="$ARCHIVE_DIR/shared-$(date +%Y%m%d).md"
            head -n $((line_count - 200)) "$shared_file" > "$archive_file"
            
            # Keep recent shared content
            tail -n 200 "$shared_file" > "$shared_file.tmp"
            mv "$shared_file.tmp" "$shared_file"
            
            echo "✅ Shared memory rotated and archived"
        fi
    fi
}

# Manage each agent's memory
agents=("sergei" "tessa" "prue" "quinn" "cleo" "ana" "groot")
for agent in "${agents[@]}"; do
    manage_agent_memory "$agent"
done

# Manage shared memory
manage_shared_memory

# Generate memory usage report
echo ""
echo "📈 Memory Usage Report:"
echo "======================"
for agent in "${agents[@]}"; do
    if [ -f "$MEMORY_DIR/$agent/recent-work.md" ]; then
        local lines=$(wc -l < "$MEMORY_DIR/$agent/recent-work.md" 2>/dev/null || echo "0")
        echo "$agent: $lines lines"
    fi
done

local shared_lines=$(wc -l < "$MEMORY_DIR/shared/recent-changes.md" 2>/dev/null || echo "0")
echo "shared: $shared_lines lines"

echo ""
echo "💡 Recommendation: Run this script weekly to maintain optimal context window usage"