# AI Protocol System - Guardian Project

**Purpose:** Defines the AI-driven work session management protocols for project tracking and R&D tax compliance.
**Last updated:** July 2025
**Audience:** All contributors, developers, project managers
**Prerequisites:** None

---

## **How It Works**

This system uses **AI-readable protocol documents** that define exactly what should happen when you start or end work sessions. Simply tell your AI assistant to execute the protocols, and it will handle all the documentation updates automatically.

**New:** The system now also syncs technical tasks between your local `docs/management/TASKS.md` and the Notion Technical Task Board ([link](https://www.notion.so/22887f8cee9e816b98cbc8a99950d452)). This ensures your technical to-do list is always up to date in both your codebase and Notion workspace.

**Update July 2025:** The user's full written session notes (including diary-style entries) will be copied verbatim into the progress log for maximum context and compliance. This is now part of the sign-in and sign-off protocol.

### **Available Protocols**

1. **[Sign-In Protocol](SIGN_IN_PROTOCOL.md)** - Start work sessions
2. **[Sign-Off Protocol](SIGN_OFF_PROTOCOL.md)** - End work sessions

---

## **Quick Start**

### **To Start a Work Session:**
**Say to your AI:** *"Execute sign in protocol"*

**What happens:**
1. AI checks if previous session was properly signed off
2. AI asks about your goals for this session
3. **AI reviews entire AI context** - comprehensive project state analysis
4. AI syncs technical tasks between TASKS.md and Notion Technical Task Board
5. AI updates session tracking documents
6. AI gives you a **contextual session briefing** combining project status, recent decisions, and goal alignment

### **To End a Work Session:**
**Say to your AI:** *"Execute sign off protocol"*

**What happens:**
1. AI asks what you accomplished this session
2. AI asks how many hours you worked (for R&D tax compliance)
3. AI asks about your next session priorities
4. **AI comprehensively reviews and updates AI context** - analyzes entire project state
5. AI syncs technical tasks between TASKS.md and Notion Technical Task Board
6. AI updates all relevant documentation
7. AI confirms completion with **detailed session summary** including files modified

---

## **Files Updated Automatically**

### **Every Session**
- **`docs/PROGRESS_LOG.md`** - Detailed session logs
- **`docs/context/AI_context.md`** - Comprehensive project context and session updates
- **`docs/management/TASKS.md`** - Task status updates (now synced with Notion)
- **Notion Technical Task Board** - Technical task board in Notion (synced with TASKS.md)

### **As Needed (Based on Work Type)**
- **`docs/README.md`** - If navigation changes
- **`README.md`** (root) - If major features added
- **`docs/architecture/`** files - If architectural work
- **`docs/guides/`** files - If process changes
- **Any specific files** mentioned in accomplishments

---

## **Benefits**

### **For You**
- ✅ **No manual logging** - AI handles all documentation and task board syncing
- ✅ **R&D tax compliance** - Automatic hour tracking and activity categorization
- ✅ **Session focus** - Clear goals and priorities each session
- ✅ **Progress visibility** - Always know where you left off
- ✅ **Contextual awareness** - AI understands full project state and recent decisions
- ✅ **Intelligent briefings** - Session starts with comprehensive, relevant context

### **For the Project**
- ✅ **Professional documentation** - Consistent, detailed logs
- ✅ **Accountability** - Clear record of all work
- ✅ **Knowledge preservation** - Context and decisions captured
- ✅ **Audit trail** - Complete development history
- ✅ **Contextual continuity** - AI maintains comprehensive project context across sessions
- ✅ **Intelligent updates** - Documentation evolves contextually rather than just chronologically

---

## **Setup Requirements**

### **None!** 
The system is ready to use immediately. Just ensure these files exist:
- **`docs/PROGRESS_LOG.md`** (Already exists)
- **`docs/context/AI_context.md`** (Already exists)
- **`docs/management/TASKS.md`** (Already exists)
- **Notion Technical Task Board** ([link](https://www.notion.so/22887f8cee9e816b98cbc8a99950d452))

Your AI assistant will read the protocol documents and follow them automatically, including syncing your technical tasks with Notion.

---

## **Example Usage**

For detailed examples, please see the protocol files:
- **[Sign-In Protocol](SIGN_IN_PROTOCOL.md)**
- **[Sign-Off Protocol](SIGN_OFF_PROTOCOL.md)**

---

## **R&D Tax Compliance**

The system automatically maintains R&D tax compliance by:

- **Tracking Hours:** Precise work time recording
- **Documenting Activities:** Detailed descriptions of R&D work
- **Categorizing Work:** Development, research, problem-solving activities
- **Audit Trail:** Complete documentation for tax purposes
- **Monthly Reports:** Ready for accountant/tax advisor

**Estimated Value:** Proper R&D documentation could unlock thousands in tax incentives annually.

---

## **Customization**

Want to modify the protocols? Simply edit the markdown files:
- **SIGN_IN_PROTOCOL.md** - Customize session start process
- **SIGN_OFF_PROTOCOL.md** - Customize session end process

The AI will automatically follow any changes you make to these protocol documents.

---

## **Troubleshooting**

### **Protocol Not Working?**
1. Check that protocol files exist and are readable
2. Ensure your AI assistant has access to the codebase
3. Try rephrasing your request (e.g., "run sign off protocol")

### **Files Not Updating?**
1. Check file permissions in your repository
2. Ensure the AI has write access to the docs folder
3. Manually verify the files exist and are writable

### **Missing Information?**
1. The protocols are designed to work with incomplete information
2. Provide what you can, the AI will use reasonable defaults
3. You can always update documentation manually if needed

---

## **Log Integrity Policy**

- All session logs in `docs/PROGRESS_LOG.md` are append-only. No edits or overwrites are allowed to any block, including 'Work Session Started' or 'Summary' blocks.
- Every session event (sign-in or sign-off) must create a new block at the top of the log for audit, compliance, and historical accuracy.

*This protocol system provides effortless work session management while ensuring professional documentation and R&D tax compliance. Simply tell your AI to execute the protocols and focus on your work!*