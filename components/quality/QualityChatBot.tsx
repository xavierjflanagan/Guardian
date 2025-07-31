'use client';

import React, { useState, useRef, useEffect } from 'react';
import { createClient } from '@/lib/supabaseClientSSR';

interface ChatMessage {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
  action?: {
    type: 'resolve_flag' | 'batch_operation' | 'show_flags';
    data: any;
  };
}

interface QualityChatBotProps {
  onFlagResolve?: (flagId: string, resolution: any) => void;
  onBatchOperation?: (flagIds: string[], action: string) => void;
  className?: string;
}

export default function QualityChatBot({
  onFlagResolve,
  onBatchOperation,
  className = ''
}: QualityChatBotProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      text: "👋 Hi! I can help you resolve data quality issues. Try commands like:\n• 'show critical flags'\n• 'confirm flag [ID]'\n• 'delete flag [ID]'\n• 'change [field] to [value]'",
      isUser: false,
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const addMessage = (text: string, isUser: boolean, action?: ChatMessage['action']) => {
    const newMessage: ChatMessage = {
      id: Date.now().toString(),
      text,
      isUser,
      timestamp: new Date(),
      action
    };
    setMessages(prev => [...prev, newMessage]);
  };

  const handleSendMessage = async () => {
    if (!input.trim() || isProcessing) return;

    const userMessage = input.trim();
    setInput('');
    addMessage(userMessage, true);
    setIsProcessing(true);

    try {
      const response = await processQualityCommand(userMessage);
      addMessage(response.text, false, response.action);
    } catch (error) {
      addMessage('Sorry, I encountered an error processing your request. Please try again.', false);
    } finally {
      setIsProcessing(false);
    }
  };

  const processQualityCommand = async (command: string): Promise<{ text: string; action?: ChatMessage['action'] }> => {
    const cmd = command.toLowerCase();

    // Show flags commands
    if (cmd.includes('show') && (cmd.includes('flags') || cmd.includes('issues'))) {
      const severity = cmd.includes('critical') ? 'critical' : 
                     cmd.includes('warning') ? 'warning' : 
                     cmd.includes('info') ? 'info' : 'all';
      
      const flags = await fetchFlags({ status: 'pending', severity });
      
      if (flags.length === 0) {
        return { text: `No ${severity === 'all' ? '' : severity + ' '}flags found! 🎉` };
      }
      
      const flagList = flags.slice(0, 5).map(flag => 
        `• ${flag.problem_code.replace(/_/g, ' ')} (${flag.severity}) - ID: ${flag.flag_id?.substring(0, 8)}`
      ).join('\n');
      
      return {
        text: `Found ${flags.length} ${severity === 'all' ? '' : severity + ' '}flags:\n\n${flagList}${flags.length > 5 ? '\n\n...and more' : ''}`,
        action: {
          type: 'show_flags',
          data: { flags, severity }
        }
      };
    }

    // Confirm flag command
    if (cmd.startsWith('confirm') && (cmd.includes('flag') || cmd.includes('all'))) {
      if (cmd.includes('all')) {
        return await handleBatchCommand('confirm');
      } else {
        const flagId = extractFlagId(cmd);
        if (flagId) {
          return await handleFlagResolve(flagId, { action: 'confirm' });
        }
      }
    }

    // Delete flag command
    if (cmd.startsWith('delete') && cmd.includes('flag')) {
      const flagId = extractFlagId(cmd);
      if (flagId) {
        return await handleFlagResolve(flagId, { action: 'delete' });
      }
    }

    // Ignore flag command
    if ((cmd.startsWith('ignore') || cmd.startsWith('dismiss')) && cmd.includes('flag')) {
      const flagId = extractFlagId(cmd);
      if (flagId) {
        return await handleFlagResolve(flagId, { action: 'ignore' });
      }
    }

    // Change/edit command
    if (cmd.startsWith('change') || cmd.startsWith('edit')) {
      const match = cmd.match(/change|edit.*?to\s+(.+)/);
      if (match) {
        const newValue = match[1];
        return {
          text: `I can help you change a value to "${newValue}". Please specify which flag you'd like to edit by saying "edit flag [ID] to ${newValue}".`,
        };
      }
    }

    // Help command
    if (cmd.includes('help') || cmd === '?') {
      return {
        text: `Here are commands I understand:

📋 **Viewing Flags:**
• "show flags" - Show all pending flags
• "show critical flags" - Show only critical issues
• "show warnings" - Show warning flags

✅ **Resolving Flags:**
• "confirm flag [ID]" - Confirm a flag is correct
• "delete flag [ID]" - Remove flagged data
• "ignore flag [ID]" - Dismiss a flag
• "edit flag [ID] to [value]" - Change flagged value

🔄 **Batch Operations:**
• "confirm all warnings" - Confirm all warning flags
• "ignore all info" - Dismiss all info flags

Need help with a specific flag? Just ask!`
      };
    }

    // Stats command
    if (cmd.includes('stats') || cmd.includes('summary')) {
      const stats = await fetchQualityStats();
      return {
        text: `📊 **Quality Summary:**
• Total flags: ${stats.total_flags}
• Pending: ${stats.pending_flags}
• Critical: ${stats.critical_flags}
• Resolution rate: ${Math.round(stats.resolution_rate)}%

${stats.critical_flags > 0 ? '⚠️ You have critical flags that need attention!' : '✅ No critical issues!'}`
      };
    }

    // Default response for unrecognized commands
    return {
      text: `I didn't understand that command. Type "help" to see what I can do, or try:\n• "show flags"\n• "confirm flag [ID]"\n• "help"`
    };
  };

  const extractFlagId = (command: string): string | null => {
    // Look for UUID pattern or short ID
    const uuidMatch = command.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    if (uuidMatch) return uuidMatch[0];
    
    // Look for short ID (first 8 characters)
    const shortIdMatch = command.match(/[0-9a-f]{8}/i);
    if (shortIdMatch) {
      // Need to resolve to full UUID - this would require a lookup
      return shortIdMatch[0]; // For now, return short ID
    }
    
    return null;
  };

  const handleFlagResolve = async (flagId: string, resolution: any): Promise<{ text: string; action?: ChatMessage['action'] }> => {
    try {
      // If it's a short ID, we need to resolve it to full UUID first
      let resolvedFlagId = flagId;
      if (flagId.length === 8) {
        const flags = await fetchFlags({ status: 'pending' });
        const matchingFlag = flags.find(f => f.flag_id?.startsWith(flagId));
        if (matchingFlag) {
          resolvedFlagId = matchingFlag.flag_id!;
        } else {
          return { text: `Could not find flag with ID starting with "${flagId}". Try "show flags" to see available flags.` };
        }
      }

      const response = await fetch(`/functions/v1/quality-guardian/flags/${resolvedFlagId}/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
        body: JSON.stringify({
          ...resolution,
          resolution_notes: `Resolved via chat bot command`
        }),
      });

      if (response.ok) {
        const actionText = resolution.action === 'confirm' ? 'confirmed' : 
                          resolution.action === 'delete' ? 'deleted' :
                          'resolved';
        
        if (onFlagResolve) {
          onFlagResolve(resolvedFlagId, resolution);
        }
        
        return {
          text: `✅ Successfully ${actionText} flag ${flagId.substring(0, 8)}!`,
          action: {
            type: 'resolve_flag',
            data: { flagId: resolvedFlagId, resolution }
          }
        };
      } else {
        const error = await response.json();
        return { text: `❌ Failed to resolve flag: ${error.error || 'Unknown error'}` };
      }
    } catch (error) {
      return { text: `❌ Error resolving flag: ${error}` };
    }
  };

  const handleBatchCommand = async (action: string): Promise<{ text: string; action?: ChatMessage['action'] }> => {
    try {
      const flags = await fetchFlags({ status: 'pending' });
      
      if (flags.length === 0) {
        return { text: '🎉 No pending flags to process!' };
      }

      const flagIds = flags.map(f => f.flag_id!);
      
      const response = await fetch('/functions/v1/quality-guardian/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
        body: JSON.stringify({
          flag_ids: flagIds,
          action,
          resolution_notes: `Batch ${action} via chat bot`
        }),
      });

      if (response.ok) {
        const result = await response.json();
        
        if (onBatchOperation) {
          onBatchOperation(flagIds, action);
        }
        
        return {
          text: `✅ Successfully ${action}ed ${result.processed} flags!${result.errors > 0 ? ` (${result.errors} errors)` : ''}`,
          action: {
            type: 'batch_operation',
            data: { flagIds, action, result }
          }
        };
      } else {
        const error = await response.json();
        return { text: `❌ Batch operation failed: ${error.error || 'Unknown error'}` };
      }
    } catch (error) {
      return { text: `❌ Error in batch operation: ${error}` };
    }
  };

  const fetchFlags = async (filters: { status?: string; severity?: string } = {}): Promise<any[]> => {
    try {
      const params = new URLSearchParams();
      if (filters.status) params.append('status', filters.status);
      if (filters.severity && filters.severity !== 'all') params.append('severity', filters.severity);
      params.append('limit', '50');

      const response = await fetch(`/functions/v1/quality-guardian/flags?${params}`, {
        headers: {
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
      });

      if (response.ok) {
        const { flags } = await response.json();
        return flags || [];
      }
      return [];
    } catch (error) {
      console.error('Error fetching flags:', error);
      return [];
    }
  };

  const fetchQualityStats = async (): Promise<any> => {
    try {
      const response = await fetch('/functions/v1/quality-guardian/stats', {
        headers: {
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
      });

      if (response.ok) {
        const { stats } = await response.json();
        return stats || {
          total_flags: 0,
          pending_flags: 0,
          critical_flags: 0,
          resolution_rate: 0
        };
      }
      return {};
    } catch (error) {
      console.error('Error fetching stats:', error);
      return {};
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className={`fixed bottom-4 right-4 z-50 ${className}`}>
      {/* Chat Window */}
      {isOpen && (
        <div className="mb-4 w-80 bg-white rounded-lg shadow-xl border max-h-96 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-3 border-b bg-blue-50 rounded-t-lg">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                <svg className="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-900">Quality Assistant</h3>
                <p className="text-xs text-gray-600">Data quality helper</p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.isUser ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-xs px-3 py-2 rounded-lg text-sm whitespace-pre-wrap ${
                    message.isUser
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-900'
                  }`}
                >
                  {message.text}
                </div>
              </div>
            ))}
            {isProcessing && (
              <div className="flex justify-start">
                <div className="bg-gray-100 text-gray-900 px-3 py-2 rounded-lg text-sm">
                  <div className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600"></div>
                    Thinking...
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type a command..."
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
                disabled={isProcessing}
              />
              <button
                onClick={handleSendMessage}
                disabled={!input.trim() || isProcessing}
                className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-12 h-12 rounded-full shadow-lg transition-all duration-200 flex items-center justify-center ${
          isOpen 
            ? 'bg-gray-600 hover:bg-gray-700' 
            : 'bg-blue-600 hover:bg-blue-700 hover:scale-105'
        }`}
      >
        {isOpen ? (
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        )}
      </button>
    </div>
  );
}