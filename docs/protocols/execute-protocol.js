#!/usr/bin/env node

/**
 * Guardian Protocol Execution Engine
 * 
 * Usage:
 *   node execute-protocol.js sign-in
 *   node execute-protocol.js sign-off
 * 
 * Can be triggered by:
 *   - Manual AI command
 *   - GitHub Actions cron schedule
 *   - Direct command line execution
 */

const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');

class ProtocolExecutor {
  constructor() {
    this.projectRoot = process.cwd();
    this.protocolsDir = path.join(this.projectRoot, 'docs/protocols');
    this.logsDir = path.join(this.protocolsDir, 'logs');
    this.timeTrackerFile = path.join(this.protocolsDir, 'time-tracker.json');
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  async execute(protocolName) {
    try {
      console.log(`🚀 Executing ${protocolName} protocol...`);
      
      // Load protocol definition
      const protocol = await this.loadProtocol(protocolName);
      
      // Run validations
      await this.runValidations(protocol.validations || []);
      
      // Handle interactive prompts (for sign-off)
      const userInputs = await this.handlePrompts(protocol.interactive_prompts || []);
      
      // Execute actions
      const results = await this.executeActions(protocol.actions, userInputs);
      
      // Check success criteria
      const success = this.checkSuccessCriteria(protocol.success_criteria, results);
      
      if (success) {
        console.log(`✅ ${protocolName} protocol completed successfully!`);
        await this.logSuccess(protocolName, results);
      } else {
        throw new Error(`Protocol ${protocolName} did not meet success criteria`);
      }
      
      this.rl.close();
      return results;
      
    } catch (error) {
      console.error(`❌ Protocol execution failed:`, error.message);
      await this.logError(protocolName, error);
      this.rl.close();
      process.exit(1);
    }
  }

  async loadProtocol(protocolName) {
    const protocolFile = path.join(this.protocolsDir, `${protocolName}.protocol.json`);
    const content = await fs.readFile(protocolFile, 'utf8');
    return JSON.parse(content);
  }

  async runValidations(validations) {
    for (const validation of validations) {
      console.log(`🔍 Running validation: ${validation.description}`);
      
      switch (validation.type) {
        case 'previous-signoff-check':
          await this.validatePreviousSignoff(validation);
          break;
        case 'active-session-check':
          await this.validateActiveSession(validation);
          break;
        case 'notion-connection':
          await this.validateNotionConnection(validation);
          break;
        case 'minimum-session-time':
          await this.validateMinimumSessionTime(validation);
          break;
      }
    }
  }

  async validatePreviousSignoff(validation) {
    const timeTracker = await this.loadTimeTracker();
    const lastSession = timeTracker.sessions[timeTracker.sessions.length - 1];
    
    if (!lastSession || !lastSession.end_time) {
      if (validation.required) {
        throw new Error('Previous session was not properly signed off');
      } else {
        console.log('⚠️  Warning: Previous session not signed off properly');
      }
    }
  }

  async validateActiveSession(validation) {
    const timeTracker = await this.loadTimeTracker();
    const activeSession = timeTracker.sessions.find(s => !s.end_time);
    
    if (!activeSession && validation.required) {
      throw new Error('No active session found to sign off');
    }
  }

  async validateNotionConnection(validation) {
    // Placeholder for Notion MCP connection check
    // In real implementation, this would test the MCP connection
    console.log('📝 Notion connection check - placeholder implementation');
  }

  async validateMinimumSessionTime(validation) {
    const timeTracker = await this.loadTimeTracker();
    const activeSession = timeTracker.sessions.find(s => !s.end_time);
    
    if (activeSession) {
      const startTime = new Date(activeSession.start_time);
      const now = new Date();
      const durationMinutes = (now - startTime) / (1000 * 60);
      
      if (durationMinutes < validation.threshold) {
        console.log(`⚠️  Warning: Session duration (${Math.round(durationMinutes)}min) is less than threshold (${validation.threshold}min)`);
      }
    }
  }

  async handlePrompts(prompts) {
    const userInputs = {};
    
    for (const prompt of prompts) {
      console.log(`\n📝 ${prompt.question}`);
      if (prompt.placeholder) {
        console.log(`   ${prompt.placeholder}`);
      }
      
      switch (prompt.type) {
        case 'multiline':
          userInputs[prompt.id] = await this.getMultilineInput();
          break;
        case 'checklist':
          userInputs[prompt.id] = await this.getChecklistInput(prompt.options);
          break;
        default:
          userInputs[prompt.id] = await this.getSingleLineInput();
      }
      
      if (prompt.required && !userInputs[prompt.id]) {
        throw new Error(`Required input missing for: ${prompt.question}`);
      }
    }
    
    return userInputs;
  }

  async getSingleLineInput() {
    return new Promise((resolve) => {
      this.rl.question('> ', (answer) => {
        resolve(answer.trim());
      });
    });
  }

  async getMultilineInput() {
    console.log('Enter your response (press Enter twice when done):');
    let input = '';
    let emptyLineCount = 0;
    
    return new Promise((resolve) => {
      this.rl.on('line', (line) => {
        if (line.trim() === '') {
          emptyLineCount++;
          if (emptyLineCount >= 2) {
            this.rl.removeAllListeners('line');
            resolve(input.trim());
          }
        } else {
          emptyLineCount = 0;
          input += line + '\n';
        }
      });
    });
  }

  async getChecklistInput(options) {
    console.log('Select applicable options (enter numbers separated by commas):');
    options.forEach((option, index) => {
      console.log(`  ${index + 1}. ${option}`);
    });
    
    const answer = await this.getSingleLineInput();
    const selectedIndices = answer.split(',').map(i => parseInt(i.trim()) - 1);
    return selectedIndices.map(i => options[i]).filter(Boolean);
  }

  async executeActions(actions, userInputs = {}) {
    const results = {};
    
    for (const action of actions) {
      console.log(`⚡ Executing: ${action.id}`);
      
      try {
        switch (action.type) {
          case 'time-track':
            results[action.id] = await this.executeTimeTrack(action, userInputs);
            break;
          case 'file-update':
            results[action.id] = await this.executeFileUpdate(action, userInputs);
            break;
          case 'file-read':
            results[action.id] = await this.executeFileRead(action);
            break;
          case 'file-create':
            results[action.id] = await this.executeFileCreate(action, userInputs);
            break;
          case 'notion-sync':
            results[action.id] = await this.executeNotionSync(action, userInputs);
            break;
          case 'status-check':
            results[action.id] = await this.executeStatusCheck(action);
            break;
          case 'display':
            results[action.id] = await this.executeDisplay(action, results);
            break;
          case 'file-backup':
            results[action.id] = await this.executeFileBackup(action);
            break;
          default:
            console.log(`⚠️  Unknown action type: ${action.type}`);
        }
      } catch (error) {
        console.error(`❌ Action ${action.id} failed:`, error.message);
        results[action.id] = { success: false, error: error.message };
      }
    }
    
    return results;
  }

  async executeTimeTrack(action, userInputs) {
    const timeTracker = await this.loadTimeTracker();
    const now = new Date().toISOString();
    
    if (action.action === 'start-session') {
      const sessionId = this.generateSessionId();
      const newSession = {
        id: sessionId,
        date: now.split('T')[0],
        start_time: now,
        session_type: action.metadata?.session_type || 'development',
        rd_eligible: action.metadata?.rd_eligible || true,
        tasks_completed: [],
        notes: ''
      };
      
      timeTracker.sessions.push(newSession);
      await this.saveTimeTracker(timeTracker);
      
      return { success: true, session_id: sessionId, start_time: now };
    } else if (action.action === 'end-session') {
      const activeSession = timeTracker.sessions.find(s => !s.end_time);
      
      if (activeSession) {
        activeSession.end_time = now;
        activeSession.duration_hours = this.calculateDuration(activeSession.start_time, now);
        activeSession.notes = userInputs.accomplishments || '';
        activeSession.blockers = userInputs.blockers || '';
        activeSession.rd_activities = userInputs['rd-activities'] || [];
        
        await this.saveTimeTracker(timeTracker);
        return { success: true, session_id: activeSession.id, duration: activeSession.duration_hours };
      }
    }
    
    return { success: false, error: 'No active session found' };
  }

  async executeFileUpdate(action, userInputs) {
    const filePath = path.join(this.projectRoot, action.target);
    const timestamp = new Date().toISOString();
    
    let content = '';
    
    if (action.template === 'session-start') {
      content = `\n## [${timestamp.split('T')[0]}] Work Session Started\n- **Start Time:** ${timestamp}\n- **Session ID:** ${userInputs.session_id || 'auto-generated'}\n- **Status:** Active session in progress\n\n`;
    } else if (action.template === 'session-summary') {
      content = `\n## [${timestamp.split('T')[0]}] Work Session Completed\n- **Duration:** ${userInputs.duration || 'N/A'} hours\n- **Accomplishments:** ${userInputs.accomplishments || 'None specified'}\n- **Blockers:** ${userInputs.blockers || 'None'}\n- **Next Steps:** ${userInputs['next-priorities'] || 'To be determined'}\n\n`;
    }
    
    await fs.appendFile(filePath, content);
    return { success: true, file: action.target, content_added: content.length };
  }

  async executeFileRead(action) {
    const filePath = path.join(this.projectRoot, action.target);
    const content = await fs.readFile(filePath, 'utf8');
    
    if (action.action === 'extract-current-priorities') {
      // Simple extraction of tasks marked as "In Progress" or "Ready"
      const lines = content.split('\n');
      const priorities = lines.filter(line => 
        line.includes('In Progress') || line.includes('Ready')
      ).slice(0, 5); // Top 5 priorities
      
      console.log('📋 Current Priorities:');
      priorities.forEach(priority => console.log(`  • ${priority.trim()}`));
      
      return { success: true, priorities };
    }
    
    return { success: true, content };
  }

  async executeNotionSync(action, userInputs) {
    // Placeholder for Notion MCP integration
    // In real implementation, this would use the Notion MCP to update databases
    console.log(`📝 Notion sync: ${action.target} - ${action.action}`);
    console.log(`   Data: ${JSON.stringify(userInputs, null, 2)}`);
    
    return { success: true, action: action.action, target: action.target };
  }

  async executeStatusCheck(action) {
    const results = {};
    
    for (const target of action.targets) {
      try {
        if (target.name === 'github') {
          // Simple GitHub API check
          const response = await fetch(target.endpoint);
          results[target.name] = { status: response.ok ? 'healthy' : 'issues' };
        } else {
          // Placeholder for other service checks
          results[target.name] = { status: 'healthy' };
        }
      } catch (error) {
        results[target.name] = { status: 'error', error: error.message };
      }
    }
    
    console.log('🔍 System Status Check:');
    Object.entries(results).forEach(([service, status]) => {
      const emoji = status.status === 'healthy' ? '✅' : '❌';
      console.log(`   ${emoji} ${service}: ${status.status}`);
    });
    
    return { success: true, status_checks: results };
  }

  async executeDisplay(action, results) {
    let message = action.message;
    
    // Replace placeholders with actual data
    if (action.include_data) {
      action.include_data.forEach(dataKey => {
        if (results[dataKey]) {
          message = message.replace(`{${dataKey}}`, results[dataKey]);
        }
      });
    }
    
    console.log(`\n${message}\n`);
    return { success: true, message };
  }

  async executeFileCreate(action, userInputs) {
    const fileName = action.target.replace('YYYY-MM-DD', new Date().toISOString().split('T')[0]);
    const filePath = path.join(this.projectRoot, fileName);
    
    // Ensure directory exists
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    
    const content = this.generateFileContent(action.template, userInputs);
    await fs.writeFile(filePath, content);
    
    return { success: true, file: fileName };
  }

  async executeFileBackup(action) {
    const timestamp = new Date().toISOString().split('T')[0];
    const backupDir = path.join(this.projectRoot, action.destination.replace('YYYY-MM-DD', timestamp));
    
    await fs.mkdir(backupDir, { recursive: true });
    
    for (const target of action.targets) {
      const sourcePath = path.join(this.projectRoot, target);
      const destPath = path.join(backupDir, path.basename(target));
      await fs.copyFile(sourcePath, destPath);
    }
    
    return { success: true, backup_location: backupDir };
  }

  generateFileContent(template, userInputs) {
    if (template === 'daily-session-summary') {
      return `# Daily Session Summary - ${new Date().toISOString().split('T')[0]}

## Session Overview
- **Start Time:** ${userInputs.start_time || 'N/A'}
- **End Time:** ${userInputs.end_time || 'N/A'}
- **Duration:** ${userInputs.duration || 'N/A'} hours

## Accomplishments
${userInputs.accomplishments || 'None specified'}

## Blockers/Issues
${userInputs.blockers || 'None'}

## Next Priorities
${userInputs['next-priorities'] || 'To be determined'}

## R&D Activities
${Array.isArray(userInputs['rd-activities']) ? userInputs['rd-activities'].map(a => `- ${a}`).join('\n') : 'None specified'}

---
*Generated automatically by Guardian Protocol System*
`;
    }
    
    return 'Generated content placeholder';
  }

  async loadTimeTracker() {
    try {
      const content = await fs.readFile(this.timeTrackerFile, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      // Create new time tracker if file doesn't exist
      return { sessions: [], monthly_summary: {} };
    }
  }

  async saveTimeTracker(data) {
    await fs.mkdir(path.dirname(this.timeTrackerFile), { recursive: true });
    await fs.writeFile(this.timeTrackerFile, JSON.stringify(data, null, 2));
  }

  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  calculateDuration(startTime, endTime) {
    const start = new Date(startTime);
    const end = new Date(endTime);
    return Math.round(((end - start) / (1000 * 60 * 60)) * 100) / 100; // Hours with 2 decimal places
  }

  checkSuccessCriteria(criteria, results) {
    if (!criteria) return true;
    
    const requiredCompletions = criteria.required_completions || [];
    const allRequired = requiredCompletions.every(actionId => 
      results[actionId] && results[actionId].success
    );
    
    return allRequired;
  }

  async logSuccess(protocolName, results) {
    await fs.mkdir(this.logsDir, { recursive: true });
    const logFile = path.join(this.logsDir, `${protocolName}-success.log`);
    const logEntry = `${new Date().toISOString()}: ${protocolName} completed successfully\n`;
    await fs.appendFile(logFile, logEntry);
  }

  async logError(protocolName, error) {
    await fs.mkdir(this.logsDir, { recursive: true });
    const logFile = path.join(this.logsDir, `${protocolName}-errors.log`);
    const logEntry = `${new Date().toISOString()}: ${protocolName} failed - ${error.message}\n`;
    await fs.appendFile(logFile, logEntry);
  }
}

// Main execution
async function main() {
  const protocolName = process.argv[2];
  
  if (!protocolName || !['sign-in', 'sign-off'].includes(protocolName)) {
    console.error('Usage: node execute-protocol.js [sign-in|sign-off]');
    process.exit(1);
  }
  
  const executor = new ProtocolExecutor();
  await executor.execute(protocolName);
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = ProtocolExecutor;