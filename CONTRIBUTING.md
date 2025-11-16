# Contributing to Coolify Deploy Bot

Thank you for your interest in contributing to Coolify Deploy Bot! This document provides guidelines and instructions for contributing.

## Code of Conduct

Be respectful, inclusive, and considerate of others. We're all here to build something useful for the community.

## Getting Started

### Prerequisites

- Node.js 20 or higher
- npm or yarn
- Git

### Local Development Setup

1. Fork and clone the repository:

```bash
git clone https://github.com/your-username/coolify-deploy-bot.git
cd coolify-deploy-bot
```

2. Install dependencies:

```bash
npm install
```

3. Make your changes in the `src/` directory

4. Build the action:

```bash
npm run build
```

This compiles TypeScript to JavaScript in the `dist/` directory using `@vercel/ncc`.

## Development Workflow

### Making Changes

1. Create a new branch for your feature/fix:

```bash
git checkout -b feature/your-feature-name
```

2. Make your changes in `src/index.ts` or other source files

3. Format your code:

```bash
npm run format
```

4. Lint your code:

```bash
npm run lint
```

5. Build and test:

```bash
npm run build
```

### Testing Your Changes

To test your changes locally:

1. In your test repository, reference your local action:

```yaml
- uses: ./path/to/your/local/coolify-deploy-bot
  with:
    coolify_base_url: ${{ secrets.COOLIFY_BASE_URL }}
    # ... other inputs
```

2. Or push to your fork and reference it:

```yaml
- uses: your-username/coolify-deploy-bot@your-branch
  with:
    # ... inputs
```

### Commit Guidelines

Use clear, descriptive commit messages:

- `feat:` for new features
- `fix:` for bug fixes
- `docs:` for documentation changes
- `refactor:` for code refactoring
- `test:` for adding tests
- `chore:` for maintenance tasks

Examples:
```
feat: add support for multiple deployment environments
fix: handle missing FQDN in deployment response
docs: update README with troubleshooting section
```

## Pull Request Process

1. Update documentation if needed (README.md, comments, etc.)
2. Ensure your code builds successfully (`npm run build`)
3. Commit both source and `dist/` changes
4. Push to your fork
5. Create a Pull Request with a clear description of changes

### PR Checklist

- [ ] Code builds successfully
- [ ] Changes are documented
- [ ] Commit messages follow guidelines
- [ ] `dist/` folder is updated and committed
- [ ] No linting errors

## Project Structure

```
coolify-deploy-bot/
├── src/
│   └── index.ts          # Main action logic
├── dist/
│   └── index.js          # Compiled output (must be committed!)
├── .github/
│   └── workflows/
│       └── coolify-deployment.yml  # Example workflow
├── action.yml            # Action metadata
├── package.json          # Dependencies and scripts
├── tsconfig.json         # TypeScript config
└── README.md
```

## Key Implementation Details

### TypeScript to JavaScript Compilation

We use `@vercel/ncc` to compile TypeScript and all dependencies into a single `dist/index.js` file. This is required for GitHub Actions.

**Important**: Always commit the `dist/` folder after building!

### Action Inputs/Outputs

Defined in `action.yml`. When adding new inputs or outputs:

1. Add to `action.yml`
2. Update `src/index.ts` to use them
3. Document in README.md
4. Build and commit

### API Integration

The action queries Coolify's API at:
- `/api/v1/deployments/applications/{uuid}` - List deployments

See [Coolify API docs](https://coolify.io/docs/api) for details.

## Common Tasks

### Adding a New Input

1. Add to `action.yml`:
```yaml
inputs:
  new_input:
    description: 'Description of the input'
    required: false
    default: 'default-value'
```

2. Use in `src/index.ts`:
```typescript
const newInput = core.getInput('new_input', { required: false });
```

3. Document in README.md

4. Build and commit

### Handling API Changes

If Coolify's API changes:

1. Update the `CoolifyDeployment` interface in `src/index.ts`
2. Update the fetch/parsing logic
3. Test thoroughly
4. Document breaking changes

## Questions or Issues?

- Open an issue for bugs or feature requests
- Start a discussion for questions
- Tag maintainers if urgent

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

## Thank You!

Your contributions help make self-hosting easier for everyone!
