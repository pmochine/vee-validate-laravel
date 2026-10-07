import { describe, expect, it } from 'vitest';
import Vue from 'vue';
import VeeValidate from 'vee-validate';
import VeeValidateLaravel from '../src/vee-validate-laravel';

Vue.config.productionTip = false;
Vue.config.devtools = false;
Vue.use(VeeValidate);
Vue.use(VeeValidateLaravel);

// The axios error.response of a failed Laravel validation
const laravelResponse = (errors) => ({
    status: 422,
    data: { message: 'The given data was invalid.', errors },
});

const mountForm = () => new Vue({
    render(h) {
        return h('p', this.errors.first('name'));
    },
}).$mount();

describe('$addLaravelErrors', () => {
    it('adds each error under its field, so errors.has() and errors.first() find it', () => {
        const vm = mountForm();
        vm.$addLaravelErrors(laravelResponse({ name: ['The name field is required.'] }));

        expect(vm.errors.has('name')).toBe(true);
        expect(vm.errors.first('name')).toBe('The name field is required.');
    });

    it('shows the error in the template', async () => {
        const vm = mountForm();
        vm.$addLaravelErrors(laravelResponse({ name: ['The name field is required.'] }));
        await Vue.nextTick();

        expect(vm.$el.textContent).toBe('The name field is required.');
    });

    it('joins the messages of a field and returns the messages of all fields', () => {
        const vm = mountForm();
        const messages = vm.$addLaravelErrors(laravelResponse({
            name: ['The name field is required.', 'The name must be at least 3 characters.'],
            email: ['The email has already been taken.'],
        }));

        expect(messages).toEqual({
            name: 'The name field is required., The name must be at least 3 characters.',
            email: 'The email has already been taken.',
        });
        expect(vm.errors.first('email')).toBe('The email has already been taken.');
    });

    it('removes the errors of the previous response', () => {
        const vm = mountForm();
        vm.$addLaravelErrors(laravelResponse({ name: ['The name field is required.'] }));
        vm.$addLaravelErrors(laravelResponse({ email: ['The email field is required.'] }));

        expect(vm.errors.has('name')).toBe(false);
        expect(vm.errors.has('email')).toBe(true);
    });

    it('returns null for a response without validation errors', () => {
        const vm = mountForm();

        expect(vm.$addLaravelErrors(undefined)).toBeNull();
        expect(vm.$addLaravelErrors({ status: 500, data: { message: 'Server Error' } })).toBeNull();
    });

    it('returns null without a validator', () => {
        const withoutValidator = {};

        expect(Vue.prototype.$addLaravelErrors.call(withoutValidator, laravelResponse({ name: ['x'] }))).toBeNull();
    });
});
