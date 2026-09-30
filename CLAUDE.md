# Clarity Portal: Project Memory (read this at the start of every session)

## What this project is

The Clarity Portal is a client portal for The Clarity Project, a high-performance coaching business.

The owner is not technical. Always explain things in very simple language, one step at a time, with no jargon.

## Hosting and live address

Hosted on Vercel. Team: theclarityproject. Project: clarity-portal-app.

The ONLY live website address is https://portal.theclarityproject.co.uk

GitHub is connected to Vercel. Pushing to main automatically deploys to PRODUCTION on that address.

Do NOT use the Vercel CLI. Do NOT ask the owner to run vercel login. It is not needed.

## Branch rules

main is the production branch. Pushing to main means the change goes live to real clients.

**DEFAULT:** make changes on main and push to main so they deploy to production.

**EXCEPTION:** only work on a separate branch when the owner explicitly says to use a branch. In that case, push only that branch (Vercel will build a preview copy for testing), never touch main, and give the owner the test address.

Never leave finished work sitting on a feature branch unless the owner asked for a branch.

Never delete branches, deployments, domains, files or environment variables without asking first.

## Things that must NOT be broken

The desktop experience is currently perfect. Any mobile change must sit inside a mobile-only media query (max-width: 768px) or be a safe fix that does not change how desktop looks.

Do not remove or change the diag import, the BottomTabBar behaviour, or the keyboard handling in ProtectedLayout.jsx. They were added on purpose to fix earlier keyboard problems.

Keep overflow-x: hidden on the body unless the owner approves removing it.

Do not change colours, fonts, wording, features or routes unless the task says so.

## How to work

Before changing anything, read the relevant files. Do not assume, check the code.

Do not guess. If something is unclear, stop and ask the owner ONE clear question in simple language.

Do not change anything unrelated to the task.

Always run npm run build and make sure it passes before pushing.

Do not add user-scalable=no or maximum-scale to the viewport tag, it harms accessibility.

## Summary format (give this at the end of EVERY task, in very simple language)

- **WHAT I CHANGED** (each file and what changed)
- **WHERE IT IS LIVE** (the exact address, or the test address if a branch was used)
- **WHAT I NEED TO CHECK** (simple numbered steps for the owner to test)
- **ANYTHING RISKY OR UNRESOLVED**
