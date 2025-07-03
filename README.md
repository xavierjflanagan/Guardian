
# Guardian

Guardian is an AI-powered healthcare application designed to help users understand and manage their medical records. This project is built with Next.js, TypeScript, and Tailwind CSS, and it leverages various AI models for tasks like OCR and data analysis.

## Table of Contents

- [Project Overview](#project-overview)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
- [To-Do List](#to-do-list)

## Project Overview

The goal of Guardian is to provide a user-friendly interface for individuals to upload, analyze, and comprehend their health-related documents. By using advanced AI technologies, Guardian aims to empower users with actionable insights into their health data.

## Architecture

This project follows a standard Next.js application structure. The front-end is built with React and styled using Tailwind CSS, while the back-end logic is handled by Next.js API routes. The application is designed to be deployed on Vercel.

### Filing System

```
/Users/xflanagan/Documents/GitHub/Guardian/
├───.gitattributes
├───.gitignore
├───.neon
├───README.md
├───chatgpt_response.txt
├───Most_recent_progress_update
├───guardian-web/
│   ├───.env.local
│   ├───.gitignore
│   ├───middleware.ts
│   ├───next-env.d.ts
│   ├───next.config.mjs
│   ├───package-lock.json
│   ├───package.json
│   ├───postcss.config.mjs
│   ├───tailwind.config.ts
│   ├───tsconfig.json
│   ├───app/
│   │   ├───globals.css
│   │   ├───layout.tsx
│   │   └───page.tsx
│   └───public/
│       └───vercel.svg
└───node_modules/
```

## Getting Started

To get started with the development of Guardian, you'll need to have Node.js and npm (or yarn) installed on your machine. Follow these steps to get the project up and running:

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

4.  **Run the development server:**

    ```bash
    npm run dev
    ```

This will start the development server, and you can view the application by opening your web browser and navigating to `http://localhost:3000`.

## To-Do List

- [ ] **Set up the database:** Choose a database provider (e.g., Neon, Supabase) and create the necessary tables for storing user data and medical records.
- [ ] **Implement file uploads:** Create a feature that allows users to upload their medical documents (e.g., PDFs, images) to the application.
- [ ] **Integrate OCR:** Use an OCR service (e.g., Google Cloud Vision, Tesseract.js) to extract text from the uploaded documents.
- [ ] **Develop the multi-agent pipeline:** Implement the LangGraph/LlamaIndex pipeline for processing and analyzing the extracted text.
- [ ] **Build the user interface:** Create the necessary UI components for displaying the user's medical data, including a timeline view and a data table.
- [ ] **Implement user authentication:** Set up Clerk or a similar authentication service to manage user accounts and secure the application.
- [ ] **Deploy the application:** Deploy the application to Vercel and set up a CI/CD pipeline for automatic deployments.
