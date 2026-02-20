# Developer Onboarding Guide: AidSec.ch

Welcome to the AidSec team! This guide will help you set up your development environment, understand the codebase, and get started with your first tasks.

---

## 1. Onboarding Requirements Analysis

As a developer at AidSec, you are responsible for maintaining and enhancing our high-security landing page for legal and medical professionals.

- **Key Knowledge Areas**:
  - Semantic HTML & Vanilla CSS/JS.
  - React (specifically for the Hero animation).
  - Web Security (CSP, Security Headers).
  - Netlify ecosystem (Forms, Functions, Redirects).
- **Milestone Expectations**:
  - **Day 1**: Local environment setup and successful dev build.
  - **Day 3**: Small CSS/HTML adjustment or placeholder update.
  - **Week 1**: First feature update in the React Hero component or Netlify Function.

## 2. Development Environment Setup Guide

To get started, ensure you have **Node.js (v18+)** and **npm** installed.

### Step-by-Step Setup

1. **Clone the Repository**:
   ```bash
   git clone [repository-url]
   cd aidsec.ch
   ```
2. **Install Dependencies**:
   ```bash
   npm install
   ```
3. **Configure Environment Variables**:
   In this project, configuration is handled via `config.json`.

   ```bash
   cp config.example.json config.json
   ```

   _Edit `config.json` with your local or staging values._

4. **Initialize Resources**:

   ```bash
   npm run prepare-fonts  # Download and prepare local fonts
   npm run fill           # Replace placeholders in project files
   ```

5. **Start Dev Server**:
   ```bash
   npm run dev
   ```
   Open `http://localhost:5173` to see the site.

## 3. Project and Codebase Overview

AidSec.ch is a **hybrid static site**. While the main pages are static HTML, the hero section is a React application powered by `vite`.

### Core Architecture

- **Static Content**: `index.html`, `impressum.html`, etc.
- **React Hero**: Located in `js/hero-app.jsx`. Built to `js/dist/hero-app.js`.
- **Styles**: Categorized in `css/` (main, layout, components).
- **Backend Logic**: Netlify Functions in `netlify/functions/`.

### Tech Stack

- **Build Tool**: Vite
- **Animations**: Motion (formerly Framer Motion)
- **Deployment**: Netlify

## 4. Development Workflow Documentation

- **Branching Strategy**: Use `feat/name` or `fix/name`. Merge into `main` via Pull Request.
- **Code Quality**:
  - `npm run lint`: Checks styling and React rules.
  - `npm run format`: Automatically fixes file formatting.
- **Testing**:
  - Currently, testing is focused on **Security Headers**.
  - Run `npm run verify-headers` after deployment to ensure high security ratings.

## 5. Team Communication and Collaboration

- **Primary Channel**: Slack/Teams (Check the "AidSec-Dev" channel).
- **Issue Tracking**: GitHub Issues.
- **Escalation**: For critical production issues, contact the System Admin.

## 6. Learning Resources and Training Materials

- **React 19**: [Beta/New Docs](https://react.dev)
- **Vite Documentation**: [vitejs.dev](https://vitejs.dev)
- **Netlify Security Headers**: Read `_headers` to understand our strict CSP policy.
- **Motion API**: [motion.dev](https://motion.dev) for hero animations.

## 7. First Tasks and Milestones

Start with these "Good First Issues":

1. **Style Polish**: Update the accent gold color in `css/main.css`.
2. **Static Content**: Add a new FAQ entry in `index.html`.
3. **React Adjustment**: Modify the text delay in `js/BlurText.jsx`.

## 8. Security and Compliance Training

Security is our product. Follow these rules:

- **No External JS/CSS**: All resources must be self-hosted (run `npm run prepare-fonts`).
- **CSP Integrity**: Never broaden the Content Security Policy without sign-off.
- **Placeholder Safety**: Never commit sensitive keys in `config.json`; use placeholders.

## 9. Tools and Resources Access

Ensure you have access to:

- **GitHub Repository**
- **Netlify Dashboard** (for form submissions and logs)
- **VPN** (if required for staging environments)

## 10. Feedback and Continuous Improvement

We value your input!

- If you find a step missing in this onboarding guide, please update it.
- Join the bi-weekly sync to share improvement ideas for the development workflow.
