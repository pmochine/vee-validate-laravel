const Plugin = {
    install(Vue) {
        // adding an instance method
        Vue.prototype.$addLaravelErrors = addToErrorBag;
    },
};

/**
 * Adds errors to the vee-validate error bag
 *
 * @param   {obj}  errorResponse  [axios error.response]
 *
 * @return  {?obj}                 [returns the all errors with keys]
 */
function addToErrorBag(errorResponse) {
    // only allow this function to be run if the validator exists
    if (!hasProperty(this, '$validator')) return null;

    // check if there is data in the response
    if (!hasProperty(errorResponse, 'data')) return null;

    // clear errors
    this.$validator.errors.clear();

    // check if errors exist
    if (!hasProperty(errorResponse.data, 'errors')) return null;

    return loopThroughErrors.call(this, errorResponse.data);
}

const hasProperty = (obj, key) => {
    if (!obj) return false;

    const has = Object.prototype.hasOwnProperty;

    return has.call(obj, key);
};

function loopThroughErrors(data) {
    if (!data) {
        return null;
    }

    // Attempt to parse Laravel-structured validation errors.
    try {
        const messages = {};

        Object.keys(data.errors).forEach((key) => {
            messages[key] = data.errors[key].join(', ');

            this.$validator.errors.add({
                key,
                msg: messages[key],
            });
        });

        return messages;
    } catch (e) {
        return data;
    }
}

export default Plugin;
