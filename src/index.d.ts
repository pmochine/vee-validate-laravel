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
    setFieldError(field: string, message: string | string[] | undefined): void;
}

export interface UseLaravelErrorsReturn {
    /**
     * Sets the errors of a Laravel 422 response and removes the errors of an earlier response.
     * Accepts an axios error or response, an ofetch ($fetch) error, the parsed JSON body,
     * or any object with an `errors` key.
     * Returns the errors that were set, or null if the source has no Laravel validation errors.
     */
    set(source: unknown): LaravelErrors | null;
    /** Removes all server errors. */
    clear(): void;
    /** The server errors that are still active. */
    readonly errors: Readonly<Ref<Readonly<LaravelErrors>>>;
}

/**
 * Reads the validation errors of a Laravel 422 response.
 * Returns null for other status codes and for sources without an `errors` object.
 */
export function getLaravelErrors(source: unknown): LaravelErrors | null;

/**
 * Shows Laravel validation errors in a vee-validate form and keeps them visible
 * until the user changes the field or submits the form again.
 * Call it in setup(), after useForm(), or in a component inside <Form>.
 */
export function useLaravelErrors(form?: LaravelErrorsForm): UseLaravelErrorsReturn;
