# Welcome to your Lovable project

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Open your project in the [Lovable editor](https://lovable.dev) and keep building.

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: connect the project to GitHub and every change made in Lovable is committed straight to your repository.
- **Full ownership**: this code is yours. Push to your repository and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

### Troubleshooting: Missing Native Bindings (Windows)

If you encounter an error like `Cannot find native binding` (e.g., for `rolldown` or `oxc-parser`) when running `npm run dev`, it is likely because your Node.js version is slightly older than what Vite 8 requires (v20.19+ or v22.12+). Because of this engine mismatch, npm skips downloading critical optional dependencies on Windows.

To fix this temporarily without updating Node, manually install the missing bindings:

```sh
npm i @rolldown/binding-win32-x64-msvc@1.2.1 --no-save
npm i @oxc-parser/binding-win32-x64-msvc --no-save
npm run dev
```

_(Note: The best long-term fix is to update your Node.js version to v22 LTS)._

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS
