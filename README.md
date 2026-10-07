# VeeValidate with Laravel validation errors
[![Latest Version on NPM](https://img.shields.io/npm/v/%40pmochine%2Fvee-validate-laravel.svg?style=flat-square)](https://npmjs.com/package/%40pmochine%2Fvee-validate-laravel)
[![Total Downloads on NPM](https://img.shields.io/npm/dt/%40pmochine%2Fvee-validate-laravel.svg)](https://www.npmjs.com/package/%40pmochine%2Fvee-validate-laravel)
[![Software License](https://img.shields.io/badge/license-MIT-brightgreen.svg?style=flat-square)](LICENSE)

This package adds Laravel validation errors to vee-validate 2 (Vue 2).

> You do not need this package with vee-validate 3 or 4. Both versions have a `setErrors` function that reads the Laravel error format directly. The sections below show how.

## Status

- Version 1.x supports only Vue 2 and vee-validate 2.
- Vue 2 reached its end of life on December 31, 2023.
- There is no version of this package for Vue 3. vee-validate 4 does the same job with `setErrors`.

## Laravel errors with vee-validate 4 (Vue 3)

If validation fails, Laravel answers with the status 422 and a body like this:

```json
{
    "message": "The name field is required. (and 1 more error)",
    "errors": {
        "name": ["The name field is required."],
        "users.0.email": ["The users.0.email field is required."]
    }
}
```

Give the `errors` object to `setErrors`. With the Composition API:

```javascript
import axios from 'axios';
import { useForm } from 'vee-validate';

const { handleSubmit, setErrors } = useForm();

const onSubmit = handleSubmit(async (values) => {
    try {
        await axios.post('/example', values);
    } catch (error) {
        if (error.response?.status !== 422) throw error;
        setErrors(error.response.data.errors);
    }
});
```

With the `<Form>` component, the submit handler gets `setErrors` in its second argument:

```vue
<script setup>
import axios from 'axios';
import { Form, Field, ErrorMessage } from 'vee-validate';

async function onSubmit(values, { setErrors }) {
    try {
        await axios.post('/example', values);
    } catch (error) {
        if (error.response?.status !== 422) throw error;
        setErrors(error.response.data.errors);
    }
}
</script>

<template>
    <Form @submit="onSubmit">
        <Field name="name" />
        <ErrorMessage name="name" />
        <button>Save</button>
    </Form>
</template>
```

This is how vee-validate 4 handles the Laravel format. We tested it with vee-validate 4.15.1 and Vue 3.5.

- A Laravel key such as `users.0.email` matches a field with the name `users[0].email` or `users.0.email`.
- Laravel sends a list of messages for each field. `errorMessage` shows the first message. `errors` contains all of them.
- If the user changes a field or submits the form again, the server error on that field goes away.
- An error for a key without a field, for example `token`, stays in the `errors` of the form. The next submit and `resetForm()` do not remove it. Call `setFieldError('token', undefined)` to remove it.

The official documentation: [Setting errors manually](https://vee-validate.logaretm.com/v4/guide/composition-api/handling-forms/) (Composition API) and [Handling forms](https://vee-validate.logaretm.com/v4/guide/components/handling-forms/) (components).

## Laravel errors with vee-validate 3 (Vue 2)

Call `setErrors` on the `ValidationObserver`. This example uses `ref="observer"` on the observer:

```javascript
axios.post('/example', data).catch((error) => {
    if (!error.response || error.response.status !== 422) throw error;
    this.$refs.observer.setErrors(error.response.data.errors);
});
```

The official documentation: [Server-side validation](https://vee-validate.logaretm.com/v3/advanced/server-side-validation.html).

## Version 1.x for vee-validate 2 (Vue 2)

### Known issue in 1.0.4 to 1.0.6

In the versions 1.0.4 to 1.0.6, `errors.has('name')` and `errors.first('name')` do not find the Laravel errors. The package stores each error under `key` instead of `field`. Only the return value of `$addLaravelErrors` contains the messages.

You can replace the package with these lines in your component:

```javascript
axios.post('/example', data).catch((error) => {
    if (!error.response || error.response.status !== 422) throw error;
    const errors = error.response.data.errors;
    this.$validator.errors.clear();
    Object.keys(errors).forEach((field) => {
        this.$validator.errors.add({ field, msg: errors[field].join(', ') });
    });
});
```

### Installation

Install the package from [npm](https://www.npmjs.com/package/@pmochine/vee-validate-laravel):

```bash
npm i @pmochine/vee-validate-laravel
```

Add the package in your `main.js`:

```javascript
import Vue from 'vue';
import VeeValidate from 'vee-validate';
import VeeValidateLaravel from '@pmochine/vee-validate-laravel';

Vue.use(VeeValidate);
Vue.use(VeeValidateLaravel);
```

### Usage

In Laravel:

```php
$request->validate([
    'name' => 'required|min:3|max:255'
]);
```

In Vue:

```javascript
axios.post('/example', { name: this.name })
    .catch((err) => {
        // Adds the errors to the vee-validate error bag and returns them as an object
        const errors = this.$addLaravelErrors(err.response);

        if (errors) {
            alert(errors[Object.keys(errors)[0]]);
        }
    });
```

## Security

If you discover any security related issues, please do not email me. I'm afraid 😱. avidofood@protonmail.com

## Credits

Now comes the best part! 😍

 - Idea found on https://github.com/RobertGlynWilliams/vee-validate-laravel

Oh come on. You read everything?? If you liked it so far, hit the ⭐️ button to give me a 🤩 face.
