import {
    afterEach, describe, expect, it,
} from 'vitest';
import { defineComponent, h, onUpdated } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import {
    ErrorMessage, Field, Form, useField, useForm,
} from 'vee-validate';
import { toTypedSchema } from '@vee-validate/zod';
import { z } from 'zod';
import { useLaravelErrors } from '../src/index';

// An axios error for a failed Laravel validation
const laravelError = (errors) => ({ response: { status: 422, data: { message: 'Invalid', errors } } });

const wrappers = [];
afterEach(() => {
    wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
});

/**
 * Mounts a form with one <Field> and <ErrorMessage> for each name.
 * Returns the form, the result of useLaravelErrors() and helpers.
 */
function mountForm(names, { formOptions = {}, rules = {} } = {}) {
    const ctx = {};
    const wrapper = mount(defineComponent({
        setup() {
            ctx.form = useForm(formOptions);
            ctx.laravel = useLaravelErrors(ctx.form);

            return () => h('form', names.flatMap((name) => [
                h(Field, { name, rules: rules[name] }),
                h(ErrorMessage, { name, 'data-error': name }),
            ]));
        },
    }), { attachTo: document.body });
    wrappers.push(wrapper);

    ctx.input = (name) => wrapper.find(`input[name="${name}"]`);
    ctx.message = (name) => {
        const element = wrapper.find(`[data-error="${name}"]`);

        return element.exists() ? element.text() : '';
    };
    ctx.submit = (callback = () => {}) => ctx.form.handleSubmit(callback)();

    return ctx;
}

describe('useLaravelErrors', () => {
    it('shows the errors of a Laravel response and returns them', async () => {
        const { laravel, message } = mountForm(['email', 'users[0].name']);
        const result = laravel.set(laravelError({
            email: ['The email has already been taken.'],
            'users.0.name': ['The users.0.name field is required.'],
        }));
        await flushPromises();

        expect(result).toEqual({
            email: ['The email has already been taken.'],
            'users[0].name': ['The users.0.name field is required.'],
        });
        expect(message('email')).toBe('The email has already been taken.');
        expect(message('users[0].name')).toBe('The users.0.name field is required.');
    });

    it('returns null for other errors and keeps the current server errors', async () => {
        const { laravel, message } = mountForm(['email']);
        laravel.set(laravelError({ email: ['The email has already been taken.'] }));

        expect(laravel.set({ response: { status: 500, data: {} } })).toBeNull();
        await flushPromises();
        expect(message('email')).toBe('The email has already been taken.');
    });

    it('keeps the error of a field without rules when the user leaves the field', async () => {
        const { laravel, message, input } = mountForm(['email'], { formOptions: { initialValues: { email: 'taken@example.com' } } });
        laravel.set(laravelError({ email: ['The email has already been taken.'] }));
        await flushPromises();

        await input('email').trigger('blur');
        await flushPromises();

        expect(message('email')).toBe('The email has already been taken.');
    });

    it('keeps the error of a field with rules when it validates again, and the field stays invalid', async () => {
        let field;
        const wrapper = mount(defineComponent({
            setup() {
                const form = useForm({ initialValues: { email: 'taken@example.com' } });
                const laravel = useLaravelErrors(form);
                field = useField('email', (value) => !!value || 'The email field is required.');
                laravel.set(laravelError({ email: ['The email has already been taken.'] }));

                return () => h('p', field.errorMessage.value);
            },
        }));
        wrappers.push(wrapper);
        await flushPromises();

        await field.validate();
        field.handleBlur(new Event('blur'), true);
        await flushPromises();

        expect(wrapper.text()).toBe('The email has already been taken.');
        expect(field.meta.valid).toBe(false);
    });

    it('never renders the field without the message while it validates', async () => {
        const texts = [];
        const Message = defineComponent({
            props: { form: { type: Object, required: true } },
            setup(props) {
                onUpdated(() => texts.push(props.form.errors.value.email ?? ''));

                return () => h('p', props.form.errors.value.email);
            },
        });
        let ctx;
        const wrapper = mount(defineComponent({
            setup() {
                const form = useForm({ initialValues: { email: 'taken@example.com' } });
                ctx = { form, laravel: useLaravelErrors(form) };

                return () => [h(Field, { name: 'email', rules: (value) => !!value || 'required' }), h(Message, { form })];
            },
        }), { attachTo: document.body });
        wrappers.push(wrapper);
        ctx.laravel.set(laravelError({ email: ['The email has already been taken.'] }));
        await flushPromises();
        texts.length = 0;

        await wrapper.find('input').trigger('blur');
        await flushPromises();
        await ctx.form.validateField('email');
        await flushPromises();

        expect(texts.every((text) => text === 'The email has already been taken.')).toBe(true);
        expect(wrapper.find('p').text()).toBe('The email has already been taken.');
    });

    it('removes the error as soon as the user changes the value, also without validation', async () => {
        const { laravel, message, input } = mountForm(['email'], { formOptions: { initialValues: { email: 'taken@example.com' } } });
        laravel.set(laravelError({ email: ['The email has already been taken.'] }));
        await flushPromises();

        // <Field> does not validate on input by default
        input('email').element.value = 'new@example.com';
        await input('email').trigger('input');
        await flushPromises();
        expect(message('email')).toBe('');
        expect(laravel.errors.value).toEqual({});

        // The old value does not bring the error back
        input('email').element.value = 'taken@example.com';
        await input('email').trigger('input');
        await flushPromises();
        expect(message('email')).toBe('');
    });

    it('shows the client error after a change, not the server error', async () => {
        const { laravel, message, input } = mountForm(['email'], {
            formOptions: { initialValues: { email: 'taken@example.com' } },
            rules: { email: (value) => !!value || 'The email field is required.' },
        });
        laravel.set(laravelError({ email: ['The email has already been taken.'] }));
        await flushPromises();

        await input('email').setValue('');
        await flushPromises();

        expect(message('email')).toBe('The email field is required.');
    });

    it('keeps the errors of other fields when one field changes', async () => {
        const { laravel, message, input } = mountForm(['email', 'name'], { formOptions: { initialValues: { email: 'a@example.com', name: 'Admin' } } });
        laravel.set(laravelError({ email: ['The email has already been taken.'], name: ['The name is reserved.'] }));
        await flushPromises();

        await input('name').setValue('Admin 2');
        await input('email').trigger('blur');
        await flushPromises();

        expect(message('name')).toBe('');
        expect(message('email')).toBe('The email has already been taken.');
    });

    it('keeps an error for a key without a field until the next submit', async () => {
        const { form, laravel, input } = mountForm(['email']);
        laravel.set(laravelError({ token: ['The token has expired.'] }));
        await flushPromises();
        await input('email').setValue('a@example.com');
        await flushPromises();
        expect(form.errors.value.token).toBe('The token has expired.');
        expect(form.meta.value.valid).toBe(false);

        await form.handleSubmit(() => {})();
        await flushPromises();
        expect(form.errors.value.token).toBeUndefined();
        expect(form.meta.value.valid).toBe(true);
    });

    it('removes all server errors when the form is submitted again', async () => {
        const { laravel, message, submit } = mountForm(['email'], { formOptions: { initialValues: { email: 'taken@example.com' } } });
        laravel.set(laravelError({ email: ['The email has already been taken.'] }));
        await flushPromises();

        let called = false;
        await submit(() => { called = true; });
        await flushPromises();

        expect(called).toBe(true);
        expect(message('email')).toBe('');
        expect(laravel.errors.value).toEqual({});
    });

    it('replaces the errors of the previous response inside the submit handler', async () => {
        const { laravel, message, submit } = mountForm(['email', 'name']);
        laravel.set(laravelError({ email: ['The email has already been taken.'] }));
        await submit(() => {
            laravel.set(laravelError({ name: ['The name is reserved.'] }));
        });
        await flushPromises();

        expect(message('email')).toBe('');
        expect(message('name')).toBe('The name is reserved.');
    });

    it('does not show an error for a value that changed while the request was running', async () => {
        const {
            form, laravel, message, submit,
        } = mountForm(['email', 'name'], { formOptions: { initialValues: { email: 'taken@example.com', name: 'Admin' } } });
        await submit(() => {
            // The user types while the server answers
            form.setFieldValue('email', 'other@example.com');
            laravel.set(laravelError({ email: ['The email has already been taken.'], name: ['The name is reserved.'] }));
        });
        await flushPromises();

        expect(message('email')).toBe('');
        expect(message('name')).toBe('The name is reserved.');
    });

    it('removes the server errors on resetForm() after a submit', async () => {
        const {
            form, laravel, message, submit,
        } = mountForm(['email'], { formOptions: { initialValues: { email: 'taken@example.com' } } });
        await submit(() => {
            laravel.set(laravelError({ email: ['The email has already been taken.'] }));
        });
        await flushPromises();
        expect(message('email')).toBe('The email has already been taken.');

        form.resetForm();
        await flushPromises();

        expect(message('email')).toBe('');
        expect(laravel.errors.value).toEqual({});
    });

    it('clear() removes the server errors and keeps client errors', async () => {
        const { form, laravel, message } = mountForm(['email', 'name'], { rules: { name: (value) => !!value || 'The name field is required.' } });
        await form.validateField('name');
        laravel.set(laravelError({ email: ['The email has already been taken.'] }));
        await flushPromises();

        laravel.clear();
        await flushPromises();

        expect(message('email')).toBe('');
        expect(message('name')).toBe('The name field is required.');
    });

    it('works with a validation schema', async () => {
        const schema = toTypedSchema(z.object({
            email: z.string().email(),
            name: z.string().min(1),
        }));
        const { laravel, message, input } = mountForm(['email', 'name'], {
            formOptions: { validationSchema: schema, initialValues: { email: 'taken@example.com', name: 'Admin' } },
        });
        laravel.set(laravelError({ email: ['The email has already been taken.'], name: ['The name is reserved.'] }));
        await flushPromises();

        await input('email').trigger('blur');
        await input('name').setValue('Admin 2');
        await flushPromises();

        expect(message('email')).toBe('The email has already been taken.');
        expect(message('name')).toBe('');
    });

    it('finds the form of useForm() in the same component without an argument', async () => {
        let laravel;
        const wrapper = mount(defineComponent({
            setup() {
                useForm();
                laravel = useLaravelErrors();

                return () => [h(Field, { name: 'email' }), h(ErrorMessage, { name: 'email', 'data-error': 'email' })];
            },
        }), { attachTo: document.body });
        wrappers.push(wrapper);

        laravel.set(laravelError({ email: ['The email has already been taken.'] }));
        await flushPromises();

        expect(wrapper.find('[data-error="email"]').text()).toBe('The email has already been taken.');
    });

    it('finds the form of <Form> without an argument', async () => {
        let laravel;
        const Child = defineComponent({
            setup() {
                laravel = useLaravelErrors();

                return () => null;
            },
        });
        const wrapper = mount(defineComponent({
            render: () => h(Form, null, () => [h(Field, { name: 'email' }), h(ErrorMessage, { name: 'email', 'data-error': 'email' }), h(Child)]),
        }), { attachTo: document.body });
        wrappers.push(wrapper);

        laravel.set(laravelError({ email: ['The email has already been taken.'] }));
        await flushPromises();

        expect(wrapper.find('[data-error="email"]').text()).toBe('The email has already been taken.');
    });

    it('throws without a form', () => {
        const wrapper = mount(defineComponent({
            setup() {
                expect(() => useLaravelErrors()).toThrow('found no form');

                return () => null;
            },
        }));
        wrappers.push(wrapper);
    });
});
