import {
    getCurrentInstance, inject, readonly, ref, watch,
} from 'vue';
import { FormContextKey } from 'vee-validate';

// Laravel answers a failed validation of a JSON request with this status
const VALIDATION_STATUS = 422;

const isObject = (value) => value !== null && typeof value === 'object';

const isPlainObject = (value) => Object.prototype.toString.call(value) === '[object Object]';

// The form of useForm() in this component, or the form of a parent component.
// vee-validate finds its form the same way.
function injectForm() {
    return getCurrentInstance()?.provides[FormContextKey] || inject(FormContextKey, undefined);
}

/**
 * Writes a Laravel key in the path form of vee-validate: users.0.email becomes users[0].email.
 * Same rule as normalizeFormPath in vee-validate, so the keys match the errorBag.
 */
function toFormPath(key) {
    const [first, ...rest] = String(key).replace(/\[(\d+)\]/g, '.$1').split('.');

    return rest.reduce(
        (path, segment) => (Number(segment) >= 0 ? `${path}[${segment}]` : `${path}.${segment}`),
        first,
    );
}

function getValue(values, path) {
    return path
        .replace(/\[(\d+)\]/g, '.$1')
        .split('.')
        .reduce((value, segment) => (isObject(value) ? value[segment] : undefined), values);
}

// Copies plain objects and arrays. Other values, for example a File, stay the same object.
function clone(value) {
    if (Array.isArray(value)) return value.map(clone);
    if (isPlainObject(value)) {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
    }

    return value;
}

function isEqual(a, b) {
    if (Array.isArray(a) && Array.isArray(b)) {
        return a.length === b.length && a.every((item, index) => isEqual(item, b[index]));
    }
    if (isPlainObject(a) && isPlainObject(b)) {
        const keys = Object.keys(a);

        return keys.length === Object.keys(b).length
            && keys.every((key) => isEqual(a[key], b[key]));
    }
    if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();

    return Object.is(a, b);
}

/**
 * Reads the validation errors of a Laravel 422 response.
 *
 * @param {unknown} source an axios error or response, an ofetch ($fetch) error,
 *                         the parsed JSON body, or any object with an `errors` key
 * @return {?Object<string, string[]>} the messages of each field in vee-validate paths, or null
 */
export function getLaravelErrors(source) {
    if (!isObject(source)) return null;

    const response = isObject(source.response) ? source.response : source;
    const status = response.status ?? source.statusCode ?? source.status;
    if (status !== undefined && status !== VALIDATION_STATUS) return null;

    // axios: response.data, ofetch: response._data or error.data, plain body: the object itself
    // eslint-disable-next-line no-underscore-dangle -- the name of the body in ofetch
    const bodies = [response.data, response._data, source.data, source];
    const body = bodies.find((item) => isObject(item) && isObject(item.errors));
    if (!body) return null;

    const errors = {};
    Object.keys(body.errors).forEach((key) => {
        const messages = [].concat(body.errors[key])
            .filter((message) => typeof message === 'string' && message !== '');
        if (messages.length) errors[toFormPath(key)] = messages;
    });

    return Object.keys(errors).length ? errors : null;
}

/**
 * Shows Laravel validation errors in a vee-validate form and keeps them visible
 * until the user changes the field or submits the form again.
 *
 * Call it in setup(), after useForm(), or in a component inside <Form>.
 *
 * @param {import('vee-validate').FormContext} [form] the result of useForm().
 *        Default: the form of useForm() in this component, or the form of a parent component.
 */
export function useLaravelErrors(form = injectForm()) {
    if (!form) {
        throw new Error('[vee-validate-laravel] useLaravelErrors() found no form. Call it after useForm() or pass the form.');
    }

    // The server errors that are still active, by vee-validate path
    const errors = ref({});
    // The value of each path when the form was submitted
    let snapshots = {};
    // The form values at the start of the last submit
    let submittedValues;

    function removeMessages(path, messages) {
        const current = form.errorBag.value[path] || [];
        const rest = current.filter((message) => !messages.includes(message));
        if (rest.length !== current.length) {
            form.setFieldError(path, rest.length ? rest : undefined);
        }
    }

    function clear() {
        Object.entries(errors.value).forEach(([path, messages]) => removeMessages(path, messages));
        errors.value = {};
        snapshots = {};
    }

    // vee-validate replaces the errors of a field each time it validates the field.
    // This puts the server messages back while the value is unchanged,
    // and drops them after a change.
    function sync() {
        const active = {};
        Object.entries(errors.value).forEach(([path, messages]) => {
            if (!isEqual(getValue(form.values, path), snapshots[path])) {
                removeMessages(path, messages);

                return;
            }
            active[path] = messages;
            const current = form.errorBag.value[path] || [];
            const missing = messages.filter((message) => !current.includes(message));
            if (missing.length) form.setFieldError(path, [...current, ...missing]);
        });
        if (Object.keys(active).length !== Object.keys(errors.value).length) errors.value = active;
    }

    /**
     * Sets the errors of a Laravel 422 response. Errors of an earlier response go away.
     *
     * @param {unknown} source see getLaravelErrors()
     * @return {?Object<string, string[]>} the errors that were set,
     *                                      or null if the source has no Laravel validation errors
     */
    function set(source) {
        const next = getLaravelErrors(source);
        if (!next) return null;

        clear();
        const values = submittedValues ?? form.values;
        Object.keys(next).forEach((path) => {
            snapshots[path] = clone(getValue(values, path));
        });
        errors.value = next;
        sync();

        return next;
    }

    // handleSubmit() counts up before it validates, resetForm() sets the count back
    watch(() => form.submitCount.value, (count) => {
        clear();
        submittedValues = count > 0 ? clone(form.values) : undefined;
    }, { flush: 'sync' });

    // Default flush: runs after vee-validate finished a validation, before the component renders
    watch([() => form.errorBag.value, () => form.values], sync, { deep: true });

    return { set, clear, errors: readonly(errors) };
}
