# CareerCopilot

CareerCopilot is an intelligent, AI-powered platform designed to streamline and automate your job search and application process. It helps you track applications, discover relevant opportunities, prepare for interviews, and manage your resumes, all in one place.

## ✨ Core Features

- **🤖 AI-Powered Resume Parsing:** Automatically upload and parse your resumes to extract key information like work experience, skills, and education.
- **📩 Automated Application Tracking:** Seamlessly sync job applications from your email (with Gmail integration) into a centralized dashboard.
- 📋 **Boards:** Visualize and manage your job application pipeline with a drag-and-drop Kanban board.
- **🔍 Intelligent Job Matching:** Discover new job opportunities that match your skills and experience.
- **🏢 Company Enrichment:** Get AI-generated insights and details about the companies you're applying to.
- **🎤 Interview Preparation:** Generate tailored interview questions and preparation briefs for specific roles and companies.
- **📊 Personalized Insights:** Get analytics on your application process to identify trends and improve your strategy.

## 🚀 Tech Stack

- **Framework:** [Next.js](https://nextjs.org/) (App Router)
- **Styling:** [Tailwind CSS](https://tailwindcss.com/) with [Shadcn UI](https://ui.shadcn.com/)
- **Database:** [Supabase](https://supabase.io/) (PostgreSQL)
- **Background Jobs & Workflows:** [Trigger.dev](https://trigger.dev/)
- **Serverless Functions:** [Cloudflare Workers](https://workers.cloudflare.com/)
- **AI & Machine Learning:** [OpenAI](https://openai.com/), [Google Gemini](https://ai.google.dev/), and various embedding models.
- **Deployment:** Vercel (Web), Cloudflare (Workers)

## 📂 Project Structure

This project is a monorepo managed with npm workspaces.

- `apps/web`: The main Next.js web application, containing the dashboard, UI components, and Trigger.dev task definitions.
- `apps/workers`: Cloudflare Workers for handling backend services and APIs.
- `packages/shared`: Shared TypeScript code, types, and utilities used across the monorepo.
- `supabase/migrations`: Database schema and migration files for Supabase.

## 🏁 Getting Started

To get a local copy up and running, follow these simple steps.

### Prerequisites

- Node.js (v20.x or later)
- npm or pnpm
- [Supabase CLI](https://supabase.com/docs/guides/cli)
- A Supabase project
- An OpenAI API Key
- A Trigger.dev account and API Key

### Installation & Setup

1. **Clone the repository:**

   ```sh
   git clone https://github.com/NeilMisra99/careercopilot.git
   cd careercopilot-app
   ```

2. **Install dependencies:**

   ```sh
   npm install
   ```

3. **Set up environment variables:** Create a `.env.local` file in the `apps/web` directory by copying the example:

   ```sh
   cp apps/web/.env.example apps/web/.env.local
   ```

   Fill in the required environment variables, including your Supabase, OpenAI, and Trigger.dev API keys.

4. **Run database migrations:** Link your local repository to your Supabase project and push the database migrations.

   ```sh
   supabase link --project-ref <your-project-id>
   supabase db push
   ```

5. **Run the development servers:** To run the web application and the Trigger.dev CLI concurrently, you can use the following command from the root directory:

   ```sh
   # You might need to set up a `dev` script in the root package.json using `concurrently`
   npm run dev:web
   ```

   In a separate terminal, run the Trigger.dev development server:

   ```sh
   npx trigger.dev@latest dev
   ```

Your application should now be running on `http://localhost:3000`.
