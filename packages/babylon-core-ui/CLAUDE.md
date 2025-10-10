# Claude AI Assistant Instructions for babylon-core-ui

This document provides specific instructions for AI assistants working on the `@babylonlabs-io/core-ui` package.

## 🎯 Primary Responsibilities

### 1. Storybook Story Generation & Maintenance

When creating or modifying components, **always** ensure accompanying Storybook stories are created or updated:

#### Story Requirements
- Every component **must** have a `.stories.tsx` file in the same directory
- Stories must use the `autodocs` tag for automatic documentation generation
- Include comprehensive `argTypes` with descriptions for all props
- Provide multiple story variants to demonstrate different use cases
- Use meaningful story names that describe the variant (e.g., `Default`, `Positions`, `HighNumberRank`)

#### Story Template
```typescript
import type { Meta, StoryObj } from "@storybook/react";
import { YourComponent } from "./YourComponent";

const meta: Meta<typeof YourComponent> = {
  title: "Components/Category/Subcategory/YourComponent",
  component: YourComponent,
  tags: ["autodocs"],
  parameters: {
    layout: "centered", // or "fullscreen", "padded"
  },
  argTypes: {
    propName: {
      control: { type: "select" }, // or "text", "boolean", "number", etc.
      options: ["option1", "option2"],
      description: "Clear description of what this prop does",
      defaultValue: "option1",
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    propName: "value",
  },
};

// Add more variants to showcase different use cases
export const Variant: Story = {
  render: () => <YourComponent prop="value" />,
};
```

#### Category Naming Convention
Use the existing hierarchy visible in current stories:
- `Components/Data Display/...`
- `Components/Inputs/Actions/...`
- `Components/Feedback/...`
- etc.

### 2. Documentation Generation

- All components must have meaningful JSDoc comments
- Props should be documented with descriptions
- Complex interfaces should have usage examples in comments
- The `autodocs` tag in stories automatically generates component documentation

### 3. Post-Change Verification

After making any changes to the codebase, **always** run the following commands in sequence:

```bash
npm run build
```

If the build succeeds, then run:

```bash
nx run @babylonlabs-io/core-ui:lint
```

**Fix all errors** that appear from these commands before considering the task complete. Do not leave the codebase in a broken state.

### 4. Testing Changes in Storybook

After creating or modifying components and stories:

```bash
npm run storybook
```

Verify that:
- The component renders correctly in all story variants
- Controls work as expected
- Documentation is properly generated
- No console errors appear

## 📋 Development Guidelines

### Component Creation Checklist
- [ ] Create component file with proper TypeScript types
- [ ] Add comprehensive JSDoc comments
- [ ] Create corresponding `.stories.tsx` file with multiple variants
- [ ] Include `autodocs` tag for automatic documentation
- [ ] Define detailed `argTypes` for all props
- [ ] Export component from appropriate `index.ts`
- [ ] Run `npm run build` to verify no build errors
- [ ] Run `nx run @babylonlabs-io/core-ui:lint` to verify no linting errors
- [ ] Test in Storybook with `npm run storybook`

### Component Modification Checklist
- [ ] Update component implementation
- [ ] Update or add stories to reflect changes
- [ ] Update JSDoc comments if props changed
- [ ] Run `npm run build` to catch any breaking changes
- [ ] Run `nx run @babylonlabs-io/core-ui:lint` to maintain code quality
- [ ] Verify changes in Storybook

### Story Quality Standards
1. **Multiple Variants**: Create at least 2-3 story variants per component
2. **Interactive Controls**: Use appropriate control types for props
3. **Visual Context**: Wrap components in appropriate containers/backgrounds when needed
4. **Edge Cases**: Include stories for edge cases (empty states, long text, etc.)
5. **Accessibility**: Consider and document accessibility features

## 🔧 Available Commands

```bash
# Development
npm run dev              # Starts Storybook dev server on port 6006
npm run storybook       # Same as dev

# Building
npm run build           # Build the library
npm run build-storybook # Build static Storybook

# Code Quality
nx run @babylonlabs-io/core-ui:lint  # Run ESLint
npm run format                        # Format code with Prettier

# Watching
npm run watch           # Watch mode for development
```

## 🎨 Styling Guidelines

- Use Tailwind CSS classes for styling
- Follow existing component patterns for consistency
- Use the design tokens from the tailwind config
- Components should be responsive by default

## 🚫 Important Notes

- **Never skip story generation** - Stories are benign if they fail and serve as living documentation
- **Always verify build and lint** - Broken builds block other developers
- **Document as you go** - Good documentation prevents future confusion
- **Follow existing patterns** - Check similar components for consistency

## 📦 This Package

`@babylonlabs-io/core-ui` is a React component library for Babylon Labs applications. It uses:
- **React 18.3.1** with TypeScript
- **Tailwind CSS** for styling
- **Storybook** for component development and documentation
- **Vite** for building
- **Nx** for monorepo management

## 🤖 Automation Philosophy

Story generation and documentation are easily automated tasks that should be done proactively. The benefits far outweigh the minimal effort required:
- Stories serve as visual regression tests
- Auto-generated docs help other developers
- Examples demonstrate proper usage
- If something breaks, it's caught early in an isolated environment

