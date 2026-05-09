# Contributing to Jira MCP Server

First off, thank you for considering contributing to Jira MCP Server! 🎉

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment for everyone.

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check existing issues to avoid duplicates.

When creating a bug report, include:

- **Clear title** describing the issue
- **Steps to reproduce** the behaviour
- **Expected behaviour** vs **actual behaviour**
- **Environment details** (Node.js version, OS, etc.)
- **Error messages** or logs if applicable

### Suggesting Features

Feature suggestions are welcome! Please include:

- **Use case** - Why is this feature needed?
- **Proposed solution** - How should it work?
- **Alternatives considered** - Other approaches you've thought about

### Pull Requests

1. **Fork** the repository
2. **Create a branch** for your feature (`git checkout -b feature/amazing-feature`)
3. **Make your changes**
4. **Test** your changes thoroughly
5. **Commit** with clear messages (`git commit -m 'Add amazing feature'`)
6. **Push** to your branch (`git push origin feature/amazing-feature`)
7. **Open a Pull Request**

## Development Setup

### Prerequisites

- Node.js 18 or higher
- npm or yarn
- A Jira Cloud instance for testing

### Getting Started

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/jira-mcp.git
cd jira-mcp

# Install dependencies
npm install

# Build (type-check → bundle → minify)
npm run build

# Run tests
npm test

# Test locally as MCP server
node dist/index.js --help
```

### Testing Your Changes

1. Create a `.vscode/mcp.json` with your test credentials
2. Restart VS Code or the MCP server
3. Test the tools through your AI assistant

## Coding Guidelines

### TypeScript

- Use TypeScript for all new code
- Enable strict mode
- Add proper type annotations

### Code Style

- Use 2-space indentation
- Use semicolons
- Use double quotes for strings
- Add JSDoc comments for public functions

### Naming Conventions

- `camelCase` for variables and functions
- `PascalCase` for types and interfaces
- `SCREAMING_SNAKE_CASE` for constants
- Prefix tool names with `jira_`

### Error Handling

- Always catch and handle errors appropriately
- Return structured error responses using `errorToResult()`
- Never expose sensitive information in error messages

## Adding New Tools

When adding a new tool:

1. Choose the appropriate tool file in `src/tools/` (or create a new one)
2. Register it using `server.registerTool()`
3. Provide a clear `title`, `description`, and `annotations`
4. Define the `inputSchema` using Zod
5. Use the `withClient()` wrapper for automatic auth + error handling
6. Update the README.md with documentation

Example:

```typescript
import { READ_ONLY } from "../annotations.js";
import { withClient } from "../client.js";

server.registerTool(
  "jira_new_tool",
  {
    title: "New Tool",
    description: "Description of what this tool does and when to use it.",
    annotations: READ_ONLY, // or WRITE_CREATE, WRITE_IDEMPOTENT, DESTRUCTIVE
    inputSchema: z.object({
      param1: z.string().min(1).describe("Description of param1"),
      param2: z.number().optional().describe("Optional param2"),
    }),
  },
  withClient(async (client, _auth, { param1, param2 }) => {
    const response = await client.get(`/rest/api/3/example/${param1}`);
    return response.data;
  })
);
```

### Annotation Presets

| Preset | Use When |
|--------|----------|
| `READ_ONLY` | Tool only reads data, no side effects |
| `WRITE_CREATE` | Tool creates new resources (not idempotent) |
| `WRITE_IDEMPOTENT` | Tool updates/sets state (safe to retry) |
| `DESTRUCTIVE` | Tool deletes or removes resources |

## Commit Messages

Use clear and descriptive commit messages:

- `feat: Add worklog support` - New features
- `fix: Handle null response from API` - Bug fixes
- `docs: Update README with OAuth instructions` - Documentation
- `refactor: Extract auth logic to separate module` - Code refactoring
- `chore: Update dependencies` - Maintenance tasks

## Questions?

Feel free to open an issue for any questions or discussions!

Thank you for contributing! 🙏
