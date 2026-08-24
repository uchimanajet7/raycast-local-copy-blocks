import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { compareVersions, parseMinimumNodeVersion, parseMinimumNpmVersion } from "./toolchain.mjs";
import { getDirectDependencyRangeDrift, getRaycastNodeTypesContract } from "./update-dependencies.mjs";

const npmrcPath = ".npmrc";
const nodeVersionPath = ".node-version";
const packageJsonPath = "package.json";
const packageLockPath = "package-lock.json";
const minimumNodeVersion = ">=22.22.2";
const minimumNpmVersion = ">=11.17.0";
const allowDirectRangeDriftArgument = "--allow-direct-range-drift";
const typeScriptCompatibilityPackageName = "@typescript/typescript6";
const typeScriptNativeAliasName = "@typescript/native";
const unexpectedArguments = process.argv.slice(2).filter((argument) => argument !== allowDirectRangeDriftArgument);
const allowDirectRangeDrift = process.argv.includes(allowDirectRangeDriftArgument);
const expectedNpmrcLines = [
  "omit-lockfile-registry-resolved=true",
  "strict-peer-deps=true",
  "strict-allow-scripts=true",
  "engine-strict=true",
];
const nodeWorkflowVersionFiles = new Map([
  [".github/workflows/build.yml", [".node-version"]],
  [".github/workflows/release.yml", [".node-version", ".node-version"]],
  [".github/workflows/publish-release-to-raycast.yml", ["release-source/.node-version"]],
]);

assert.deepEqual(
  unexpectedArguments,
  [],
  `unsupported dependency verification arguments: ${unexpectedArguments.join(", ")}`,
);

const npmrcLines = (await readFile(npmrcPath, "utf8"))
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line.length > 0 && !line.startsWith("#") && !line.startsWith(";"));

assert.deepEqual(
  npmrcLines,
  expectedNpmrcLines,
  `${npmrcPath} must omit registry resolved URLs, enforce peer dependencies and install-script review, and contain no registry or authentication settings`,
);

const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
const selectedNodeVersion = (await readFile(nodeVersionPath, "utf8")).trim();
const declaredMinimumNodeVersion = parseMinimumNodeVersion(packageJson.engines?.node);
parseMinimumNpmVersion(packageJson.engines?.npm);

assert.match(
  selectedNodeVersion,
  /^\d+\.\d+\.\d+$/,
  `${nodeVersionPath} must record an exact tested CI Node.js version`,
);
assert.equal(
  compareVersions(selectedNodeVersion, declaredMinimumNodeVersion) >= 0,
  true,
  `${nodeVersionPath} must satisfy engines.node`,
);
assert.equal(
  packageJson.engines?.node,
  minimumNodeVersion,
  `${packageJsonPath} must declare the Raycast Node.js minimum`,
);
assert.equal(
  packageJson.engines?.npm,
  minimumNpmVersion,
  `${packageJsonPath} must require an npm version that enforces the install-script policy`,
);
assert.equal(
  Object.hasOwn(packageJson, "packageManager"),
  false,
  `${packageJsonPath} must not require an exact npm version`,
);
assert.equal(
  packageJson.devEngines?.packageManager,
  undefined,
  `${packageJsonPath} devEngines must not require an exact npm version`,
);
assert.equal(
  Object.hasOwn(packageJson.scripts ?? {}, "check:toolchain"),
  false,
  `${packageJsonPath} must not expose a separate toolchain freshness gate`,
);
assert.equal(
  Object.hasOwn(packageJson.scripts ?? {}, "update:toolchain"),
  false,
  `${packageJsonPath} must not split Node.js selection from dependency maintenance`,
);
assert.equal(
  packageJson.scripts?.["update:dependencies"],
  "node scripts/update-dependencies.mjs",
  `${packageJsonPath} must expose the established local dependency apply-and-verify task`,
);
assert.equal(
  packageJson.scripts?.build,
  "ray build -e dist -o dist",
  `${packageJsonPath} build must use an explicit output directory so Raycast CLI does not launch or refresh the app`,
);
assert.equal(
  packageJson.scripts?.migrate,
  "npx --yes @raycast/migration@latest .",
  `${packageJsonPath} migration must run the latest official Raycast migration package non-interactively`,
);

const projectDependencyNames = Object.keys({
  ...(packageJson.dependencies ?? {}),
  ...(packageJson.devDependencies ?? {}),
  ...(packageJson.optionalDependencies ?? {}),
});
assert.equal(
  projectDependencyNames.includes("@raycast/migration"),
  false,
  `${packageJsonPath} must not pin the on-demand Raycast migration package as a project dependency`,
);

const packageLock = JSON.parse(await readFile(packageLockPath, "utf8"));
const rootLockfilePackage = packageLock.packages?.[""];
const packageEntries = Object.entries(packageLock.packages ?? {});
const resolvedEntries = packageEntries.filter(([, packageMetadata]) => packageMetadata.resolved !== undefined);
const missingIntegrityEntries = packageEntries.filter(
  ([packagePath, packageMetadata]) =>
    packagePath.length > 0 &&
    packageMetadata.version !== undefined &&
    packageMetadata.link !== true &&
    packageMetadata.inBundle !== true &&
    packageMetadata.integrity === undefined,
);
const installScriptPackages = [
  ...new Set(
    packageEntries
      .filter(([, packageMetadata]) => packageMetadata.hasInstallScript === true)
      .map(([packagePath]) => packageNameFromLockfilePath(packagePath)),
  ),
].sort();
const installScriptPolicy = packageJson.allowScripts ?? {};
const installScriptPolicyPackages = Object.keys(installScriptPolicy).sort();
const invalidInstallScriptPolicyValues = Object.entries(installScriptPolicy)
  .filter(([, decision]) => typeof decision !== "boolean")
  .map(([packageName]) => packageName);

assert.deepEqual(
  rootLockfilePackage?.engines,
  packageJson.engines,
  `${packageLockPath} root engines must match package.json`,
);
assert.deepEqual(
  rootLockfilePackage?.dependencies,
  packageJson.dependencies,
  `${packageLockPath} root dependencies must match package.json`,
);
assert.deepEqual(
  rootLockfilePackage?.devDependencies,
  packageJson.devDependencies,
  `${packageLockPath} root devDependencies must match package.json`,
);
if (!allowDirectRangeDrift) {
  assert.deepEqual(
    getDirectDependencyRangeDrift(packageJson, packageLock),
    [],
    `${packageJsonPath} direct dependency lower bounds must match the resolved versions recorded by ${packageLockPath}`,
  );
}

const raycastApiPackage = packageLock.packages?.["node_modules/@raycast/api"];
const expectedNodeTypesVersion = getRaycastNodeTypesContract(raycastApiPackage ?? {});
const declaredNodeTypesVersion = packageJson.devDependencies?.["@types/node"];
const declaredReactTypesRange = packageJson.devDependencies?.["@types/react"];
const resolvedNodeTypesVersion = packageLock.packages?.["node_modules/@types/node"]?.version;
const resolvedReactTypesVersion = packageLock.packages?.["node_modules/@types/react"]?.version;
const resolvedReactVersion = packageLock.packages?.["node_modules/react"]?.version;
const declaredTypeScriptRange = packageJson.devDependencies?.typescript;
const declaredNativeTypeScriptRange = packageJson.devDependencies?.["@typescript/native"];
const resolvedTypeScriptPackage = packageLock.packages?.["node_modules/typescript"];
const resolvedNativeTypeScriptPackage = packageLock.packages?.["node_modules/@typescript/native"];

assert.equal(
  declaredNodeTypesVersion,
  expectedNodeTypesVersion,
  `${packageJsonPath} must directly own the exact @types/node contract declared by @raycast/api`,
);
assert.equal(
  rootLockfilePackage?.devDependencies?.["@types/node"],
  expectedNodeTypesVersion,
  `${packageLockPath} root must record the direct @types/node type contract`,
);
assert.equal(
  resolvedNodeTypesVersion,
  expectedNodeTypesVersion,
  `${packageLockPath} must resolve the root @types/node type contract`,
);
assert.match(
  declaredReactTypesRange ?? "",
  /^\^\d+\.\d+\.\d+$/,
  `${packageJsonPath} must directly own @types/react as a caret devDependency`,
);
assert.equal(
  rootLockfilePackage?.devDependencies?.["@types/react"],
  declaredReactTypesRange,
  `${packageLockPath} root must record the direct @types/react development contract`,
);
assert.equal(
  majorMinor(resolvedReactTypesVersion),
  majorMinor(resolvedReactVersion),
  `${packageLockPath} root @types/react must match the root React major and minor version`,
);
assert.equal(
  projectDependencyNames.includes("csstype"),
  false,
  `${packageJsonPath} must leave csstype resolution to @types/react`,
);
assert.equal(
  packageJson.overrides?.csstype,
  undefined,
  `${packageJsonPath} must not override the csstype version selected for @types/react`,
);

if (declaredNativeTypeScriptRange === undefined) {
  assert.match(
    declaredTypeScriptRange ?? "",
    /^\^\d+\.\d+\.\d+$/,
    `${packageJsonPath} must use one caret TypeScript dependency before the TypeScript 7 tooling split`,
  );
  assert.equal(
    Number(resolvedTypeScriptPackage?.version?.split(".")[0]) < 7,
    true,
    `${packageLockPath} must not resolve TypeScript 7 without its separate compatibility tooling package`,
  );
  assert.equal(
    resolvedNativeTypeScriptPackage,
    undefined,
    `${packageLockPath} must not retain an undeclared TypeScript native compiler alias`,
  );
} else {
  assert.match(
    declaredNativeTypeScriptRange,
    /^npm:typescript@\^\d+\.\d+\.\d+$/,
    `${packageJsonPath} must alias @typescript/native to the latest TypeScript CLI line`,
  );
  assert.match(
    declaredTypeScriptRange ?? "",
    /^npm:@typescript\/typescript6@\^6\.\d+\.\d+$/,
    `${packageJsonPath} must provide the TypeScript 6 compatibility API under the typescript package name`,
  );
  assert.equal(
    rootLockfilePackage?.devDependencies?.["@typescript/native"],
    declaredNativeTypeScriptRange,
    `${packageLockPath} root must record the native TypeScript CLI alias`,
  );
  assert.equal(
    rootLockfilePackage?.devDependencies?.typescript,
    declaredTypeScriptRange,
    `${packageLockPath} root must record the TypeScript tooling compatibility alias`,
  );
  assert.equal(
    Number(resolvedNativeTypeScriptPackage?.version?.split(".")[0]) >= 7,
    true,
    `${packageLockPath} native TypeScript alias must resolve TypeScript 7 or later`,
  );
  assert.equal(
    Number(resolvedTypeScriptPackage?.version?.split(".")[0]),
    6,
    `${packageLockPath} typescript package name must resolve the TypeScript 6 compatibility API`,
  );
  assert.equal(
    resolvedNativeTypeScriptPackage?.bin?.tsc,
    "bin/tsc",
    `${packageLockPath} native TypeScript alias must provide the tsc command`,
  );
  assert.equal(
    resolvedTypeScriptPackage?.bin?.tsc6,
    "bin/tsc6",
    `${packageLockPath} TypeScript compatibility package must provide the tsc6 command`,
  );
}

assert.deepEqual(
  resolvedEntries.map(([packagePath]) => packagePath),
  [],
  `${packageLockPath} must not pin registry-specific resolved URLs`,
);
assert.deepEqual(
  missingIntegrityEntries.map(([packagePath]) => packagePath),
  [],
  `${packageLockPath} packages must retain integrity metadata`,
);
assert.deepEqual(
  installScriptPolicyPackages,
  installScriptPackages,
  `${packageJsonPath} allowScripts must review every package with an install script by package name, without version pins or stale entries`,
);
assert.deepEqual(invalidInstallScriptPolicyValues, [], `${packageJsonPath} allowScripts decisions must be boolean`);

const dependencyUpdater = await readFile("scripts/update-dependencies.mjs", "utf8");
const toolchainHelper = await readFile("scripts/toolchain.mjs", "utf8");

assert.equal(
  toolchainHelper.includes("parseMinimumNodeVersion") && toolchainHelper.includes("parseMinimumNpmVersion"),
  true,
  "the toolchain helper must parse the Node.js and npm engine minimums used by dependency maintenance",
);
assert.equal(
  /\b(?:fetch|nodeReleaseIndex|getLatestCompatibleLtsNode|selectLatestCompatibleLtsNode)\b/.test(toolchainHelper),
  false,
  "the toolchain helper must not select or fetch a replacement Node.js release",
);
assert.equal(
  /\b(?:writeFile|execFile|spawn)\b/.test(toolchainHelper) || /\b(?:mise|nvm|fnm|volta|asdf)\b/.test(toolchainHelper),
  false,
  "the toolchain helper must remain read-only and independent of local Node.js version managers",
);

const dependencyUpdateCommands = [
  "const runningNpmVersion = await readNpmVersion(execute)",
  "assertMaintenanceRuntime({",
  'await execute("npm", ["run", "check:dependencies", "--", "--allow-direct-range-drift"])',
  'await execute("npm", ["ci"])',
  'await execute("npm", ["run", "migrate"])',
  "const initialOutdated = await readOutdated(execute)",
  "await prepareMajorDependencyUpdates(repoRootUrl, initialOutdated, execute)",
  "await applyCompatibleDependencyUpdates(execute)",
  "await alignNodeTypesWithRaycastTypeContract(repoRootUrl)",
  'await execute("npm", ["install", "--ignore-scripts"])',
  "const rangeDrift = getDirectDependencyRangeDrift(packageJson, packageLock)",
  "const directDependencyDowngrades = getDirectDependencyDowngrades(",
  "const finalStatus = classifyOutdated(finalOutdated, {",
  'await execute("npm", ["run", "check:dependencies"])',
  'await execute("npm", ["ci"])',
  'await execute("npm", ["run", "lint"])',
  'await execute("npm", ["run", "build"])',
  'await execute("npm", ["run", "lint:raycast"])',
];
let previousDependencyUpdateCommandIndex = -1;
const dependencyUpdateCommandIndices = dependencyUpdateCommands.map((command) => {
  const commandIndex = dependencyUpdater.indexOf(command, previousDependencyUpdateCommandIndex + 1);
  previousDependencyUpdateCommandIndex = commandIndex;
  return commandIndex;
});

assert.equal(
  dependencyUpdateCommandIndices.every((index) => index !== -1),
  true,
  "dependency updates must preserve the engines preflight, policy, baseline install, migration, candidate, resolution, postcondition, clean-install, and verification order",
);
assert.equal(
  findAllIndices(dependencyUpdater, 'await execute("npm", ["ci"])').length,
  2,
  "dependency updates must verify one clean baseline and one clean resolved result",
);
assert.equal(
  findAllIndices(dependencyUpdater, '["update", "--save", "--ignore-scripts"]').length,
  1,
  "dependency updates must refresh the compatible graph and persist direct dependency lower bounds once",
);
assert.equal(
  findAllIndices(dependencyUpdater, 'await execute("npm", ["install", "--ignore-scripts"])').length,
  1,
  "dependency updates must re-resolve once when the @raycast/api type contract changes",
);
assert.equal(
  dependencyUpdater.includes("npm-check-updates") ||
    dependencyUpdater.includes('"--peer"') ||
    dependencyUpdater.includes('"--enginesNode"'),
  false,
  "dependency updates must use the npm resolver and must not filter valid manifest updates through installed peer versions",
);
assert.equal(
  /(?:getToolchainUpdatePlan|Target LTS Node\.js|preferred version manager|\.node-version)/.test(dependencyUpdater),
  false,
  "dependency updates must neither require an exact Node.js selection nor modify .node-version",
);
assert.equal(
  dependencyUpdater.includes("getDirectDependencyDowngrades") &&
    dependencyUpdater.includes("would downgrade resolved direct dependencies"),
  true,
  "dependency updates must stop instead of silently downgrading a resolved direct dependency",
);
assert.equal(
  dependencyUpdater.includes("raycastTypeContractManagedDependencies") &&
    dependencyUpdater.includes("formatRaycastTypeContractStatus") &&
    dependencyUpdater.includes("No unresolved dependency update decisions remain.") &&
    !dependencyUpdater.includes("Managed by the @raycast/api runtime contract"),
  true,
  "dependency updates must report the selected @types/node type contract separately from registry latest and unresolved decisions",
);
assert.equal(
  dependencyUpdater.includes('const allowMajorArgument = "--allow-major"') &&
    dependencyUpdater.includes("applyMajorDependencyDeclarations") &&
    dependencyUpdater.includes("npm run update:dependencies -- --allow-major"),
  true,
  "dependency updates must connect every reported major-version decision to one explicit apply-and-verify action",
);
assert.equal(
  dependencyUpdater.includes(typeScriptCompatibilityPackageName) &&
    dependencyUpdater.includes(typeScriptNativeAliasName),
  true,
  "TypeScript major updates must preserve the compiler and lint-tooling relationship through the official split",
);
assert.equal(
  dependencyUpdater.includes("--legacy-peer-deps") ||
    dependencyUpdater.includes("--force") ||
    dependencyUpdater.includes("dangerously-allow-all-scripts"),
  false,
  "dependency updates must not bypass peer or install-script policy",
);

const dependabot = await readFile(".github/dependabot.yml", "utf8");
assert.equal(
  dependabot.includes('versioning-strategy: "increase"') &&
    dependabot.includes("non-major-npm-version-updates:") &&
    /update-types:\s*\n\s*- "minor"\s*\n\s*- "patch"/.test(dependabot),
  true,
  "Dependabot must persist reviewed lower bounds while grouping only npm minor and patch version updates",
);
assert.equal(
  dependabot.includes("all-npm-version-updates:"),
  false,
  "npm major version updates must remain visible as individual maintainer decisions",
);
assert.equal(
  dependabot.includes('dependency-name: "@types/node"'),
  true,
  "Dependabot must not update @types/node independently of the @raycast/api type contract",
);

const workflowPaths = (await readdir(".github/workflows"))
  .filter((fileName) => /\.ya?ml$/.test(fileName))
  .map((fileName) => `.github/workflows/${fileName}`)
  .sort();
const workflowContents = new Map(
  await Promise.all(workflowPaths.map(async (workflowPath) => [workflowPath, await readFile(workflowPath, "utf8")])),
);
const splitToolchainWorkflowPaths = workflowPaths.filter((workflowPath) =>
  /(?:check:toolchain|update:toolchain|scripts\/toolchain\.mjs|nodejs\.org\/dist\/index\.json)/.test(
    workflowContents.get(workflowPath),
  ),
);
const setupNodeWorkflowPaths = workflowPaths.filter((workflowPath) =>
  workflowContents.get(workflowPath).includes("uses: actions/setup-node@"),
);

assert.deepEqual(
  splitToolchainWorkflowPaths,
  [],
  "workflows must not restore a separate Node.js freshness gate outside dependency maintenance",
);
assert.deepEqual(
  setupNodeWorkflowPaths,
  [...nodeWorkflowVersionFiles.keys()].sort(),
  "every workflow that uses setup-node must have an explicit bootstrap classification",
);

for (const [workflowPath, workflow] of workflowContents) {
  assert.equal(/^[ \t]+cache:\s*["']?npm["']?\s*$/m.test(workflow), false, `${workflowPath} must not cache npm`);

  for (const match of workflow.matchAll(/^\s*uses:\s+([^\s#]+)(?:\s+#.*)?$/gm)) {
    const actionReference = match[1];

    if (actionReference.startsWith("./")) {
      continue;
    }

    assert.match(
      actionReference,
      /^[^@]+@[0-9a-f]{40}$/,
      `${workflowPath} external actions must use immutable full commit SHAs`,
    );
  }
}

for (const [workflowPath, expectedVersionFiles] of nodeWorkflowVersionFiles) {
  const workflow = workflowContents.get(workflowPath);

  assert.equal(
    findAllIndices(workflow, "uses: actions/setup-node@").length,
    expectedVersionFiles.length,
    `${workflowPath} must have the expected Node.js setup paths`,
  );
  assert.equal(
    findAllIndices(workflow, "package-manager-cache: false").length,
    expectedVersionFiles.length,
    `${workflowPath} must disable every setup-node npm cache`,
  );
  assert.equal(
    /^\s*node-version:/m.test(workflow),
    false,
    `${workflowPath} must not duplicate a literal Node.js version`,
  );

  const configuredVersionFiles = [...workflow.matchAll(/^\s*node-version-file:\s*(\S+)\s*$/gm)].map(
    (match) => match[1],
  );
  assert.deepEqual(
    configuredVersionFiles,
    expectedVersionFiles,
    `${workflowPath} must derive every Node.js setup from the expected source artifact`,
  );
}

const dependencyCheckCommand = "run: npm run check:dependencies";
const installCommand = "run: npm ci";
const buildWorkflow = workflowContents.get(".github/workflows/build.yml");
const buildCheckIndex = buildWorkflow.indexOf(dependencyCheckCommand);
const buildInstallIndex = buildWorkflow.indexOf(installCommand);

assert.equal(
  buildCheckIndex !== -1 && buildCheckIndex < buildInstallIndex,
  true,
  "build workflow must verify dependency policy before its only npm ci",
);
assert.equal(findAllIndices(buildWorkflow, installCommand).length, 1, "build workflow must own one dependency install");
assert.equal(
  /NPM_CONFIG_(?:REGISTRY|USERCONFIG|GLOBALCONFIG)/.test(buildWorkflow),
  false,
  "build workflow must leave registry and npm config selection to the execution environment",
);

const releaseWorkflow = workflowContents.get(".github/workflows/release.yml");
assert.equal(
  releaseWorkflow.includes("uses: ./.github/workflows/build.yml"),
  true,
  "release workflow must reuse the verified build workflow",
);
assert.equal(releaseWorkflow.includes(installCommand), false, "release metadata jobs must not reinstall dependencies");

const publishWorkflow = workflowContents.get(".github/workflows/publish-release-to-raycast.yml");
const publishCheckoutIndex = publishWorkflow.indexOf("path: release-source");
const publishNodeIndex = publishWorkflow.indexOf("node-version-file: release-source/.node-version");
const publishCommandIndex = publishWorkflow.indexOf("run: node scripts/publish-raycast-pr.mjs");

assert.equal(
  publishCheckoutIndex < publishNodeIndex && publishNodeIndex < publishCommandIndex,
  true,
  "Raycast publish must select the release artifact Node.js before the nested npm install path",
);

const publishScript = await readFile("scripts/publish-raycast-pr.mjs", "utf8");
assert.equal(
  publishScript.includes('runCommand("npm", ["ci"]') &&
    publishScript.includes('runCommand("npx", ["--yes", "@raycast/api@latest", "publish"]'),
  true,
  "Raycast publish nested npm and npx commands must use the configured registry and latest official Raycast CLI",
);

const registryNeutralFiles = [
  "scripts/toolchain.mjs",
  "scripts/update-dependencies.mjs",
  "scripts/publish-raycast-pr.mjs",
  ".github/workflows/build.yml",
];
const registryOverrideMarkers = [
  "registry.npmjs.org",
  "NPM_CONFIG_REGISTRY",
  "NPM_CONFIG_USERCONFIG",
  "NPM_CONFIG_GLOBALCONFIG",
  "npm-registry-policy",
  "--registry=",
];
const registryOverrideLocations = [];

for (const filePath of registryNeutralFiles) {
  const contents = await readFile(filePath, "utf8");

  for (const marker of registryOverrideMarkers) {
    if (contents.includes(marker)) {
      registryOverrideLocations.push(`${filePath}: ${marker}`);
    }
  }
}

assert.deepEqual(
  registryOverrideLocations,
  [],
  "dependency acquisition, update, CI, and publish paths must inherit the configured registry",
);

const scriptPaths = (await readdir("scripts"))
  .filter((fileName) => fileName.endsWith(".mjs") && fileName !== "check-dependency-sources.mjs")
  .map((fileName) => `scripts/${fileName}`);
const globalNpmMutationPaths = [...scriptPaths, ...workflowPaths];
const globalNpmMutationLocations = [];

for (const filePath of globalNpmMutationPaths) {
  const contents = await readFile(filePath, "utf8");

  if (
    /\bnpm\s+(?:install|i|add|update|upgrade|uninstall|remove|rm)\b[^\n]*(?:--global|-g)(?:\s|$)/.test(contents) ||
    /\[\s*["'](?:install|i|add|update|upgrade|uninstall|remove|rm)["']\s*,\s*["'](?:--global|-g)["']/.test(contents)
  ) {
    globalNpmMutationLocations.push(filePath);
  }
}

assert.deepEqual(
  globalNpmMutationLocations,
  [],
  "project scripts and workflows must not install, update, replace, or remove global npm",
);

const duplicatedToolchainVersionFiles = [];

for (const filePath of workflowPaths) {
  const contents = await readFile(filePath);

  if (contents.includes(`node-version: ${selectedNodeVersion}`)) {
    duplicatedToolchainVersionFiles.push(filePath);
  }
}

assert.deepEqual(
  duplicatedToolchainVersionFiles,
  [],
  "workflow files must derive the Node.js version from .node-version",
);

console.log("dependency source and maintenance verification passed");

function packageNameFromLockfilePath(packagePath) {
  const nodeModulesSegment = "node_modules/";
  const packageLocation = packagePath.slice(packagePath.lastIndexOf(nodeModulesSegment) + nodeModulesSegment.length);
  const packagePathSegments = packageLocation.split("/");

  return packageLocation.startsWith("@") ? packagePathSegments.slice(0, 2).join("/") : packagePathSegments[0];
}

function majorMinor(version) {
  const match = typeof version === "string" && version.match(/^(\d+)\.(\d+)\.\d+$/);
  assert.ok(match, `expected an exact semantic version; received ${version}`);
  return `${match[1]}.${match[2]}`;
}

function findAllIndices(contents, value) {
  const indices = [];
  let searchIndex = 0;

  while ((searchIndex = contents.indexOf(value, searchIndex)) !== -1) {
    indices.push(searchIndex);
    searchIndex += value.length;
  }

  return indices;
}
