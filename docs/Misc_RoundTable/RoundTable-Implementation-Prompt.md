# RoundTable IDE Platform - Implementation Prompt

**Target Service**: Base44, v0.dev, bolt.new, or similar AI-powered development platform  
**Project Scope**: MVP Phase 1 - Foundation Platform (3-month timeline)

---

## 🎯 Project Brief

Build a **next-generation web-based business operations platform** that combines intelligent IDE functionality with AI-powered business intelligence. This is the foundation for a comprehensive platform where specialized AI agents manage all aspects of business operations.

**Core Value Proposition**: Replace fragmented business tools (IDEs, monitoring dashboards, analytics platforms, project management) with a unified, AI-powered command center.

---

## 🏗️ Technical Architecture Requirements

### **Frontend Stack**
- **Framework**: Next.js 14+ with React 18+
- **Styling**: Tailwind CSS with shadcn/ui components
- **State Management**: Zustand or React Query for data management
- **Real-time**: WebSocket connections for live updates
- **Charts**: Recharts or Chart.js for data visualization
- **Code Editor**: Monaco Editor (VS Code editor) integration
- **Layout**: Flexible multi-panel layout with resizable panes

### **Backend Stack**
- **API**: Next.js API routes with TypeScript
- **Database**: Supabase (PostgreSQL) with real-time subscriptions
- **Authentication**: Supabase Auth with GitHub OAuth
- **File Storage**: Supabase Storage for project files
- **AI Integration**: OpenAI/Anthropic APIs for agent functionality
- **External APIs**: GitHub API, Supabase API, Render API, Sentry API

### **Infrastructure**
- **Hosting**: Vercel for Next.js deployment
- **Database**: Supabase cloud hosting
- **Monitoring**: Built-in error tracking and performance monitoring
- **Security**: HTTPS, JWT authentication, API rate limiting

---

## 🎨 Core UI Components to Build

### **1. Main Layout Structure**
```
┌─────────────────────────────────────────────────────────┐
│ Header: Logo | User Profile | Notifications | Settings  │
├─────────────────────────────────────────────────────────┤
│ ┌─────────┐ ┌─────────────────────────────────────────┐ │
│ │ Agent   │ │ Main Content Area                       │ │
│ │ Sidebar │ │ (IDE / Dashboard / Agent Chat)          │ │
│ │         │ │                                         │ │
│ │ Charlie │ │                                         │ │
│ │ Sergei  │ │                                         │ │
│ │ Tessa   │ │                                         │ │
│ │ Ana     │ │                                         │ │
│ │ ...     │ │                                         │ │
│ └─────────┘ └─────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────┤
│ Status Bar: System Status | Active Tasks | Quick Info   │
└─────────────────────────────────────────────────────────┘
```

### **2. Agent Sidebar**
- **Charlie (Chief of Staff)**: Always visible, highlighted when active
- **Specialized Agents**: Collapsible categories (Engineering, Business, Compliance)
- **Status Indicators**: Green (active), Yellow (processing), Red (error), Gray (idle)
- **Quick Actions**: Direct chat, view recent activity, agent settings

### **3. Multi-Modal Content Area**
#### **IDE Mode**
- **Monaco Editor**: Full-featured code editor with syntax highlighting
- **File Explorer**: GitHub repository browser with folder tree
- **Terminal**: Integrated terminal for command execution
- **AI Assistant**: Code completion, error detection, suggestions
- **Split Panes**: Multiple files open simultaneously

#### **Dashboard Mode**
- **Metrics Grid**: Key performance indicators across all business domains
- **Real-time Charts**: Live data visualization with auto-refresh
- **Alert Center**: Priority notifications and action items
- **Quick Actions**: One-click access to common tasks

#### **Agent Chat Mode**
- **Conversation Interface**: Chat with individual agents
- **Context Panel**: Relevant data and files for current conversation
- **Action Buttons**: Execute agent recommendations with one click
- **History**: Conversation history and previous decisions

### **4. Data Visualization Components**
- **Time Series Charts**: For metrics trending over time
- **KPI Cards**: Large number displays for key metrics
- **Status Grids**: System health across multiple services
- **Alert Panels**: Priority notifications with severity levels
- **Progress Bars**: Task completion and goal tracking

---

## 🤖 AI Agent Implementation

### **Agent Architecture**
```typescript
interface Agent {
  id: string;
  name: string;
  role: string;
  description: string;
  status: 'active' | 'processing' | 'idle' | 'error';
  capabilities: string[];
  dataConnections: DataConnection[];
  lastActivity: Date;
  conversationHistory: Message[];
}

interface Message {
  id: string;
  agentId: string;
  content: string;
  type: 'user' | 'agent' | 'system';
  timestamp: Date;
  metadata?: Record<string, any>;
}
```

### **Core Agents for MVP (Phase 1)**
#### **1. Charlie - Chief of Staff Agent**
- **Purpose**: Central coordinator and user interface
- **UI**: Always-visible chat interface in sidebar
- **Functions**: 
  - Aggregate reports from other agents
  - Route user requests to appropriate agents
  - Summarize complex multi-agent recommendations
  - Manage approval workflows

#### **2. Sergei - Infrastructure Agent**
- **Purpose**: Monitor and manage technical infrastructure
- **Data Sources**: Supabase metrics, Render.com status, error logs
- **Functions**:
  - Real-time system health monitoring
  - Performance alerts and recommendations
  - Deployment status tracking
  - Security monitoring

#### **3. Tessa - AI/Tech Ops Agent**
- **Purpose**: Optimize AI usage and technical architecture
- **Data Sources**: API usage metrics, response times, costs
- **Functions**:
  - Monitor AI token usage and costs
  - Optimize API performance
  - Suggest architecture improvements
  - Track technical debt

#### **4. Ana - Analytics Agent**
- **Purpose**: Business intelligence and user behavior analysis
- **Data Sources**: Application analytics, user activity, business metrics
- **Functions**:
  - Track key business metrics
  - Identify usage patterns and trends
  - Generate business insights
  - Monitor user engagement

### **Agent Communication System**
- **Inter-Agent Messaging**: Agents can communicate with each other
- **Approval Workflows**: Multi-agent review for significant changes
- **Context Sharing**: Agents share relevant data and insights
- **Escalation Paths**: Automatic escalation to Charlie and user when needed

---

## 📊 External Data Integration

### **Phase 1 Integrations**
#### **GitHub Integration**
```typescript
// GitHub repository access
const githubAPI = {
  listRepositories: () => Promise<Repository[]>,
  getFileContents: (repo: string, path: string) => Promise<string>,
  createPullRequest: (repo: string, changes: FileChange[]) => Promise<PullRequest>,
  getCommitHistory: (repo: string) => Promise<Commit[]>
};
```

#### **Supabase Integration**
```typescript
// Real-time database metrics
const supabaseMetrics = {
  getDatabaseSize: () => Promise<number>,
  getActiveConnections: () => Promise<number>,
  getQueryPerformance: () => Promise<QueryStats[]>,
  getStorageUsage: () => Promise<StorageStats>
};
```

#### **Basic System Monitoring**
```typescript
// Application health monitoring
const systemHealth = {
  getResponseTimes: () => Promise<ResponseTimeMetrics>,
  getErrorRates: () => Promise<ErrorRateMetrics>,
  getUptime: () => Promise<UptimeStats>,
  getResourceUsage: () => Promise<ResourceMetrics>
};
```

### **Data Display Components**
- **Real-time Metric Cards**: Live updating KPI displays
- **Status Indicators**: Visual health status across all services
- **Trend Charts**: Historical data visualization
- **Alert Notifications**: Prominent display of issues requiring attention

---

## 🎯 Core Features to Implement

### **1. User Authentication & Setup**
- **GitHub OAuth**: Login with GitHub account
- **Repository Selection**: Choose which repositories to integrate
- **Initial Configuration**: Set up basic preferences and agent settings
- **Onboarding Flow**: Guided tour of platform features

### **2. IDE Functionality**
- **File Browser**: Navigate GitHub repository structure
- **Code Editor**: Edit files with syntax highlighting and AI assistance
- **Git Integration**: Commit, push, pull, branch management
- **Search**: Find files, functions, and content across codebase
- **AI Code Assistant**: Code completion, error detection, refactoring suggestions

### **3. Agent Dashboard**
- **Agent Status Panel**: Real-time status of all agents
- **Recent Activity Feed**: Timeline of agent actions and insights
- **Quick Actions**: Common tasks accessible with one click
- **Notification Center**: Alerts and recommendations from agents

### **4. Data Visualization**
- **Metrics Dashboard**: Key performance indicators across all domains
- **Real-time Charts**: Live updating graphs and charts
- **Historical Trends**: Time-based analysis of key metrics
- **Custom Views**: User-configurable dashboard layouts

### **5. Communication Interface**
- **Agent Chat**: Direct conversation with individual agents
- **Charlie Interface**: Central communication hub
- **Approval Workflows**: Review and approve agent recommendations
- **Activity History**: Complete audit trail of all interactions

---

## 🔧 Implementation Steps

### **Phase 1A: Foundation (Weeks 1-4)**
1. **Project Setup**
   - Initialize Next.js project with TypeScript
   - Set up Tailwind CSS and shadcn/ui
   - Configure Supabase connection
   - Implement basic authentication

2. **Core Layout**
   - Build main layout with header, sidebar, content area
   - Implement responsive design for mobile/desktop
   - Create navigation and routing structure
   - Add theme support (light/dark mode)

3. **Agent Framework**
   - Create base Agent interface and classes
   - Implement Charlie (Chief of Staff) agent
   - Build agent communication system
   - Create agent status management

4. **Basic IDE**
   - Integrate Monaco Editor
   - Implement GitHub repository connection
   - Build file browser and navigation
   - Add basic file editing capabilities

### **Phase 1B: Agent Integration (Weeks 5-8)**
1. **Core Agents**
   - Implement Sergei (Infrastructure) agent
   - Implement Tessa (AI/Tech Ops) agent
   - Implement Ana (Analytics) agent
   - Build agent-specific data connections

2. **Data Integration**
   - Connect to Supabase APIs for metrics
   - Implement GitHub integration for repository data
   - Build basic monitoring and alerting
   - Create data visualization components

3. **Communication System**
   - Build agent chat interfaces
   - Implement inter-agent messaging
   - Create approval workflow system
   - Add notification and alert system

4. **Dashboard Views**
   - Create metrics dashboard
   - Build real-time data displays
   - Implement customizable layouts
   - Add export and sharing capabilities

### **Phase 1C: Polish & Integration (Weeks 9-12)**
1. **UI/UX Enhancement**
   - Refine visual design and interactions
   - Optimize performance and responsiveness
   - Add keyboard shortcuts and power-user features
   - Implement accessibility standards

2. **Advanced Features**
   - Enhanced AI code assistance
   - Advanced data filtering and search
   - Custom dashboard creation
   - User preferences and personalization

3. **Testing & Quality**
   - Comprehensive testing suite
   - Performance optimization
   - Security review and hardening
   - Documentation and help system

4. **Deployment & Monitoring**
   - Production deployment to Vercel
   - Monitoring and error tracking setup
   - Performance monitoring and optimization
   - User feedback collection system

---

## 🎨 Design System Specifications

### **Color Palette**
```css
:root {
  /* Primary Colors */
  --primary-blue: #0066CC;
  --primary-green: #00AA44;
  --primary-orange: #FF6600;
  
  /* Status Colors */
  --status-success: #22C55E;
  --status-warning: #F59E0B;
  --status-error: #EF4444;
  --status-info: #3B82F6;
  
  /* Neutral Colors */
  --gray-50: #F9FAFB;
  --gray-100: #F3F4F6;
  --gray-200: #E5E7EB;
  --gray-300: #D1D5DB;
  --gray-400: #9CA3AF;
  --gray-500: #6B7280;
  --gray-600: #4B5563;
  --gray-700: #374151;
  --gray-800: #1F2937;
  --gray-900: #111827;
}
```

### **Typography**
- **Primary Font**: Inter (clean, professional, excellent readability)
- **Code Font**: JetBrains Mono (optimized for code display)
- **Icon System**: Lucide React (consistent, modern icons)

### **Component Styling**
- **Cards**: Subtle shadows, rounded corners, clean borders
- **Buttons**: Primary (blue), secondary (gray), success (green), warning (orange), danger (red)
- **Forms**: Clear labels, helpful validation messages, accessible inputs
- **Navigation**: Clean, intuitive hierarchy with active states

---

## 🚀 Success Criteria for MVP

### **Core Functionality**
- [ ] User can authenticate with GitHub and connect repositories
- [ ] User can browse and edit code files with AI assistance
- [ ] Four core agents (Charlie, Sergei, Tessa, Ana) are functional
- [ ] Real-time data from Supabase and GitHub is displayed
- [ ] User can chat with agents and receive recommendations
- [ ] Basic approval workflow for agent suggestions works

### **User Experience**
- [ ] Platform is responsive on desktop and mobile
- [ ] Interface is intuitive without training
- [ ] Performance is smooth with <2 second load times
- [ ] Error handling is graceful with helpful messages
- [ ] Dark/light mode switching works properly

### **Technical Quality**
- [ ] Code is well-structured and maintainable
- [ ] Security best practices are implemented
- [ ] Platform scales to handle multiple concurrent users
- [ ] API integrations are robust with proper error handling
- [ ] Monitoring and logging are comprehensive

---

## 📋 Deliverables

### **Code Repository**
- Complete Next.js application with all source code
- Comprehensive README with setup instructions
- Environment configuration templates
- Deployment scripts and configuration

### **Documentation**
- Technical architecture documentation
- API integration guides
- User manual and feature documentation
- Troubleshooting and FAQ guides

### **Deployment Package**
- Production-ready deployment on Vercel
- Database schema and initial data setup
- Monitoring and alerting configuration
- Backup and security procedures

---

## 🎯 Alternative Implementation Approaches

### **Option 1: Full Custom Development (Recommended)**
- **Pros**: Complete control, optimal performance, custom features
- **Cons**: Longer development time, more complex maintenance
- **Best For**: Long-term strategic platform, unique requirements

### **Option 2: Low-Code Platform Foundation**
- **Platforms**: Retool, Bubble, OutSystems + custom components
- **Pros**: Faster initial development, built-in database management
- **Cons**: Platform limitations, vendor lock-in, customization constraints
- **Best For**: Rapid prototyping, proof of concept validation

### **Option 3: Open Source Foundation**
- **Base**: Extend existing IDE (VS Code Web) or dashboard framework (Grafana)
- **Pros**: Proven foundation, active community, extensive plugins
- **Cons**: Limited customization, architectural constraints
- **Best For**: Quick deployment with standard features

### **Recommendation**: Proceed with **Option 1 (Full Custom Development)** using the specifications above. The unique vision of RoundTable requires custom architecture that existing platforms cannot adequately support.

---

## 💡 Implementation Tips for AI Development Services

### **For Base44 / v0.dev / bolt.new:**
1. **Start with layout and navigation** - Build the shell first
2. **Focus on one agent at a time** - Implement Charlie first, then add others
3. **Use mock data initially** - Build UI components before complex integrations
4. **Prioritize real-time updates** - WebSocket connections are crucial for user experience
5. **Implement progressive enhancement** - Start with basic features, add complexity gradually

### **Key Technical Challenges to Address:**
1. **Real-time data synchronization** across multiple external APIs
2. **Agent communication protocol** design and implementation
3. **Permission and approval workflow** management
4. **Performance optimization** for large datasets and real-time updates
5. **Mobile responsiveness** for complex multi-panel layouts

### **Success Metrics to Track:**
- **Development Velocity**: Features completed per sprint
- **Code Quality**: Test coverage, error rates, performance metrics
- **User Experience**: Load times, responsiveness, usability feedback
- **Integration Reliability**: API uptime, data accuracy, sync performance

---

*This prompt provides a comprehensive foundation for building the RoundTable IDE Platform MVP. The specifications are designed to be implementable within a 3-month timeline while providing a solid foundation for future expansion.*