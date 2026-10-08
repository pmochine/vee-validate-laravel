import type { Ref } from 'vue';

/** The messages of each field, by vee-validate path, for example `users[0].email`. */
export type LaravelErrors = Record<string, string[]>;

/**
 * The parts of a vee-validate form that useLaravelErrors() uses. useForm() returns all of them.
 * The type does not import vee-validate, so it also works in CommonJS projects.
 */
export interface LaravelErrorsForm {
    values: object;
    errorBag: Ref<Partial<Record<string, string[]>>>;
    submitCount: Ref<number>;
    meta?: Ref<{ initialValues?: unknown }>;
    setFieldError(field: string, message: string | string[] | undefined): void;
    handleSubmit(
        callback: (values: any, actions: any) => unknown,
        onInvalid?: (context: any) => unknown,
    ): (event?: Event) => Promise<unknown>;
}

/** The second argument of the callback of handleSubmit(): the actions of vee-validate and setLaravelErrors(). */
export type LaravelSubmitActions = Record<string, any> & {
    /**
     * Sets the errors of a Laravel 422 response for this submit, for example in the onError callback of Inertia.
     * Returns the active server errors, or null if the source has no Laravel validation errors
     * or if a newer submit, a reset or clear() came in between.
     */
    setLaravelErrors(source: unknown): LaravelErrors | null;
};

export interface UseLaravelErrorsReturn {
    /**
     * Like handleSubmit() of vee-validate. If the callback throws a Laravel 422 error,
     * the errors show in the form and the promise resolves. Other errors are thrown again.
     * The errors belong to the values at the start of the callback. A response of an older submit is ignored.
     */
    handleSubmit<TValues = any, TReturn = unknown>(
        callback: (values: TValues, actions: LaravelSubmitActions) => TReturn | Promise<TReturn>,
        onInvalid?: (context: any) => unknown,
    ): (event?: Event) => Promise<TReturn | undefined>;
    /**
     * Sets the errors of a Laravel 422 response and removes the errors of an earlier response.
     * The errors belong to the current form values.
     * Returns the active server errors, or null if the source has no Laravel validation errors.
     */
    set(source: unknown): LaravelErrors | null;
    /** Removes all server errors. Client errors stay. */
    clear(): void;
    /** The server errors that are still active. */
    readonly errors: Readonly<Ref<{ readonly [path: string]: readonly string[] }>>;
}

/**
 * Reads the validation errors of a Laravel 422 response.
 * Accepts an axios error or response, an ofetch ($fetch) error, the parsed JSON body,
 * or any object with an `errors` object.
 * Returns null for other status codes and for sources without an `errors` object.
 */
export function getLaravelErrors(source: unknown): LaravelErrors | null;

/**
 * Shows Laravel validation errors in a vee-validate form and keeps them visible
 * until the user changes the field or submits the form again.
 * Call it in setup(), after useForm(), or in a component inside <Form>.
 * All calls for the same form share one state.
 */
export function useLaravelErrors(form?: LaravelErrorsForm): UseLaravelErrorsReturn;
