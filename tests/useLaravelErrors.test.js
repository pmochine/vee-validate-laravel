import {
    afterEach, describe, expect, it,
} from 'vitest';
import {
    defineComponent, effectScope, h, nextTick, onUpdated, reactive, ref,
} from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import {
    ErrorMessage, Field, Form, useField, useFieldArray, useForm,
} from 'vee-validate';
import { toTypedSchema } from '@vee-validate/zod';
import { z } from 'zod';
import { useLaravelErrors } from '../src/index';

// An axios error for a failed Laravel validation
const laravelError = (errors) => ({ response: { status: 422, data: { message: 'Invalid', errors } } });

// vee-validate debounces a validation by 5 ms. This waits until it is done.
const settle = async () => {
    await flushPromises();
    await new Promise((resolve) => { setTimeout(resolve, 20); });
    await flushPromises();
};

const wrappers = [];
afterEach(() => {
    wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
});

function mountComponent(component) {
    const wrapper = mount(defineComponent(component), { attachTo: document.body });
    wrappers.push(wrapper);

    return wrapper;
}

/**
 * Mounts a form with one <Field> and <ErrorMessage> for each name.
 * Returns the form, the result of useLaravelErrors() and helpers.
 */
function mountForm(names, { formOptions = {}, rules = {}, extra = () => ({}) } = {}) {
    const ctx = {};
    const wrapper = mountComponent({
        setup() {
            ctx.form = useForm(formOptions);
            ctx.laravel = useLaravelErrors(ctx.form);
            Object.assign(ctx, extra(ctx.form));

            return () => h('form', names.flatMap((name) => [
                h(Field, { name, rules: rules[name] }),
                h(ErrorMessage, { name, 'data-error': name }),
            ]));
        },
    });

    ctx.wrapper = wrapper;
    ctx.input = (name) => wrapper.find(`input[name="${name}"]`);
    ctx.message = (name) => {
        const element = wrapper.find(`[data-error="${name}"]`);

        return element.exists() ? element.text() : '';
    };

    return ctx;
}

describe('useLaravelErrors', () => {
    it('shows the errors of a Laravel response and returns them', async () => {
        const { laravel, message } = mountForm(['email', 'users[0].name']);
        const result = laravel.set(laravelError({
            email: ['The email has already been taken.'],
            'users.0.name': ['The users.0.name field is required.'],
        }));
        await settle();

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
        await settle();
        expect(message('email')).toBe('The email has already been taken.');
    });

    it('keeps the error of a field without rules when the user leaves the field', async () => {
        const { laravel, message, input } = mountForm(['email'], {
            formOptions: { initialValues: { email: 'taken@example.com' } },
        });
        laravel.set(laravelError({ email: ['The email has already been taken.'] }));
        await settle();

        await input('email').trigger('blur');
        await settle();

        expect(message('email')).toBe('The email has already been taken.');
    });

    it('keeps the error of a field with rules when it validates again, and the field stays invalid', async () => {
        let field;
        const wrapper = mountComponent({
            setup() {
                const form = useForm({ initialValues: { email: 'taken@example.com' } });
                const laravel = useLaravelErrors(form);
                field = useField('email', (value) => !!value || 'The email field is required.');
                laravel.set(laravelError({ email: ['The email has already been taken.'] }));

                return () => h('p', field.errorMessage.value);
            },
        });
        await settle();

        await field.validate();
        field.handleBlur(new Event('blur'), true);
        await settle();

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
        const wrapper = mountComponent({
            setup() {
                const form = useForm({ initialValues: { email: 'taken@example.com' } });
                ctx = { form, laravel: useLaravelErrors(form) };

                return () => [h(Field, { name: 'email', rules: (value) => !!value || 'required' }), h(Message, { form })];
            },
        });
        ctx.laravel.set(laravelError({ email: ['The email has already been taken.'] }));
        await settle();
        texts.length = 0;

        await wrapper.find('input').trigger('blur');
        await settle();
        await ctx.form.validateField('email');
        await settle();

        expect(texts.every((text) => text === 'The email has already been taken.')).toBe(true);
        expect(wrapper.find('p').text()).toBe('The email has already been taken.');
    });

    it('removes the error as soon as the user changes the value, also without validation', async () => {
        const { laravel, message, input } = mountForm(['email'], {
            formOptions: { initialValues: { email: 'taken@example.com' } },
        });
        laravel.set(laravelError({ email: ['The email has already been taken.'] }));
        await settle();

        // <Field> does not validate on input by default
        input('email').element.value = 'new@example.com';
        await input('email').trigger('input');
        await settle();
        expect(message('email')).toBe('');
        expect(laravel.errors.value).toEqual({});

        // The old value does not bring the error back
        input('email').element.value = 'taken@example.com';
        await input('email').trigger('input');
        await settle();
        expect(message('email')).toBe('');
    });

    it('shows the client error after a change, not the server error', async () => {
        const { laravel, message, input } = mountForm(['email'], {
            formOptions: { initialValues: { email: 'taken@example.com' } },
            rules: { email: (value) => !!value || 'The email field is required.' },
        });
        laravel.set(laravelError({ email: ['The email has already been taken.'] }));
        await settle();

        await input('email').setValue('');
        await settle();

        expect(message('email')).toBe('The email field is required.');
    });

    it('keeps the errors of other fields when one field changes', async () => {
        const { laravel, message, input } = mountForm(['email', 'name'], {
            formOptions: { initialValues: { email: 'a@example.com', name: 'Admin' } },
        });
        laravel.set(laravelError({ email: ['The email has already been taken.'], name: ['The name is reserved.'] }));
        await settle();

        await input('name').setValue('Admin 2');
        await input('email').trigger('blur');
        await settle();

        expect(message('name')).toBe('');
        expect(message('email')).toBe('The email has already been taken.');
    });

    it('keeps an error for a key without a field until the next submit', async () => {
        const { form, laravel, input } = mountForm(['email']);
        laravel.set(laravelError({ token: ['The token has expired.'] }));
        await settle();
        await input('email').setValue('a@example.com');
        await settle();
        expect(form.errors.value.token).toBe('The token has expired.');
        expect(form.meta.value.valid).toBe(false);

        await form.handleSubmit(() => {})();
        await settle();
        expect(form.errors.value.token).toBeUndefined();
        expect(form.meta.value.valid).toBe(true);
    });

    it('removes all server errors when the form is submitted again', async () => {
        const { form, laravel, message } = mountForm(['email'], {
            formOptions: { initialValues: { email: 'taken@example.com' } },
        });
        laravel.set(laravelError({ email: ['The email has already been taken.'] }));
        await settle();

        let called = false;
        await form.handleSubmit(() => { called = true; })();
        await settle();

        expect(called).toBe(true);
        expect(message('email')).toBe('');
        expect(laravel.errors.value).toEqual({});
    });

    it('removes the server errors on a failed client validation and does not call the handler', async () => {
        const { form, laravel } = mountForm(['email'], {
            rules: { email: (value) => !!value || 'required' },
        });
        laravel.set(laravelError({ email: ['taken'], token: ['expired'] }));
        await settle();

        let called = false;
        await laravel.handleSubmit(() => { called = true; })();
        await settle();

        expect(called).toBe(false);
        expect(laravel.errors.value).toEqual({});
        expect(form.errors.value).toEqual({ email: 'required' });
    });

    it('clear() removes the server errors and keeps client errors', async () => {
        const { form, laravel, message } = mountForm(['email', 'name'], {
            rules: { name: (value) => !!value || 'The name field is required.' },
        });
        await form.validateField('name');
        laravel.set(laravelError({ email: ['The email has already been taken.'] }));
        await settle();

        laravel.clear();
        await settle();

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
        await settle();

        await input('email').trigger('blur');
        await settle();
        await input('name').setValue('Admin 2');
        await settle();

        expect(message('email')).toBe('The email has already been taken.');
        expect(message('name')).toBe('');
    });

    it('finds the form of useForm() in the same component without an argument', async () => {
        let laravel;
        const wrapper = mountComponent({
            setup() {
                useForm();
                laravel = useLaravelErrors();

                return () => [h(Field, { name: 'email' }), h(ErrorMessage, { name: 'email', 'data-error': 'email' })];
            },
        });

        laravel.set(laravelError({ email: ['The email has already been taken.'] }));
        await settle();

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
        const wrapper = mountComponent({
            render: () => h(Form, null, () => [
                h(Field, { name: 'email' }),
                h(ErrorMessage, { name: 'email', 'data-error': 'email' }),
                h(Child),
            ]),
        });

        laravel.set(laravelError({ email: ['The email has already been taken.'] }));
        await settle();

        expect(wrapper.find('[data-error="email"]').text()).toBe('The email has already been taken.');
    });

    it('throws without a form', () => {
        mountComponent({
            setup() {
                expect(() => useLaravelErrors()).toThrow('found no form');

                return () => null;
            },
        });
    });
});

describe('handleSubmit', () => {
    it('shows a Laravel error that the callback throws and resolves', async () => {
        const { laravel, message } = mountForm(['email'], {
            formOptions: { initialValues: { email: 'taken@example.com' } },
        });

        await expect(laravel.handleSubmit(() => {
            throw laravelError({ email: ['The email has already been taken.'] });
        })()).resolves.toBeUndefined();
        await settle();

        expect(message('email')).toBe('The email has already been taken.');
    });

    it('throws other errors again and returns the result of the callback', async () => {
        const { laravel } = mountForm(['email']);
        const networkError = new Error('Network Error');

        const failing = laravel.handleSubmit(() => { throw networkError; });

        await expect(failing()).rejects.toBe(networkError);
        await expect(laravel.handleSubmit(() => 'saved')()).resolves.toBe('saved');
    });

    it('replaces the errors of the previous response', async () => {
        const { laravel, message } = mountForm(['email', 'name']);
        await laravel.handleSubmit(() => { throw laravelError({ email: ['The email has already been taken.'] }); })();
        await laravel.handleSubmit(() => { throw laravelError({ name: ['The name is reserved.'] }); })();
        await settle();

        expect(message('email')).toBe('');
        expect(message('name')).toBe('The name is reserved.');
    });

    it('does not show an error for a value that changed while the request was running', async () => {
        const { form, laravel, message } = mountForm(['email', 'name'], {
            formOptions: { initialValues: { email: 'taken@example.com', name: 'Admin' } },
        });
        await laravel.handleSubmit(async () => {
            // The user types while the server answers
            form.setFieldValue('email', 'other@example.com');
            throw laravelError({ email: ['The email has already been taken.'], name: ['The name is reserved.'] });
        })();
        await settle();

        expect(message('email')).toBe('');
        expect(message('name')).toBe('The name is reserved.');
    });

    it('ties the errors to the values that the callback sends, after an async client validation', async () => {
        let resolveRule;
        let gate = false;
        let sent;
        const { form, laravel } = mountForm(['email'], {
            formOptions: { initialValues: { email: 'a', name: 'n' } },
            extra: () => ({
                name: useField('name', () => (gate ? new Promise((resolve) => { resolveRule = resolve; }) : true)),
            }),
        });
        await settle();
        gate = true;

        const submit = laravel.handleSubmit((values) => {
            sent = values.email;
            throw laravelError({ email: [`${values.email} is taken`] });
        })();
        await flushPromises();
        // The user changes the value while the client validation runs
        form.setFieldValue('email', 'b', false);
        await flushPromises();
        resolveRule(true);
        await submit;
        await settle();

        expect(sent).toBe('b');
        expect(form.errors.value.email).toBe('b is taken');
    });

    it('ignores the late response of an older submit', async () => {
        const { form, laravel } = mountForm(['email'], {
            formOptions: { initialValues: { email: 'a' } },
        });
        let answerFirst;
        const first = laravel.handleSubmit(async () => {
            await new Promise((resolve) => { answerFirst = resolve; });
            throw laravelError({ email: ['a is taken'] });
        })();
        await settle();

        form.setFieldValue('email', 'b');
        await laravel.handleSubmit(() => {})();
        answerFirst();
        await first;
        await settle();

        expect(form.errors.value.email).toBeUndefined();
        expect(laravel.errors.value).toEqual({});
    });

    it('ignores the late response of an older submit with the same values', async () => {
        const { form, laravel } = mountForm(['email'], {
            formOptions: { initialValues: { email: 'a' } },
        });
        let answerFirst;
        const first = laravel.handleSubmit(async () => {
            await new Promise((resolve) => { answerFirst = resolve; });
            throw laravelError({ email: ['a is taken'] });
        })();
        await settle();

        // The newer submit with the same value succeeds
        await laravel.handleSubmit(() => 'saved')();
        answerFirst();
        await first;
        await settle();

        expect(form.errors.value.email).toBeUndefined();
    });

    it('gives setLaravelErrors() to the callback, for example for the onError callback of Inertia', async () => {
        const { laravel, message } = mountForm(['email']);
        let onError;
        await laravel.handleSubmit((values, { setLaravelErrors }) => {
            onError = (errors) => setLaravelErrors({ errors });
        })();

        expect(onError({ email: 'The email has already been taken.' })).toEqual({
            email: ['The email has already been taken.'],
        });
        await settle();
        expect(message('email')).toBe('The email has already been taken.');

        // After a newer submit, the old callback does nothing
        await laravel.handleSubmit(() => {})();
        expect(onError({ email: 'late' })).toBeNull();
        await settle();
        expect(message('email')).toBe('');
    });
});

describe('fixes of the Codex review', () => {
    it('set() outside of handleSubmit() uses the current values, also after an earlier submit', async () => {
        const { form, laravel } = mountForm(['email'], { formOptions: { initialValues: { email: 'a' } } });
        await form.handleSubmit(() => {})();
        form.setFieldValue('email', 'b');
        await settle();

        laravel.set(laravelError({ email: ['b is taken'] }));
        await settle();

        expect(form.errors.value.email).toBe('b is taken');
    });

    it('keeps the field invalid after a silent validation', async () => {
        let field;
        let laravel;
        mountComponent({
            setup() {
                const form = useForm({ initialValues: { email: 'a' } });
                laravel = useLaravelErrors(form);
                field = useField('email', (value) => !!value || 'required');

                return () => null;
            },
        });
        await settle();
        laravel.set(laravelError({ email: ['taken'] }));
        await settle();

        await field.validate({ mode: 'silent' });
        await settle();

        expect(field.errorMessage.value).toBe('taken');
        expect(field.meta.valid).toBe(false);
    });

    it('keeps the field invalid when useFieldArray() adds a row', async () => {
        const { laravel, field, rows } = mountForm([], {
            formOptions: { initialValues: { email: 'a', users: [] } },
            extra: () => ({
                field: useField('email', (value) => !!value || 'required'),
                rows: useFieldArray('users'),
            }),
        });
        await settle();
        laravel.set(laravelError({ email: ['taken'] }));
        await settle();

        rows.push({ name: 'new' });
        await settle();

        expect(field.meta.valid).toBe(false);
        expect(field.errorMessage.value).toBe('taken');
    });

    it('keeps a client error with the same text as the server error on clear()', async () => {
        const { form, laravel } = mountForm(['email'], {
            formOptions: { initialValues: { email: '' } },
            rules: { email: (value) => !!value || 'required' },
        });
        await form.validate();
        laravel.set(laravelError({ email: ['required'] }));
        await settle();

        laravel.clear();
        await settle();

        expect(form.errors.value.email).toBe('required');
        expect(form.meta.value.valid).toBe(false);
    });

    it('keeps a client error with the same text that came after the server error', async () => {
        const { form, laravel, input } = mountForm(['email'], {
            formOptions: { initialValues: { email: 'x' } },
            rules: { email: (value) => value !== 'x' || 'required' },
        });
        laravel.set(laravelError({ email: ['required'] }));
        await settle();
        // The client rule now gives the same text for the unchanged value
        await input('email').trigger('blur');
        await settle();

        laravel.clear();
        await settle();

        expect(form.errors.value.email).toBe('required');
    });

    it('keeps a client error that replaced the server error in the same tick on clear()', async () => {
        const { form, laravel } = mountForm(['email'], { formOptions: { initialValues: { email: 'a' } } });
        laravel.set(laravelError({ email: ['taken'] }));
        await settle();

        // vee-validate replaces the list, and clear() runs before the watcher
        form.setFieldError('email', ['client']);
        laravel.clear();
        await settle();

        expect(form.errorBag.value.email).toEqual(['client']);
    });

    it('drops the error of an array row that moved, also with the same value', async () => {
        const { form, laravel, rows } = mountForm([], {
            formOptions: { initialValues: { users: [{ id: 1, name: 'same' }, { id: 2, name: 'same' }] } },
            extra: () => ({ rows: useFieldArray('users') }),
        });
        await settle();
        laravel.set(laravelError({ 'users.0.name': ['The name of user 1 is taken.'] }));
        await settle();
        expect(form.errors.value['users[0].name']).toBe('The name of user 1 is taken.');

        rows.remove(0);
        await settle();

        expect(form.values.users).toEqual([{ id: 2, name: 'same' }]);
        expect(form.errors.value['users[0].name']).toBeUndefined();
    });

    it('drops the error of a rendered array row that moved', async () => {
        let ctx;
        const wrapper = mountComponent({
            setup() {
                const form = useForm({ initialValues: { users: [{ id: 1, name: 'same' }, { id: 2, name: 'same' }] } });
                ctx = { form, laravel: useLaravelErrors(form), rows: useFieldArray('users') };

                return () => h('div', ctx.rows.fields.value.map((row, index) => h('div', { key: row.key }, [
                    h(Field, { name: `users[${index}].name` }),
                    h(ErrorMessage, { name: `users[${index}].name` }),
                ])));
            },
        });
        await settle();
        ctx.laravel.set(laravelError({ 'users.0.name': ['The name of user 1 is taken.'] }));
        await settle();
        expect(wrapper.text()).toBe('The name of user 1 is taken.');

        ctx.rows.remove(0);
        await settle();

        expect(wrapper.text()).toBe('');
    });

    it('keeps the error of an array row when another field of the row changes', async () => {
        const { form, laravel } = mountForm([], {
            formOptions: { initialValues: { users: [{ name: 'taken', email: 'a@example.com' }] } },
        });
        laravel.set(laravelError({ 'users.0.name': ['taken'] }));
        await settle();

        form.setFieldValue('users[0].email', 'b@example.com');
        await settle();

        expect(form.errors.value['users[0].name']).toBe('taken');
    });

    it('removes the server errors on resetForm() before the first submit', async () => {
        const { form, laravel } = mountForm(['email'], { formOptions: { initialValues: { email: 'a' } } });
        laravel.set(laravelError({ email: ['taken'], token: ['expired'] }));
        await settle();

        form.resetForm();
        await settle();

        expect(laravel.errors.value).toEqual({});
        expect(form.errors.value).toEqual({});
    });

    it('removes the server errors on resetForm() that keeps the submit count', async () => {
        const { form, laravel } = mountForm(['email'], { formOptions: { initialValues: { email: 'a' } } });
        await laravel.handleSubmit(() => { throw laravelError({ email: ['taken'] }); })();
        await settle();
        expect(form.errors.value.email).toBe('taken');

        form.resetForm({ submitCount: form.submitCount.value });
        await settle();

        expect(form.errors.value).toEqual({});
    });

    it('shares one state for all calls on the same form', async () => {
        const { form, laravel, second } = mountForm(['email'], {
            extra: (vvForm) => ({ second: useLaravelErrors(vvForm) }),
        });
        expect(second).toBe(laravel);

        laravel.set(laravelError({ email: ['old'] }));
        second.set(laravelError({ email: ['new'] }));
        await settle();

        expect(form.errorBag.value.email).toEqual(['new']);
    });

    it('removes its errors when the component that uses it unmounts', async () => {
        let form;
        let laravel;
        const show = ref(true);
        const Child = defineComponent({
            setup() {
                laravel = useLaravelErrors();

                return () => null;
            },
        });
        mountComponent({
            setup() {
                form = useForm();

                return () => (show.value ? h(Child) : null);
            },
        });
        laravel.set(laravelError({ token: ['expired'] }));
        await settle();
        expect(form.errors.value.token).toBe('expired');

        show.value = false;
        await settle();

        expect(form.errors.value.token).toBeUndefined();
    });

    it('compares dates by their time', async () => {
        const { form, laravel } = mountForm([], {
            formOptions: { initialValues: { date: new Date('2020-01-01'), other: 0 } },
        });
        laravel.set(laravelError({ date: ['invalid date'] }));
        await settle();
        expect(laravel.errors.value).toEqual({ date: ['invalid date'] });

        // A change in place is not reactive, but the next check sees it
        form.values.date.setFullYear(2021);
        form.setFieldError('date', ['client']);
        await settle();
        expect(laravel.errors.value).toEqual({});

        laravel.set(laravelError({ date: ['invalid date'] }));
        form.setFieldValue('date', new Date('2022-01-01'));
        await settle();
        expect(laravel.errors.value).toEqual({});
    });

    it('works in a browser without String.prototype.matchAll (ES2019)', async () => {
        const { form, laravel } = mountForm([], { formOptions: { initialValues: { users: [{ name: 'a' }] } } });
        const { matchAll } = String.prototype;
        // Simulates an older browser
        delete String.prototype.matchAll;
        try {
            laravel.set(laravelError({ 'users.0.name': ['taken'] }));
        } finally {
            // eslint-disable-next-line no-extend-native
            String.prototype.matchAll = matchAll;
        }
        await settle();

        expect(form.errors.value['users[0].name']).toBe('taken');
    });

    it('reads no form values while no server error is active', async () => {
        let reads = 0;
        const scope = effectScope();
        let laravel;
        let values;
        scope.run(() => {
            const count = (value) => {
                reads += 1;

                return value;
            };
            const rows = {};
            for (let index = 0; index < 1000; index += 1) {
                Object.defineProperty(rows, `field${index}`, { enumerable: true, get: () => count(index) });
            }
            values = reactive({ rows, input: '' });
            const errorBag = ref({});
            laravel = useLaravelErrors({
                values,
                errorBag,
                submitCount: ref(0),
                setFieldError(path, messages) {
                    errorBag.value = { ...errorBag.value, [path]: messages || [] };
                },
                handleSubmit: (callback) => callback,
            });
        });

        values.input = 'a';
        await nextTick();
        expect(reads).toBe(0);

        laravel.set(laravelError({ input: ['invalid'] }));
        const readsOfSnapshot = reads;
        values.input = 'b';
        await nextTick();
        expect(reads).toBe(readsOfSnapshot);
        expect(laravel.errors.value).toEqual({});
        scope.stop();
    });
});
