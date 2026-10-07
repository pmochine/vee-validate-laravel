// Compile-time checks for src/index.d.ts. Run with: npm run test:types
import type { Ref } from 'vue';
import { useForm, useFormContext } from 'vee-validate';
import {
    getLaravelErrors,
    useLaravelErrors,
    type LaravelErrors,
    type UseLaravelErrorsReturn,
} from '../../src/index';

interface UserForm {
    email: string;
    users: { name: string }[];
}

const form = useForm<UserForm>();
const laravel: UseLaravelErrorsReturn = useLaravelErrors(form);
useLaravelErrors(useFormContext());
useLaravelErrors();

const set: LaravelErrors | null = laravel.set(new Error('any value'));
laravel.clear();
const active: Readonly<Ref<Readonly<LaravelErrors>>> = laravel.errors;
const messages: string[] | undefined = active.value.email;

const parsed: LaravelErrors | null = getLaravelErrors({ errors: { email: 'x' } });

// @ts-expect-error the errors are read-only
laravel.errors.value = {};

// @ts-expect-error a form needs errorBag, submitCount and setFieldError
useLaravelErrors({ values: {} });

export { set, messages, parsed };
