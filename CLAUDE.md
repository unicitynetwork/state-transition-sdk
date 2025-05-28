# STATE-TRANSITION-SDK Development Guidelines

## Build Commands
- Build project: `npm run build` (creates TypeScript output in lib directory)
- Type checking: `npm run build:check` 
- Lint code: `npm run lint` (fix automatically with `npm run lint:fix`)
- Run all tests: `npm run test`
- Run single test: `npx jest tests/path/to/TestFile.ts`
- Manual testing: Use CLI tools in `cli/` directory (e.g., `./cli/mint.sh`, `./cli/send.sh`)

## Code Style Guidelines
- **Modules**: ES modules with .js extensions in imports (e.g., `import { X } from './Y.js'`)
- **Typing**: TypeScript with strict typing; interfaces prefixed with 'I' (e.g., `ISerializable`)
- **Naming**: camelCase for variables/methods, PascalCase for classes, UPPER_CASE for static constants
- **Imports**: Organized by groups (builtin → external → internal) with newlines between groups
- **Interfaces**: Define contracts (like `ISerializable` with `toCBOR()` and `toJSON()` methods)
- **Error Handling**: Use async/await with try/catch; include specific error messages
- **Code Organization**: Follows domain-driven design with folders by feature (token, address, etc.)

## Project Structure
- TypeScript source: `src/` directory with domain-specific subfolders
- Entry point: `src/index.ts` exporting public API
- Tests: Located in `tests/` directory with *Test.ts naming pattern
- CLI tools: Scripts in `cli/` directory for common operations
- Documentation: Protocol spec in `unicity-token-protocol-spec.md`

## External Dependencies
- Main dependency: `@unicitylabs/commons` for shared functionality