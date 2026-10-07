import {
    effectScope, getCurrentInstance, getCurrentScope, inject, onScopeDispose,
    isRef, readonly, ref, toRaw, watch,
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

// The paths of the array items on the way to a path:
// users[0].tags[1] gives users[0] and users[0].tags[1]
// (replace() with a callback, because matchAll() is newer than the ES2019 build target)
function rowPaths(path) {
    const paths = [];
    path.replace(/\[\d+\]/g, (match, offset) => {
        paths.push(path.slice(0, offset + match.length));

        return match;
    });

    return paths;
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
 * Copies the form values. For each copied object or array it keeps the original object,
 * so a later check can see whether an array item is still the same item.
 */
function snapshot(values) {
    const originals = new WeakMap();
    const copy = (value) => {
        if (value instanceof Date) return new Date(value.getTime());
        let result;
        if (Array.isArray(value)) {
            result = value.map(copy);
        } else if (isPlainObject(value)) {
            result = Object.fromEntries(
                Object.entries(value).map(([key, item]) => [key, copy(item)]),
            );
        } else {
            // Other values, for example a File, stay the same object
            return value;
        }
        originals.set(result, toRaw(value));

        return result;
    };
    const copied = copy(values);

    return {
        value: (path) => getValue(copied, path),
        original: (path) => originals.get(getValue(copied, path)),
    };
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
    const body = bodies.find((item) => isObject(item) && isPlainObject(item.errors));
    if (!body) return null;

    // Object.fromEntries also keeps a key such as __proto__ as a normal key
    const entries = Object.keys(body.errors)
        .map((key) => [
            toFormPath(key),
            [].concat(body.errors[key])
                .filter((message) => typeof message === 'string' && message !== ''),
        ])
        .filter(([, messages]) => messages.length);

    return entries.length ? Object.fromEntries(entries) : null;
}

function createController(form) {
    const scope = effectScope(true);
    // The server errors that are still active, by vee-validate path
    const errors = ref({});
    // For each path: the messages, the value and the array items at the time of the request,
    // the messages this package added, and the error list it wrote last
    let entries = new Map();
    // Counts up on each submit, reset, clear() and set().
    // The response of an older request is ignored.
    let generation = 0;

    const errorsOf = (path) => form.errorBag.value[path];
    // getPathState is not part of the public type, but useForm() returns it since vee-validate 4.10
    const stateOf = (path) => (
        typeof form.getPathState === 'function' ? form.getPathState(path) : undefined
    );

    function publish() {
        errors.value = Object.fromEntries(
            [...entries].map(([path, entry]) => [path, [...entry.messages]]),
        );
    }

    // Removes the messages this package added.
    // If vee-validate replaced the list since, they are gone already.
    function release(path, entry) {
        if (!entry.added.length || toRaw(errorsOf(path)) !== entry.written) return;
        const rest = entry.written.slice(0, entry.written.length - entry.added.length);
        form.setFieldError(path, rest.length ? rest : undefined);
    }

    function releaseAll() {
        entries.forEach((entry, path) => release(path, entry));
        entries = new Map();
        publish();
    }

    function clear() {
        generation += 1;
        releaseAll();
    }

    function isUnchanged(path, entry) {
        return isEqual(getValue(form.values, path), entry.value)
            && entry.rows.every(
                ([rowPath, original]) => toRaw(getValue(form.values, rowPath)) === original,
            );
    }

    // vee-validate replaces the error list of a field each time it validates the field.
    // This puts the server messages back while the value is unchanged,
    // and drops them after a change.
    function sync() {
        let dropped = false;
        entries.forEach((entry, path) => {
            if (!isUnchanged(path, entry)) {
                release(path, entry);
                entries.delete(path);
                dropped = true;

                return;
            }
            if (entry.written && toRaw(errorsOf(path)) === entry.written) {
                // The list is still ours. A silent validation can still mark the field as valid.
                if (stateOf(path)?.valid) form.setFieldError(path, entry.written);

                return;
            }
            const current = [...(errorsOf(path) || [])];
            const added = entry.messages.filter((message) => !current.includes(message));
            const written = [...current, ...added];
            entries.set(path, { ...entry, added, written });
            form.setFieldError(path, written);
        });
        if (dropped) publish();
    }

    function apply(parsed, values) {
        releaseAll();
        Object.entries(parsed).forEach(([path, messages]) => {
            const rows = rowPaths(path)
                .map((rowPath) => [rowPath, values.original(rowPath)])
                .filter(([, original]) => original !== undefined);
            entries.set(path, {
                messages, value: values.value(path), rows, added: [], written: null,
            });
        });
        sync();
        publish();

        return Object.fromEntries(
            Object.entries(errors.value).map(([path, messages]) => [path, [...messages]]),
        );
    }

    function set(source) {
        const parsed = getLaravelErrors(source);
        if (!parsed) return null;
        generation += 1;

        return apply(parsed, snapshot(form.values));
    }

    function handleSubmit(callback, onInvalid) {
        return (event) => {
            // Set below, before the client validation runs. The callback runs after it.
            let request;
            const submit = form.handleSubmit(async (values, actions) => {
                const sent = snapshot(form.values);
                const setLaravelErrors = (source) => {
                    const parsed = getLaravelErrors(source);

                    return parsed && request === generation ? apply(parsed, sent) : null;
                };
                try {
                    return await callback(values, { ...actions, setLaravelErrors });
                } catch (error) {
                    const parsed = getLaravelErrors(error);
                    if (!parsed) throw error;
                    if (request === generation) apply(parsed, sent);

                    return undefined;
                }
            }, onInvalid);
            // handleSubmit() of vee-validate counts up synchronously, so the watcher on
            // submitCount already started a new generation.
            // A later submit, reset or clear() makes this one old.
            const promise = submit(event);
            request = generation;

            return promise;
        };
    }

    scope.run(() => {
        // handleSubmit() counts up before it validates, resetForm() sets the count back
        watch(() => form.submitCount.value, clear, { flush: 'sync' });
        // resetForm() is the only place where vee-validate assigns new initial values.
        // Synchronous, so a set() right after resetForm() stays.
        watch(
            () => (isRef(form.initialValues)
                ? form.initialValues.value
                : form.meta?.value.initialValues),
            clear,
            { flush: 'sync' },
        );
        // Only the active paths are watched, so a form without server errors costs nothing
        watch(() => Object.keys(errors.value).map((path) => {
            const entry = entries.get(path);

            return [
                getValue(form.values, path),
                entry && isUnchanged(path, entry),
                errorsOf(path),
                stateOf(path)?.valid,
            ];
        }), sync, { deep: true });
    });

    return {
        owners: 0,
        dispose() {
            scope.stop();
            clear();
        },
        api: {
            set, clear, handleSubmit, errors: readonly(errors),
        },
    };
}

// One controller for each form, also if several components call useLaravelErrors()
const controllers = new WeakMap();

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

    // useForm() and the injected form are different objects, but they share the errorBag
    const key = toRaw(form.errorBag);
    let controller = controllers.get(key);
    if (!controller) {
        controller = createController(form);
        controllers.set(key, controller);
    }

    if (getCurrentScope()) {
        controller.owners += 1;
        // When the last component that uses the form unmounts, its server errors go away
        onScopeDispose(() => {
            controller.owners -= 1;
            if (controller.owners === 0) {
                controller.dispose();
                controllers.delete(key);
            }
        });
    } else {
        // A call outside of a component keeps the controller for the life of the form
        controller.owners = Infinity;
    }

    return controller.api;
}
