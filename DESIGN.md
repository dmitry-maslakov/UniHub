---
name: UniHub
description: A hub for learning materials, read by students and their AI agents
colors:
  petrol: "#006e73"
  petrol-dark-scheme: "#5fb1b5"
  petrol-light: "#d6edee"
  ink: "#171b1c"
  paper: "#ffffff"
  gray-dimmed: "#717676"
  gray-border: "#d3d9d9"
  night: "#161a1a"
  night-surface: "#232728"
  night-text: "#e3e9e9"
  night-dimmed: "#a7acac"
typography:
  display:
    fontFamily: "Onest Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.015em"
  headline:
    fontFamily: "Onest Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.35
  body:
    fontFamily: "Onest Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Onest Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.45
  code:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.875rem"
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  xxl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.petrol}"
    textColor: "{colors.paper}"
    rounded: "{rounded.md}"
    height: "42px"
  button-default:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "42px"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "42px"
  callout:
    backgroundColor: "{colors.petrol-light}"
    rounded: "{rounded.lg}"
    padding: "24px"
---

# Design System: UniHub

## Overview

**Creative North Star: "The Quiet Reading Room"**

A calm, well-lit room where everything has its place: one narrow column of content, generous space around it, and a single petrol accent that marks what can be done. The interface stays out of the way of the courses it holds; precision and restraint carry the brand, not decoration.

Density is low: one task per page, short explanations under each heading, and actions that say what they do. The look is the same in light and dark, the accent lightened for the dark scheme.

**Key Characteristics:**

- One accent, petrol, on actions and focus only; everything else is neutral gray tinted toward it.
- One face, Onest, in four roles; monospace only for codes and keys.
- An 8 px rhythm with 48 px between sections and a 40rem column.
- Flat surfaces; one hairline under the header and between list rows.

## Colors

Cool neutrals with a single restrained petrol accent (oklch hue 200).

### Primary

- **Petrol** (#006e73): primary buttons, links, focus rings and the selection in the light scheme; white text on it (6:1).
- **Petrol for dark** (#5fb1b5): the same roles in the dark scheme, with dark text on it (7:1).
- **Petrol wash** (#d6edee): the one tinted surface, the callout that shows a new API key once.

### Neutral

- **Ink** (#171b1c): text in the light scheme.
- **Paper** (#ffffff): the light page.
- **Dimmed** (#717676): secondary text in the light scheme (4.6:1 on paper).
- **Hairline** (#d3d9d9): the header's and list rows' single borders.
- **Night** (#161a1a), **Night surface** (#232728), **Night text** (#e3e9e9), **Night dimmed** (#a7acac): the dark scheme's page, inputs, text and secondary text.

### Named Rules

**The One Voice Rule.** Petrol marks what can be done and where focus is. It is never a background for a whole region, never a gradient, never decoration. Red appears only for errors and for revoking.

## Typography

**Body Font:** Onest Variable (with ui-sans-serif, system-ui)
**Mono Font:** ui-monospace, for device codes and API keys only

**Character:** a plain, open grotesque with Latin and Cyrillic, so course names in either script set the same; one family carries every role through size and weight.

### Hierarchy

- **Display** (600, 1.75rem, 1.25): a page's one heading.
- **Headline** (600, 1.25rem, 1.35): a section's heading.
- **Body** (400, 1rem, 1.55): text, at most 60ch.
- **Label** (500, 0.875rem): field labels, navigation, metadata.

### Named Rules

**The No Eyebrow Rule.** No labels above headings; the heading and the one line under it say what the page is for.

## Layout

A single column of 40rem (25rem for sign-in and its kin), centered, with 48 px above the page heading. Spacing steps are 8, 12, 16, 24, 32 and 48 px: tight inside a group, 48 px between sections. The header is 64 px, its content held to 60rem. Under 48em the navigation moves into a drawer behind a burger.

## Elevation & Depth

Flat. Depth comes from the hairline under the header and from overlays alone: menus and the confirm dialog take Mantine's default shadow. No shadows at rest.

## Shapes

8 px corners on controls, 12 px on the one callout, round avatars. No pills but the avatar.

## Components

### Buttons

- **Shape:** 8 px corners, 42 px tall.
- **Primary:** petrol, one per view, for the page's main action.
- **Default:** a bordered neutral for the second choice (Deny, Continue with Google).
- **Subtle:** text-only for quiet actions (Done, Revoke in red).

### Inputs

- **Style:** 42 px, 8 px corners, a hairline border, the label above and help text under it.
- **Focus:** the petrol focus ring.
- **Error:** red text under the field, in words that say how to fix it.

### Navigation

Header links in the label size, dimmed until hovered or current. The user's menu sits behind their initials, at the right.

### Device code

The one large type on the site: the code in monospace at 2.25rem with wide tracking, so it can be read against a screen across a room.

## Do's and Don'ts

### Do:

- **Do** keep one primary button per view.
- **Do** put a short line under every page heading saying what the page is for.
- **Do** answer every error with what happened and what to do next.

### Don't:

- **Don't** nest cards, or put content in cards at all; group by space.
- **Don't** use gradients, glass, emoji or icons as decoration.
- **Don't** add a second accent color.
