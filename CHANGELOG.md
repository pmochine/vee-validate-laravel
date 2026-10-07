# Changelog

## 2.0.0

Version 2 is for Vue 3 and vee-validate 4. Version 1.x for Vue 2 is on the `1x` branch.

### Added

- `useLaravelErrors(form?)` shows the errors of a Laravel 422 response in a vee-validate form. Each error stays until the user changes the value of its field, or until the next submit. vee-validate alone removes a server error each time it validates the field, for example on `blur`.
- `laravel.handleSubmit(callback)` works like `handleSubmit()` of vee-validate. It shows a Laravel 422 error that the callback throws. The errors belong to the values at the start of the callback. The response of an older submit is ignored. The callback gets `setLaravelErrors()` for Inertia and `fetch`.
- `laravel.set(source)` shows the errors for the current values, for code that sends the form another way.
- A field with an active server error stays invalid, also after a silent validation.
- The next submit and `resetForm()` remove all server errors of the previous response, also errors for keys without a field.
- If the user removes or moves a row of an array, an error does not move to another row.
- All calls for one form share one state. When the last component that uses it unmounts, its server errors go away.
- `getLaravelErrors(source)` reads the errors of a Laravel response. It accepts an axios error or response, an ofetch (`$fetch`) error, the JSON body, or an object with an `errors` object. For a status other than 422, it returns `null`.
- TypeScript types.
- An ES module and a UMD build, with `exports` and types for `import` and `require`.

### Breaking changes

- The Vue 2 plugin and `$addLaravelErrors` are removed. The README has a migration table.
- The peer dependencies are Vue 3.3 or newer and vee-validate 4.12 or newer.
- Each field has a list of messages, for example `{ email: ['message 1', 'message 2'] }`. 1.x joined them to `'message 1, message 2'`.
- Laravel keys such as `users.0.name` become vee-validate paths such as `users[0].name`.

### Development

- Tests use Vitest 5 and jsdom 30, and the type checks use TypeScript 7. The development tools need Node.js 22.22.2 or a newer 22.x, Node.js 24.15 or a newer 24.x, or Node.js 26 and newer. `.nvmrc` selects Node.js 24.21.0. The published files have no Node.js requirement.

## 1.0.7

This is the last version. The package is no longer developed. vee-validate 3 and 4 do not need it. The README shows how they read Laravel errors with `setErrors`.

### Fixed

- `$addLaravelErrors` stores each error under `field`. Since 1.0.4, it stored the errors under `key`. Then `errors.has('name')` and `errors.first('name')` did not find them, and templates showed no message.

### Changed

- The package contains the MIT license again, with the copyright notice of the original package by Robert Glyn Williams.
- The package contains only `src/`, `README.md`, `LICENSE` and `package.json`. Before, it also contained `.eslintrc.js`.
- The README shows how to use Laravel errors with vee-validate 3 and 4, and it lists the known issues of 1.x.
- Development: lint with ESLint 9 and eslint-config-avidofood 4, tests with Vitest, CI on GitHub Actions. The development tools need Node.js 22.13 or a newer 22.x, Node.js 24, or Node.js 26 and newer. `.nvmrc` selects Node.js 24. The published file has no Node.js requirement.

## 1.0.6 and older

See the git history.
