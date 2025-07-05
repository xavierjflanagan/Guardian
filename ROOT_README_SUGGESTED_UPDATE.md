# Guardian

Guardian is an AI-powered healthcare application designed to help users understand and manage their medical records. This project is built with Next.js, TypeScript, and Tailwind CSS, and it leverages various AI models for tasks like OCR and data analysis.

> **Patient-owned healthcare data platform** - Secure, portable, and accessible medical records management

[![Status](https://img.shields.io/badge/Status-In%20Development-orange)](docs/ROADMAP.md)
[![Documentation](https://img.shields.io/badge/Documentation-Complete-green)](docs/README.md)

## 📚 **Documentation**

For comprehensive documentation, guides, and detailed project information:

**→ [View Complete Documentation](docs/README.md)**

**Quick Links:**
- 🚀 [Quick Start Guide](docs/guides/SETUP.md)
- 🔌 [API Documentation](docs/api/endpoints.md) 
- 🚀 [Deployment Guide](docs/guides/deployment.md)
- 🐛 [Troubleshooting](docs/guides/troubleshooting.md)
- 📋 [Current Tasks](docs/management/TASKS.md)
- 🗺️ [Project Roadmap](docs/ROADMAP.md)

---

## Table of Contents

- [Project Overview](#project-overview)
- [Architecture](#architecture)
- [Code Quality and AI Collaboration Policy](#code-quality-and-ai-collaboration-policy)
- [Getting Started](#getting-started)
- [Current Status](#current-status)

## Project Overview

The goal of Guardian is to provide a user-friendly interface for individuals to upload, analyze, and comprehend their health-related documents. By using advanced AI technologies, Guardian aims to empower users with actionable insights into their health data.

**Vision:** Empower individuals to take meaningful control of their healthcare data by providing a secure, patient-owned, centralized health platform that enables seamless access, portability, and meaningful insights into their medical history.

## Architecture

This project follows a standard Next.js application structure with a modular, scalable design optimized for solo development.

**Core Stack:** Next.js • Supabase • Vercel • TypeScript • Tailwind CSS

### Current Filing System

```
/Users/xflanagan/Documents/GitHub/Guardian/
├───README.md                 # This file - project overview
├───docs/                     # Comprehensive documentation
│   ├───README.md            # Documentation hub
│   ├───api/                 # API documentation
│   ├───guides/              # Setup and deployment guides
│   ├───architecture/        # Technical architecture
│   └───management/          # Project management
├───guardian-web/            # Main application
│   ├───app/                 # Next.js app directory
│   ├───public/              # Static assets
│   ├───package.json         # Dependencies
│   └───[config files]
└───[other project files]
```

### Database, Storage, and Auth Decision

Guardian uses **Supabase** (Postgres + Auth + Storage) to maximize development speed for a solo developer while preserving an easy migration path to other solutions if future scale demands it.

**See:** [Stack Decision Rationale](docs/decisions/0001-supabase-vs-neon.md) for full details.

## Code Quality and AI Collaboration Policy

> **Standard of Excellence:**
> All code, whether written by AI or human contributors, should reflect the wisdom, experience, and best practices of a team of senior software engineers. Every decision should be made thoughtfully, with maintainability, scalability, and clarity in mind, as if the codebase were built by an amazing, highly experienced team.

### Core Principles

#### Clarity and Simplicity
- Write code that is easy to understand. Prioritize readability over cleverness.
- Add comments only when necessary to explain *why* a particular piece of code exists, not *what* it does.

#### File and Directory Organization
- Maintain the existing Next.js project structure.
- Create new files and directories in a logical and organized manner.
- Before creating a new file, review the existing file structure to see if the new code belongs in an existing file.
- **`lib/` (Library):** Use for more substantial, application-specific logic or integrations (e.g., database functions, API client wrappers, authentication logic).
- **`utils/` (Utilities):** Use for smaller, generic, and often pure helper functions (e.g., date formatting, string manipulation, validation).

#### Don't Repeat Yourself (DRY)
- Avoid duplicating code. Instead, create reusable components, functions, or classes.
- Before writing new code, check if similar functionality already exists that can be reused or generalized.

#### Regular Refactoring
- Periodically, development should pause to review and refactor the codebase.
- Refactoring includes removing unused code, simplifying complex logic, and improving the overall structure of the code.
- This ensures the project remains maintainable as it grows.

#### Descriptive Naming
- Use clear and descriptive names for files, folders, variables, functions, and components.
- Names should reflect the purpose of the code they represent. For example, a function that gets user data should be named `getUserData()`.

#### Commit Message Standards
- Write clear and concise commit messages.
- A good commit message should summarize the change and its purpose.

## Getting Started

To get started with the development of Guardian, follow these steps:

### Prerequisites
- Node.js (LTS version recommended)
- npm or yarn package manager
- Git for version control

### Quick Start

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/xavierjflanagan/Guardian.git
    ```

2.  **Navigate to the project directory:**
    ```bash
    cd Guardian/guardian-web
    ```

3.  **Install the dependencies:**
    ```bash
    npm install
    ```

4.  **Set up environment variables:**
    ```bash
    cp .env.example .env.local
    # Edit .env.local with your Supabase credentials
    ```

5.  **Run the development server:**
    ```bash
    npm run dev
    ```

6.  **Open your browser:**
    Navigate to `http://localhost:3000` to view the application.

**For detailed setup instructions:** See [Developer Setup Guide](docs/guides/SETUP.md)

## Current Status

**Phase:** MVP Prototype Development (70% Complete)

**Recent Progress:**
- ✅ Authentication & user management (Supabase Auth)
- ✅ File upload & storage (Supabase Storage)
- ✅ Project documentation & architecture
- 🚧 Document processing pipeline (In Progress)
- 🚧 Data visualization dashboard (Planning)

**Current Priorities:**
1. Implement document processor endpoint
2. Build OCR and AI analysis pipeline
3. Create data visualization components
4. Prepare for beta user testing

**See:** [Detailed Progress Log](docs/PROGRESS_LOG.md) | [Current Tasks](docs/management/TASKS.md) | [Project Roadmap](docs/ROADMAP.md)

---

## Contributing

1. Review [current tasks](docs/management/TASKS.md) for priorities
2. Follow our [code quality standards](#code-quality-and-ai-collaboration-policy)
3. Check the [comprehensive documentation](docs/README.md) for detailed guides
4. Update documentation after significant changes

## Support

- **Setup Issues:** [Troubleshooting Guide](docs/guides/troubleshooting.md)
- **API Questions:** [API Documentation](docs/api/endpoints.md)
- **Deployment:** [Deployment Guide](docs/guides/deployment.md)
- **General Questions:** [Complete Documentation](docs/README.md)

---

**For comprehensive project information, detailed guides, and technical documentation, visit [docs/README.md](docs/README.md)**