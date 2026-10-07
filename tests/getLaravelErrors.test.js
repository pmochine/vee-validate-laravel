import { describe, expect, it } from 'vitest';
import { getLaravelErrors } from '../src/index';

// The JSON body of a Laravel 422 response
const body = {
    message: 'The email has already been taken. (and 1 more error)',
    errors: {
        email: ['The email has already been taken.'],
        'users.0.name': ['The users.0.name field is required.', 'The users.0.name must be a string.'],
    },
};

const expected = {
    email: ['The email has already been taken.'],
    'users[0].name': ['The users.0.name field is required.', 'The users.0.name must be a string.'],
};

describe('getLaravelErrors', () => {
    it('reads an axios error', () => {
        const error = { isAxiosError: true, status: 422, response: { status: 422, data: body } };

        expect(getLaravelErrors(error)).toEqual(expected);
    });

    it('reads an axios response', () => {
        expect(getLaravelErrors({ status: 422, data: body })).toEqual(expected);
    });

    it('reads an ofetch error, as $fetch in Nuxt throws it', () => {
        const error = {
            statusCode: 422, status: 422, data: body, response: { status: 422, _data: body },
        };

        expect(getLaravelErrors(error)).toEqual(expected);
    });

    it('reads the parsed JSON body', () => {
        expect(getLaravelErrors(body)).toEqual(expected);
    });

    it('reads single messages, as Inertia passes them to onError', () => {
        expect(getLaravelErrors({ errors: { email: 'The email has already been taken.' } })).toEqual({
            email: ['The email has already been taken.'],
        });
    });

    it('keeps bracket paths', () => {
        expect(getLaravelErrors({ errors: { 'users[0].name': ['x'] } })).toEqual({ 'users[0].name': ['x'] });
    });

    it('returns null for other status codes', () => {
        expect(getLaravelErrors({ response: { status: 500, data: body } })).toBeNull();
        expect(getLaravelErrors({ statusCode: 401, data: body })).toBeNull();
        expect(getLaravelErrors({ status: 200, data: body })).toBeNull();
    });

    it('returns null without validation errors', () => {
        expect(getLaravelErrors(new Error('Network Error'))).toBeNull();
        expect(getLaravelErrors({ response: { status: 422, data: { message: 'Unprocessable' } } })).toBeNull();
        expect(getLaravelErrors({ errors: {} })).toBeNull();
        expect(getLaravelErrors({ errors: [] })).toBeNull();
        expect(getLaravelErrors(undefined)).toBeNull();
        expect(getLaravelErrors('422')).toBeNull();
    });

    it('skips messages that are not text', () => {
        expect(getLaravelErrors({ errors: { email: ['ok', 3, null, ''], name: [] } })).toEqual({ email: ['ok'] });
    });
});
