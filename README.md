# VeeValidate with Laravel validation errors
[![Latest Version on NPM](https://img.shields.io/npm/v/%40pmochine%2Fvee-validate-laravel.svg?style=flat-square)](https://npmjs.com/package/%40pmochine%2Fvee-validate-laravel)
[![Total Downloads on NPM](https://img.shields.io/npm/dt/%40pmochine%2Fvee-validate-laravel.svg)](https://www.npmjs.com/package/%40pmochine%2Fvee-validate-laravel)
[![Software License](https://img.shields.io/badge/license-MIT-brightgreen.svg?style=flat-square)](LICENSE)

This package shows Laravel validation errors in vee-validate 4 forms. Each error stays visible until the user changes the field or submits the form again.

> Requirements: Vue 3.3 or newer and vee-validate 4.12 or newer. For Vue 2 and vee-validate 2, use version 1.x, see [Version 1.x](#version-1x-vue-2).

## Why this package

vee-validate has `setErrors` for server errors. But vee-validate replaces the errors of a field each time it validates the field. With the default configuration, vee-validate validates a field on `blur`. If the user only clicks into the field and out again, the message "The email has already been taken." goes away. The value did not change, and the server still rejects it. This happens with field rules, with fields without rules and with a validation schema. Users reported this problem in these vee-validate issues:

- [#4018](https://github.com/logaretm/vee-validate/issues/4018): Allow custom set errors to remain active while normal validation happens
- [#4436](https://github.com/logaretm/vee-validate/issues/4436): Error immediately disappears after calling setErrors
- [#4865](https://github.com/logaretm/vee-validate/issues/4865): setErrors method problem

vee-validate cannot know how long a server error is valid, so it leaves this decision to the app.

`useLaravelErrors()` makes this decision for Laravel forms:

- A server error stays until the user changes the value of its field. The field stays invalid until then.
- The next submit removes all errors of the previous response. This includes errors for keys without a field, for example `token`. Without a validation schema, vee-validate alone keeps such errors after a submit and after `resetForm()`.
- The errors belong to the values of the request. If the user changes a field while the request runs, the response shows no error for that field. The response of an older request does not show at all.
- If the user removes or moves a row of an array, the error does not move to another row.
- It reads errors from axios, from ofetch (`$fetch` in Nuxt), from Inertia and from the JSON body.

For a simple form, `setErrors(error.response.data.errors)` from vee-validate can be enough. This package is for forms where server errors must stay visible until the user changes the value.

## Installation

```bash
npm i @pmochine/vee-validate-laravel
```

## Usage

Call `useLaravelErrors()` after `useForm()`. Use `laravel.handleSubmit()` instead of `form.handleSubmit()`. If the callback throws a Laravel validation error, the errors show in the form:

```vue
<script setup>
import axios from 'axios';
import { useForm, Field, ErrorMessage } from 'vee-validate';
import { useLaravelErrors } from '@pmochine/vee-validate-laravel';

const form = useForm();
const laravel = useLaravelErrors(form);

const onSubmit = laravel.handleSubmit(async (values) => {
    await axios.post('/users', values);
});
</script>

<template>
    <form @submit="onSubmit">
        <Field name="email" type="email" />
        <ErrorMessage name="email" />
        <Field name="users[0].name" />
        <ErrorMessage name="users[0].name" />
        <button>Save</button>
    </form>
</template>
```

`laravel.handleSubmit()` works like `handleSubmit()` of vee-validate. Other errors, for example a network error or the status 500, are not Laravel validation errors. If the callback throws one of them, the promise rejects with this error.

### Nuxt with `$fetch`

`$fetch` throws an error with the status and the body. Use it the same way:

```javascript
const onSubmit = laravel.handleSubmit(async (values) => {
    await $fetch('/api/users', { method: 'POST', body: values });
});
```

### Inertia

Inertia gives the errors to `onError` and does not throw. The callback gets `setLaravelErrors()` in its second argument. Wrap the errors of Inertia in an object with the key `errors`:

```javascript
const onSubmit = laravel.handleSubmit((values, { setLaravelErrors }) => {
    router.post('/users', values, {
        onError: (errors) => setLaravelErrors({ errors }),
    });
});
```

### Native `fetch`

`fetch` does not throw for the status 422. Read the JSON body and give it to `setLaravelErrors()`:

```javascript
const onSubmit = laravel.handleSubmit(async (values, { setLaravelErrors }) => {
    const response = await fetch('/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(values),
    });
    if (response.status === 422) setLaravelErrors(await response.json());
});
```

### Without `laravel.handleSubmit()`

If you send the form another way, give the error to `set()`. The errors then belong to the values at the time of the call:

```javascript
try {
    await axios.post('/users', form.values);
} catch (error) {
    if (!laravel.set(error)) throw error;
}
```

### The `<Form>` component

`useLaravelErrors()` needs the form in the same component or in a parent component. With `<Form>`, call `useLaravelErrors()` without an argument in a component inside `<Form>`. In most cases, `useForm()` as in the example above is simpler.

## API

### `useLaravelErrors(form?)`

- `form`: the result of `useForm()`. Without it, the function uses the form of `useForm()` in the same component, or the form of a parent component, for example `<Form>`.
- Call it in `setup()` or in `<script setup>`.
- All calls for the same form share one state.

It returns an object with these parts:

| Part | Description |
|---|---|
| `handleSubmit(callback, onInvalid?)` | Like `handleSubmit()` of vee-validate. Shows a Laravel 422 error that the callback throws. The callback gets `setLaravelErrors(source)` in its second argument. A response of an older submit is ignored. |
| `set(source)` | Shows the errors of a Laravel 422 response for the current values. Removes the errors of an earlier response first. |
| `clear()` | Removes all server errors. Client errors stay. |
| `errors` | A read-only ref with the server errors that are still active, for example `{ email: ['The email has already been taken.'] }`. |

`set()` and `setLaravelErrors()` return the server errors that are active after the call. If the source is not a Laravel validation error, they return `null`. If a newer submit, a reset or `clear()` came in between, `setLaravelErrors()` also returns `null`.

A server error goes away in these cases:

- The user changes the value of its field. The message disappears during typing. This also applies to `<Field>`, which does not validate on `input`.
- The form is submitted again, or `resetForm()` runs.
- You call `clear()`, or `set()` with a new response.
- The last component that called `useLaravelErrors()` for the form unmounts.

### `getLaravelErrors(source)`

Reads the errors without a form. Returns an object with a list of messages for each field, or `null`.

| Source | Example |
|---|---|
| axios error | `error` in `catch (error)` |
| axios response | `error.response` |
| ofetch error (`$fetch` in Nuxt) | `error` in `catch (error)` |
| JSON body | `await response.json()` |
| Object with an `errors` object | `{ errors }` from Inertia |

If the source has a status other than 422, the result is `null`. A `Response` of `fetch` must be read with `response.json()` first.

## Things to know

- Laravel sends nested keys in dot notation, for example `users.0.name`. The package writes them in the form of vee-validate: `users[0].name`. Use this name in `<Field>`, `useField` and `<ErrorMessage>`.
- `<ErrorMessage>`, `errorMessage` and `form.errors` show the first message of a field. `useField().errors` and `form.errorBag` contain all messages.
- An error for a key without a field, for example `token`, shows only in `form.errors` and in `laravel.errors`. Show it yourself, for example above the form. Until the next submit, it keeps `form.meta.valid` at `false`. So do not disable the submit button with `meta.valid` alone.
- Replace a `Date` value, for example with `setFieldValue('date', new Date(...))`. Vue does not see a change in place such as `date.setFullYear(2025)`.
- Some server-side setups load vee-validate as an ES module and this package with `require()`. Then there are two copies of vee-validate, so pass the form: `useLaravelErrors(form)`.

## Version 1.x (Vue 2)

Version 1.x is a Vue 2 plugin for vee-validate 2. It is on the [`1x` branch](https://github.com/pmochine/vee-validate-laravel/tree/1x) and gets no more updates.

```bash
npm i @pmochine/vee-validate-laravel@1
```

### Migration from 1.x

| 1.x (Vue 2, vee-validate 2) | 2.x (Vue 3, vee-validate 4) |
|---|---|
| `Vue.use(VeeValidateLaravel)` | `const laravel = useLaravelErrors(form)` after `useForm()` |
| `this.$addLaravelErrors(error.response)` in `catch` | `laravel.handleSubmit()`, or `laravel.set(error)` |
| Returns `{ field: 'message 1, message 2' }` | Returns `{ field: ['message 1', 'message 2'] }` |
| Clears the whole error bag first | Removes only the server errors of the previous response |

## Development

```bash
npm install
npm test          # unit tests and type checks
npm run lint
npm run build     # builds dist/
```

`npm pack` and `npm publish` build `dist/` first.

## Security

If you discover any security related issues, please do not email me. I'm afraid 😱. avidofood@protonmail.com

## Credits

Now comes the best part! 😍

 - Idea found on https://github.com/RobertGlynWilliams/vee-validate-laravel

Oh come on. You read everything?? If you liked it so far, hit the ⭐️ button to give me a 🤩 face.

## Changelog

See [CHANGELOG.md](https://github.com/pmochine/vee-validate-laravel/blob/master/CHANGELOG.md).
