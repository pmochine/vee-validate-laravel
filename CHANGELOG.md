# Changelog

## 1.0.7

This is the last version. The package is no longer developed. vee-validate 3 and 4 do not need it. The README shows how they read Laravel errors with `setErrors`.

### Fixed

- `$addLaravelErrors` stores each error under `field`. Since 1.0.4, it stored the errors under `key`. Then `errors.has('name')` and `errors.first('name')` did not find them, and templates showed no message.

### Changed

- The package contains the MIT license again, with the copyright notice of the original package by Robert Glyn Williams.
- The package contains only `src/`, `README.md`, `LICENSE` and `package.json`. Before, it also contained `.eslintrc.js`.
- The README shows how to use Laravel errors with vee-validate 3 and 4, and it lists the known issues of 1.x.
- Development: lint with ESLint 9 and eslint-config-avidofood 4, tests with Vitest, CI on GitHub Actions. The development tools need Node.js 22.12 or newer. The published file has no Node.js requirement.

## 1.0.6 and older

See the git history.
