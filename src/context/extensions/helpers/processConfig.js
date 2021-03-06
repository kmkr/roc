import { bold, underline } from 'chalk';
import { isPlainObject, intersection, get, update, union } from 'lodash';

import { RAW } from '../../../configuration/addRaw';

import buildList from './buildList';

// Returns an updated meta object
export default function processConfig(name, extension, state) {
    const {
        extensionConfigPaths,
        extensionMetaPaths,
        stateConfigPaths,
    } = validateConfig(name, extension, state);

    return updateStateMeta(
        name,
        state,
        extensionConfigPaths,
        extensionMetaPaths,
        stateConfigPaths
    );
}

export function validateConfig(name, extension, state) {
    const extensionConfigPaths = getKeys(extension.config, true);
    const extensionMetaPaths = getKeys(extension.meta);
    const stateConfigPaths = getKeys(state.config, true);
    const stateMetaPaths = getKeys(state.meta);

    validateMetaStructure(
        name,
        intersection(
            extensionMetaPaths.paths,
            stateMetaPaths.paths
        ),
        stateConfigPaths,
        extension.meta,
        state.meta
    );

    validateConfigurationStructure(
        name,
        intersection(
            extensionConfigPaths.paths,
            stateConfigPaths.paths
        ),
        extensionConfigPaths,
        stateConfigPaths,
        extension.meta,
        state.meta
    );

    return {
        extensionConfigPaths,
        extensionMetaPaths,
        stateConfigPaths,
        stateMetaPaths,
    };
}

/* eslint-disable no-param-reassign */
function getKeys(obj = {}, flag = false, oldPath = '', allKeys = [], allGroups = []) {
    let isValue = true;
    Object.keys(obj).forEach((key) => {
        const value = obj[key];
        const newPath = oldPath + key;

        if (isPlainObject(value) && key !== RAW && key !== '__meta') {
            isValue = true;
            if (newPath !== 'settings') {
                allGroups.push(true);
                allKeys.push(newPath);
            }
            const keys = getKeys(value, flag, `${newPath}.`, allKeys, allGroups);
            // If nothing was changed we where in a value, not a group
            if (keys.value) {
                allGroups[allGroups.length - 1] = false;
            }
        } else if (flag && key !== '__meta') {
            allKeys.push(newPath);
            allGroups.push(false);
        }
    });

    return {
        paths: allKeys,
        groups: allGroups,
        value: isValue,
    };
}
/* eslint-enable */

function getGroup(obj, path) {
    return !!obj.groups[obj.paths.indexOf(path)];
}

function notInExtensions(extensions, extension) {
    if (Array.isArray(extension)) {
        return !extension.some((e) => extensions.indexOf(e) !== -1);
    }

    return extensions.indexOf(extension) === -1;
}

function validateMetaStructure(name, intersections, stateConfigPaths, extensionMeta, stateMeta) {
    intersections.forEach((intersect) => {
        const wasGroup = getGroup(stateConfigPaths, intersect);

        if (!wasGroup || get(extensionMeta, `${intersect}.__meta`)) {
            const stateExtensions = get(stateMeta, intersect).__extensions || [];
            const extensionExtensions = get(extensionMeta, intersect).__extensions || [];

            // If it is a group the override info will be on __meta and if not it will be directly on the object
            const override = (get(extensionMeta, intersect, {}).__meta || {}).override ||
                get(extensionMeta, intersect, {}).override;

            if (
                notInExtensions(stateExtensions, name) &&
                override !== true &&
                notInExtensions(stateExtensions, override) &&
                notInExtensions(stateExtensions, extensionExtensions)
            ) {
                // Fail early, might be more errors after this
                // + This gives a better/more concise error for the project developer
                // + We do not waste computation when we already know there is an error
                // - The extension developer will not know the entire picture, just one of potentially several errors
                const overrideMessage = !override ?
                    'No override value was specified, it should probably be one of the extensions above.\n' :
                    `The override did not match the possible values, it was: ${override}\n`;
                throw new Error(
                    'Meta structure was changed without specifying override.\n' + // eslint-disable-line
                    `Meta for ${bold(intersect)} was changed in ${name} and has been altered before by:\n` +
                    buildList(stateExtensions) +
                    overrideMessage +
                    `Contact the developer of ${underline(name)} for help.`
                );
            }
        }
    });
}

function validateConfigurationStructure(
    name, intersections, extensionConfigPaths, stateConfigPaths, extensionMeta, stateMeta
) {
    intersections.forEach((intersect) => {
        const wasGroup = getGroup(stateConfigPaths, intersect);
        const isGroup = getGroup(extensionConfigPaths, intersect);
        if (wasGroup !== isGroup) {
            const stateExtensions = get(stateMeta, intersect).__extensions || [];
            const extensionExtensions = get(extensionMeta, intersect, {}).__extensions || [];

            // If it is a group the override info will be on __meta and if not it will be directly on the object
            const override = (get(extensionMeta, intersect, {}).__meta || {}).override ||
                get(extensionMeta, intersect, {}).override;

            if (
                notInExtensions(stateExtensions, name) &&
                override !== true &&
                notInExtensions(stateExtensions, override) &&
                notInExtensions(stateExtensions, extensionExtensions)
            ) {
                // Fail early, might be more errors after this
                // + This gives a better/more concise error for the project developer
                // + We do not waste computation when we already know there is an error
                // - The extension developer will not know the entire picture, just one of potentially several errors
                throw new Error(
                    'Configuration structure was changed without specifying override in meta.\n' +
                    `Was ${wasGroup ? 'an object' : 'a value'} and is now ${isGroup ? 'an object' : 'a value'}.\n` +
                    `The setting is question is: ${bold(intersect)}\n` +
                    `Contact the developer of ${underline(name)} for help.`
                );
            }
        }
    });
}

function updateStateMeta(name, state, extensionConfigPaths, extensionMetaPaths, stateConfigPaths) {
    const newState = { ...state };

    // Defining meta for something means that the __extensions should be updated
    // Might be the case that the value has changed and in that case the old value will be replaced in the next loop
    extensionMetaPaths.paths.forEach((path) =>
        update(newState.meta, path, (previous = {}) =>
            ({
                ...previous,
                __extensions: union(previous.__extensions || [], [name]),
            })
        )
    );

    extensionConfigPaths.paths.forEach((path, index) => {
        const changed = getGroup(stateConfigPaths, path) !== extensionConfigPaths.groups[index];
        update(newState.meta, path, (previous = {}) => {
            // If it has changed we will reset it
            const newValue = changed ?
                {} :
                previous;
            const newExtensions = changed ?
                [] :
                previous.__extensions || [];

            return {
                ...newValue,
                __extensions: union(newExtensions, [name]),
            };
        });
    });

    return newState.meta;
}
