import assert from "node:assert/strict";
import test from "node:test";
import {
  applyMajorDependencyDeclarations,
  applyCompatibleDependencyUpdates,
  assertMaintenanceRuntime,
  classifyOutdated,
  formatRaycastTypeContractStatus,
  getDirectDependencyDowngrades,
  getDirectDependencyRangeDrift,
  getMajorUpdateCandidates,
  getRaycastNodeTypesContract,
  parseUpdateArguments,
} from "./update-dependencies.mjs";

const engines = { node: ">=22.22.2", npm: ">=11.17.0" };

test("accepts any dependency-maintenance runtime that satisfies package.json engines", () => {
  for (const [nodeVersion, npmVersion] of [
    ["22.22.2", "11.17.0"],
    ["24.19.0", "11.17.0"],
    ["26.6.0", "11.18.0"],
  ]) {
    assert.doesNotThrow(() => assertMaintenanceRuntime({ nodeVersion, npmVersion, engines }));
  }
});

test("rejects a Node.js version below package.json engines", () => {
  assert.throws(
    () => assertMaintenanceRuntime({ nodeVersion: "22.22.1", npmVersion: "11.17.0", engines }),
    /Node\.js 22\.22\.1 does not satisfy >=22\.22\.2/,
  );
});

test("rejects an npm version below package.json engines", () => {
  assert.throws(
    () => assertMaintenanceRuntime({ nodeVersion: "24.19.0", npmVersion: "11.16.9", engines }),
    /npm 11\.16\.9 does not satisfy >=11\.17\.0/,
  );
});

test("applies compatible updates with manifest persistence and install scripts disabled", async () => {
  const calls = [];

  await applyCompatibleDependencyUpdates(async (command, args) => {
    calls.push([command, args]);
  });

  assert.deepEqual(calls, [["npm", ["update", "--save", "--ignore-scripts"]]]);
});

test("requires one explicit supported flag before major-version updates", () => {
  assert.deepEqual(parseUpdateArguments([]), { allowMajor: false });
  assert.deepEqual(parseUpdateArguments(["--allow-major"]), { allowMajor: true });
  assert.throws(() => parseUpdateArguments(["--latest"]), /unsupported dependency update arguments: --latest/);
  assert.throws(
    () => parseUpdateArguments(["--allow-major", "--allow-major"]),
    /--allow-major may be specified only once/,
  );
});

test("selects all direct major candidates except dependencies owned by another type contract", () => {
  assert.deepEqual(
    getMajorUpdateCandidates(
      {
        "@raycast/api": { current: "1.104.25", wanted: "1.104.25", latest: "2.0.5" },
        "@types/node": { current: "22.19.17", wanted: "22.19.17", latest: "26.2.0" },
        react: { current: "19.2.8", wanted: "19.2.9", latest: "19.2.9" },
        typescript: { current: "6.0.3", wanted: "6.0.3", latest: "7.0.2" },
      },
      { contractManagedNames: new Set(["@types/node"]) },
    ),
    [
      { name: "@raycast/api", current: "1.104.25", wanted: "1.104.25", latest: "2.0.5" },
      { name: "typescript", current: "6.0.3", wanted: "6.0.3", latest: "7.0.2" },
    ],
  );
});

test("promotes major candidates together while preserving Raycast and TypeScript tooling contracts", () => {
  const packageJson = {
    dependencies: { "@raycast/api": "^1.104.25", react: "^19.2.8" },
    devDependencies: {
      "@raycast/eslint-config": "^2.2.0",
      "@types/node": "22.19.17",
      "@types/react": "^19.2.18",
      typescript: "^6.0.3",
    },
  };
  const candidates = [
    { name: "@raycast/api", current: "1.104.25", wanted: "1.104.25", latest: "2.0.5" },
    { name: "typescript", current: "6.0.3", wanted: "6.0.3", latest: "7.0.2" },
  ];

  const result = applyMajorDependencyDeclarations(packageJson, candidates, {
    raycastApiPackage: {
      dependencies: { "@types/node": "22.19.17" },
      peerDependencies: { "@types/node": "22.19.17" },
    },
    typeScriptCompatibilityVersion: "6.0.2",
  });

  assert.equal(result.packageJson.dependencies["@raycast/api"], "^2.0.5");
  assert.equal(result.packageJson.devDependencies["@types/node"], "22.19.17");
  assert.equal(result.packageJson.devDependencies["@typescript/native"], "npm:typescript@^7.0.2");
  assert.equal(result.packageJson.devDependencies.typescript, "npm:@typescript/typescript6@^6.0.2");
  assert.deepEqual(result.appliedUpdates, [
    "@raycast/api (^1.104.25 -> ^2.0.5)",
    "typescript (^6.0.3 -> TypeScript 7.0.2 CLI with @typescript/typescript6 6.0.2 tooling API)",
  ]);
  assert.equal(packageJson.dependencies["@raycast/api"], "^1.104.25");
  assert.equal(packageJson.devDependencies.typescript, "^6.0.3");
});

test("detects a manifest lower bound left behind its resolved direct dependency", () => {
  const packageJson = {
    dependencies: { "@raycast/api": "^1.104.23" },
  };
  const packageLock = {
    packages: {
      "node_modules/@raycast/api": { version: "1.104.24" },
    },
  };

  assert.deepEqual(getDirectDependencyRangeDrift(packageJson, packageLock), [
    {
      name: "@raycast/api",
      section: "dependencies",
      declaredRange: "^1.104.23",
      installedVersion: "1.104.24",
    },
  ]);

  packageJson.dependencies["@raycast/api"] = "^1.104.24";
  assert.deepEqual(getDirectDependencyRangeDrift(packageJson, packageLock), []);
});

test("checks npm alias lower bounds against their resolved direct versions", () => {
  const packageJson = {
    devDependencies: {
      "@typescript/native": "npm:typescript@^7.0.1",
      typescript: "npm:@typescript/typescript6@^6.0.1",
    },
  };
  const packageLock = {
    packages: {
      "node_modules/@typescript/native": { version: "7.0.2" },
      "node_modules/typescript": { version: "6.0.2" },
    },
  };

  assert.deepEqual(getDirectDependencyRangeDrift(packageJson, packageLock), [
    {
      name: "@typescript/native",
      section: "devDependencies",
      declaredRange: "npm:typescript@^7.0.1",
      installedVersion: "7.0.2",
    },
    {
      name: "typescript",
      section: "devDependencies",
      declaredRange: "npm:@typescript/typescript6@^6.0.1",
      installedVersion: "6.0.2",
    },
  ]);

  packageJson.devDependencies["@typescript/native"] = "npm:typescript@^7.0.2";
  packageJson.devDependencies.typescript = "npm:@typescript/typescript6@^6.0.2";
  assert.deepEqual(getDirectDependencyRangeDrift(packageJson, packageLock), []);
});

test("separates allowed updates from latest versions that require a maintainer decision", () => {
  assert.deepEqual(
    classifyOutdated(
      {
        react: { current: "19.2.8", wanted: "19.2.9", latest: "19.2.9" },
        "@types/node": { current: "22.19.17", wanted: "22.19.17", latest: "26.1.2" },
        typescript: { current: "6.0.3", wanted: "6.0.3", latest: "7.0.2" },
      },
      { contractManagedNames: new Set(["@types/node"]) },
    ),
    {
      allowedUpdatesPending: ["react (19.2.8 -> 19.2.9)"],
      contractManaged: [
        {
          name: "@types/node",
          selectedVersion: "22.19.17",
          latestVersion: "26.1.2",
        },
      ],
      maintainerDecisionRequired: ["typescript (6.0.3 -> 7.0.2)"],
    },
  );
});

test("reports a Raycast-managed type version without implying that registry latest was selected", () => {
  assert.deepEqual(
    formatRaycastTypeContractStatus(
      [
        {
          name: "@types/node",
          selectedVersion: "22.19.17",
          latestVersion: "26.2.0",
        },
      ],
      "2.0.5",
    ),
    [
      "@types/node: using 22.19.17 as required by @raycast/api 2.0.5.",
      "Registry latest for @types/node is 26.2.0 and was intentionally not selected.",
    ],
  );
});

test("reads one exact Node type contract from @raycast/api dependencies and optional peers", () => {
  assert.equal(
    getRaycastNodeTypesContract({
      dependencies: { "@types/node": "22.19.17" },
      peerDependencies: { "@types/node": "22.19.17" },
    }),
    "22.19.17",
  );

  assert.throws(
    () =>
      getRaycastNodeTypesContract({
        dependencies: { "@types/node": "22.19.17" },
        peerDependencies: { "@types/node": "22.20.1" },
      }),
    /must declare one exact @types\/node type contract/,
  );
});

test("detects a resolved direct dependency downgrade", () => {
  const packageJson = { dependencies: { react: "^19.2.8" } };
  const initialPackageLock = { packages: { "node_modules/react": { version: "19.2.8" } } };
  const finalPackageLock = { packages: { "node_modules/react": { version: "19.2.7" } } };

  assert.deepEqual(getDirectDependencyDowngrades(packageJson, initialPackageLock, packageJson, finalPackageLock), [
    { name: "react", initialVersion: "19.2.8", finalVersion: "19.2.7" },
  ]);
});

test("allows only the TypeScript 6 compatibility package identity transition", () => {
  const initialPackageJson = { devDependencies: { typescript: "^6.0.3" } };
  const finalPackageJson = {
    devDependencies: { typescript: "npm:@typescript/typescript6@^6.0.2" },
  };
  const initialPackageLock = { packages: { "node_modules/typescript": { version: "6.0.3" } } };
  const finalPackageLock = { packages: { "node_modules/typescript": { version: "6.0.2" } } };

  assert.deepEqual(
    getDirectDependencyDowngrades(initialPackageJson, initialPackageLock, finalPackageJson, finalPackageLock),
    [],
  );
});

test("rejects an unrelated direct npm alias package identity change", () => {
  const initialPackageJson = { devDependencies: { tool: "^1.0.0" } };
  const finalPackageJson = { devDependencies: { tool: "npm:other-tool@^2.0.0" } };
  const initialPackageLock = { packages: { "node_modules/tool": { version: "1.0.0" } } };
  const finalPackageLock = { packages: { "node_modules/tool": { version: "2.0.0" } } };

  assert.throws(
    () => getDirectDependencyDowngrades(initialPackageJson, initialPackageLock, finalPackageJson, finalPackageLock),
    /changed tool package identity from tool to other-tool/,
  );
});
