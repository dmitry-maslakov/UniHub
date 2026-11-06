# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Students who follow courses spread over the portals their school uses, and the AI agents (MCP clients) they let read those courses for them. Admins of a hub set courses up and decide who reads which; they use the API for now.

## Product Purpose

UniHub is a hub for learning materials: connectors bring in courses, posts and files from any portal, processors turn files into readable text, and students and AI agents read and search it all over REST and MCP. The web app is where a student signs in, approves a screen's sign-in by QR code, and gives agents API keys; course reading and search come next.

## Positioning

One place, and one account, for the materials of every course, built so an AI agent reads them as the student does: the same courses, the same limits, revoked in one click.

## Operating Context

- Students open it on a laptop and on a phone, often in a hurry between classes; a shared computer or a TV signs in by a QR code a signed-in phone approves.
- Agents connect with an API key today, and by OAuth later (claude.ai, Claude Desktop, ChatGPT).
- The web app and the API share one origin, served by the hub itself.

## Capabilities and Constraints

- Sign-in: email and password with a confirmed email, Google when the hub has it set up, sessions by cookie. What outlasts a session (an API key, approving a screen) needs one signed in within a day.
- API keys expire after 90 days; a new password revokes them all.
- UI text is English only for now.
- A generic hub: no school, portal or deployment is named anywhere in the product.

## Brand Commitments

- Modern, airy and minimal; nothing that reads as generated filler (owner, 2026-11-06).
- Light and dark, chosen by the system until the user picks one.

## Evidence on Hand

None: no testimonials, metrics or customers. Don't invent any.

## Product Principles

- The student's account is the only key: agents act as the student, never beyond them.
- Say what happened and what to do next, in the student's words, never a raw error.
- Security steps explain themselves (why a fresh sign-in, why to check a code).

## Accessibility & Inclusion

WCAG 2.2 AA: text contrast, labelled fields, keyboard use, visible focus, targets of at least 24 px.
