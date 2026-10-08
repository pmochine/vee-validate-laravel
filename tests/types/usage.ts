// Compile-time checks for src/index.d.ts. Run with: npm run test:types
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

const onSubmit: (event?: Event) => Promise<number | undefined> = laravel.handleSubmit(
    async (values: UserForm, { setLaravelErrors, setFieldValue }) => {
        const email: string = values.email;
        const set: LaravelErrors | null = setLaravelErrors({ errors: { email: 'x' } });
        setFieldValue('email', email);

        return set ? 1 : 2;
    },
);

const set: LaravelErrors | null = laravel.set(new Error('any value'));
laravel.clear();
const messages: readonly string[] | undefined = laravel.errors.value.email;

const parsed: LaravelErrors | null = getLaravelErrors({ errors: { email: 'x' } });

// @ts-expect-error the errors are read-only
laravel.errors.value = {};

// @ts-expect-error the message lists are read-only
laravel.errors.value.email?.push('changed');

// @ts-expect-error a form needs errorBag, submitCount, setFieldError and handleSubmit
useLaravelErrors({ values: {} });

export {
    onSubmit, set, messages, parsed,
};
