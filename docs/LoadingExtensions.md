# Loading Extensions

## In projects
Roc will by default search through the `dependencies` and `devDependencies` within the project `package.json` and find every dependency that matches `roc-package-*` or `roc-plugin-*`. Scoped packages are managed and the scope will not be included when matching against the pattern mentioned. This means that `@scope/roc-package-*` will also be matched for example. They will be sorted based on their name to make the order as consistent as possible. Note that the order will not be relevant in most cases and Roc will load `dependencies` before `devDependencies`.

One thing that is important to note is that packages will always be loaded before plugins, one of the differences between the two types of extensions.

If a specific order is needed, a subset of the Roc packages should be used or if some packages do not match the pattern mentioned above one can define exactly what should be used and in what order using the `roc` property in the project's `package.json` file. This should be an object with two possible properties, `packages` and `plugins` that are arrays that points to Roc extensions in one of the following ways. If defined they will take precedence over `dependencies` and `devDependencies` in `package.json`.

* Absolute path
* Relative path
* Full npm module name  
    For example: `roc-package-web-app-react`
* Short npm module name  
    For example: `web-app-react` _(Will not work with scoped packages where the entire name is needed)_

__Example__

```json
{
  ...
  "dependencies": {
    ...
  },
  "roc": {
      "packages": [
        "roc-package-module",
        "./relative/path/to/package"
      ],
      "plugins": [
        "browsersync",
        "/absolute/path/to/plugin"
      ]
  }
}
```
__Note:__ `browsersync` above will be matched against `roc-plugin-browsersync`.  
__Note:__ Roc will expect that these modules have a default export that exposes at least an object named `roc`.

[See more about how extensions work here.](/docs/Extensions.md)

## In extensions
Extensions do not use their `package.json` to define what other extensions that they use, instead they use the [Roc object](/docs/RocObject.md). More particularly Roc reads the values for [`packages`](/docs/RocObject.md#packages) and [`plugins`](/docs/RocObject.md#plugins) and manages them in the given order. The paths should be absolute and point to the given extension.

Packages will be processed before plugins, the same as with projects.

__Example__
```javascript
{
    packages: [
        require.resolve('roc-package-b')
    ],
    plugins: [
        require.resolve('roc-plugin-a')
    ]
}
```

## Understanding how Roc builds the context
We mentioned above how user can specify extensions in both projects and other extensions. Something that was not mentioned however was how Roc traverses the extensions to build the final [context](/docs/Context.md) that is used by the runtime.

There is a slight difference between how packages and plugins are processed in terms of how the context is built. Packages that are on the same "level", that means have the same parent, will be processed with the same state and then when everything is computed they will be merged. Plugins on the other hand are managed in sequence. This means that the new context that they compute will be used for the next plugin and so on giving them access to what the previous defined.

1. Load all top level packages, [see below](#loading-a-single-extension). If something in the chain fails when loading a top level package that package will be ignored along with any parents it might have had.
2. Load all top level plugins, [see below](#loading-a-single-extension). If something in the chain fails when loading a top level plugin that plugin will be ignored along with any parents it might have had.
3. Manage dependencies from [`-dev` extensions](/docs/Extensions.md#development-extensions).
4. Invoke registered `postInit` functions in the reverse order as they where added. The last one that was registered will run first and so on.
5. Verify [required dependencies](/docs/RocObject.md#requires).
6. Verify that the project does not have local dependencies that also are exported from extensions.
7. Patch `require` with exported dependencies.
8. Read project configuration, `roc.config.js`, and update context with configuration along with `actions` and run a potential `init`.
9. _If launching from the CLI:_ Update the configuration with the values from the CLI options.
10. Run [`update-settings`](/docs/default/Hooks.md#update-settings) allowing extensions to update the settings after the CLI and the user project might have changed it.

### Loading a single extension
Each extension will go through the this recursive algorithm.

1. [Validate that it's a valid extension.](/docs/RocObject.md#what-is-considered-a-valid-object)
2. Process parent packages defined in `packages`. _(Go to step 1 for each of them in order)_
3. Process parent plugins defined in `plugins`. _(Go to step 1 for each of them in order)_
4. Check [required](/docs/RocObject.md#required) extensions.
5. Run [`init`](/docs/RocObject.md#init) or just take values straight from the [Roc object](/docs/RocObject.md).
6. Register [`postInit`](/docs/RocObject.md#init) to run later.
7. Register that the extension has been added and check if we have multiple different version of it already and warn the user.

### Dependency management
An important thing to note is how Roc manages dependencies for a specific extension. When other extension have exported dependencies for an extension to use those that already are defined in the extensions `package.json` will be ignored. This means that the dependency that extensions that have defined in the `package.json` will always be the one that is used.

It's also important to note that non development extensions will have access to the same dependencies that the development version have along with what it has exported. The development version is defined by the suffix `-dev` at the end of the extension name.
