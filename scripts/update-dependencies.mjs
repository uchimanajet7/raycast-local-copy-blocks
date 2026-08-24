import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { compareVersions, parseMinimumNodeVersion, parseMinimumNpmVersion } from "./toolchain.mjs";

const execFileAsync = promisify(execFile);
const directDependencySections = ["dependencies", "devDependencies", "optionalDependencies"];
const raycastTypeContractManagedDependencies = new Set(["@types/node"]);
const allowMajorArgument = "--allow-major";
const typeScriptCompatibilityPackageName = "@typescript/typescript6";
const typeScriptNativeAliasName = "@typescript/native";

export async function updateDependencies({ repoRoot = process.cwd(), runCommand = run, allowMajor = false } = {}) {
  const execute = runCommand === run ? createCommandRunner(repoRoot) : runCommand;
  const repoRootUrl = pathToFileURL(`${repoRoot}/`);
  const packageJsonPath = new URL("package.json", repoRootUrl);
  const packageLockPath = new URL("package-lock.json", repoRootUrl);
  const initialPackageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  const initialPackageLock = JSON.parse(await readFile(packageLockPath, "utf8"));
  const runningNodeVersion = process.version.replace(/^v/, "");
  const runningNpmVersion = await readNpmVersion(execute);

  assertMaintenanceRuntime({
    nodeVersion: runningNodeVersion,
    npmVersion: runningNpmVersion,
    engines: initialPackageJson.engines,
  });
  console.log(
    `Dependency maintenance runtime satisfies package.json engines (Node.js ${runningNodeVersion}, npm ${runningNpmVersion}).`,
  );

  await execute("npm", ["run", "check:dependencies", "--", "--allow-direct-range-drift"]);
  await execute("npm", ["ci"]);
  await execute("npm", ["run", "migrate"]);
  const initialOutdated = await readOutdated(execute);
  printOutdatedReport("Dependency candidates before resolution:", initialOutdated);

  if (allowMajor) {
    const appliedMajorUpdates = await prepareMajorDependencyUpdates(repoRootUrl, initialOutdated, execute);
    if (appliedMajorUpdates.length > 0) {
      console.log(`Explicitly allowed major-version updates: ${appliedMajorUpdates.join(", ")}`);
    } else {
      console.log("No direct dependency has a major-version update to apply.");
    }
  }

  await applyCompatibleDependencyUpdates(execute);

  if (await alignNodeTypesWithRaycastTypeContract(repoRootUrl)) {
    await execute("npm", ["install", "--ignore-scripts"]);
  }

  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  const packageLock = JSON.parse(await readFile(packageLockPath, "utf8"));
  const rangeDrift = getDirectDependencyRangeDrift(packageJson, packageLock);
  const directDependencyDowngrades = getDirectDependencyDowngrades(
    initialPackageJson,
    initialPackageLock,
    packageJson,
    packageLock,
  );

  if (rangeDrift.length > 0) {
    throw new Error(
      `Dependency update left package.json lower bounds behind the resolved direct dependencies: ${formatRangeDrift(rangeDrift)}`,
    );
  }

  if (directDependencyDowngrades.length > 0) {
    throw new Error(
      `Dependency update would downgrade resolved direct dependencies: ${formatDirectDependencyDowngrades(directDependencyDowngrades)}`,
    );
  }

  const finalOutdated = await readOutdated(execute);
  const finalStatus = classifyOutdated(finalOutdated, {
    contractManagedNames: raycastTypeContractManagedDependencies,
  });
  const remainingMajorUpdates = getMajorUpdateCandidates(finalOutdated, {
    contractManagedNames: raycastTypeContractManagedDependencies,
  });
  printOutdatedReport("Dependency status after resolution:", finalOutdated);

  if (finalStatus.allowedUpdatesPending.length > 0) {
    throw new Error(
      `Dependency update did not apply all versions allowed by package.json: ${finalStatus.allowedUpdatesPending.join(", ")}`,
    );
  }

  if (allowMajor && remainingMajorUpdates.length > 0) {
    throw new Error(
      `Explicit major-version update did not apply every direct candidate: ${remainingMajorUpdates
        .map(({ name, wanted, latest }) => `${name} (${wanted} -> ${latest})`)
        .join(", ")}`,
    );
  }

  await execute("npm", ["run", "check:dependencies"]);
  await execute("npm", ["ci"]);
  await execute("npm", ["run", "lint"]);
  await execute("npm", ["run", "build"]);
  await execute("npm", ["run", "lint:raycast"]);

  console.log(
    allowMajor
      ? "Dependencies, including explicitly allowed major versions, updated and verified."
      : "Dependencies within declared ranges updated and verified.",
  );

  if (finalStatus.contractManaged.length > 0) {
    const resolvedRaycastApiVersion = packageLock.packages?.["node_modules/@raycast/api"]?.version;
    for (const line of formatRaycastTypeContractStatus(finalStatus.contractManaged, resolvedRaycastApiVersion)) {
      console.log(line);
    }
  }

  if (finalStatus.maintainerDecisionRequired.length > 0) {
    console.log(
      `Maintainer decision required for latest versions outside declared ranges: ${finalStatus.maintainerDecisionRequired.join(", ")}`,
    );
    if (!allowMajor && remainingMajorUpdates.length > 0) {
      console.log("Apply all direct major-version candidates with: npm run update:dependencies -- --allow-major");
    }
  } else {
    console.log("No unresolved dependency update decisions remain.");
  }
}

export function parseUpdateArguments(args) {
  const allowMajorCount = args.filter((argument) => argument === allowMajorArgument).length;
  const unexpectedArguments = args.filter((argument) => argument !== allowMajorArgument);

  if (unexpectedArguments.length > 0) {
    throw new Error(`unsupported dependency update arguments: ${unexpectedArguments.join(", ")}`);
  }

  if (allowMajorCount > 1) {
    throw new Error(`${allowMajorArgument} may be specified only once`);
  }

  return { allowMajor: allowMajorCount === 1 };
}

export function assertMaintenanceRuntime({ nodeVersion, npmVersion, engines }) {
  const minimumNodeVersion = parseMinimumNodeVersion(engines?.node);
  const minimumNpmVersion = parseMinimumNpmVersion(engines?.npm);
  const unsupported = [];

  if (compareVersions(nodeVersion, minimumNodeVersion) < 0) {
    unsupported.push(`Node.js ${nodeVersion} does not satisfy ${engines.node}`);
  }

  if (compareVersions(npmVersion, minimumNpmVersion) < 0) {
    unsupported.push(`npm ${npmVersion} does not satisfy ${engines.npm}`);
  }

  if (unsupported.length > 0) {
    throw new Error(`Dependency maintenance runtime is outside package.json engines: ${unsupported.join("; ")}`);
  }
}

export async function applyCompatibleDependencyUpdates(runCommand) {
  await runCommand("npm", ["update", "--save", "--ignore-scripts"]);
}

export function getMajorUpdateCandidates(outdated, { contractManagedNames = new Set() } = {}) {
  return Object.entries(outdated)
    .sort(([left], [right]) => left.localeCompare(right))
    .filter(
      ([name, details]) => !contractManagedNames.has(name) && isMajorVersionChange(details.wanted, details.latest),
    )
    .map(([name, details]) => ({
      name,
      current: details.current,
      wanted: details.wanted,
      latest: details.latest,
    }));
}

export function applyMajorDependencyDeclarations(
  packageJson,
  candidates,
  { raycastApiPackage = null, typeScriptCompatibilityVersion = null } = {},
) {
  const updatedPackageJson = structuredClone(packageJson);
  const appliedUpdates = [];

  for (const candidate of candidates) {
    const section = findDirectDependencySection(updatedPackageJson, candidate.name);
    const declaredRange = updatedPackageJson[section][candidate.name];

    if (candidate.name === "typescript" && versionMajor(candidate.latest) >= 7) {
      if (section !== "devDependencies") {
        throw new Error("TypeScript must remain a development dependency when adopting TypeScript 7 or later");
      }
      if (!/^\d+\.\d+\.\d+$/.test(typeScriptCompatibilityVersion ?? "")) {
        throw new Error("TypeScript 7 or later requires one exact @typescript/typescript6 compatibility version");
      }

      updatedPackageJson.devDependencies = insertScopedDevelopmentDependency(
        updatedPackageJson.devDependencies,
        typeScriptNativeAliasName,
        `npm:typescript@^${candidate.latest}`,
      );
      updatedPackageJson.devDependencies.typescript = `npm:${typeScriptCompatibilityPackageName}@^${typeScriptCompatibilityVersion}`;
      appliedUpdates.push(
        `typescript (${declaredRange} -> TypeScript ${candidate.latest} CLI with ${typeScriptCompatibilityPackageName} ${typeScriptCompatibilityVersion} tooling API)`,
      );
      continue;
    }

    const promotedRange = replaceDeclaredVersion(declaredRange, candidate.latest);
    updatedPackageJson[section][candidate.name] = promotedRange;
    appliedUpdates.push(`${candidate.name} (${declaredRange} -> ${promotedRange})`);

    if (candidate.name === "@raycast/api") {
      if (!raycastApiPackage) {
        throw new Error("A major @raycast/api update requires its registry package metadata");
      }
      const requiredNodeTypesVersion = getRaycastNodeTypesContract(raycastApiPackage);
      const declaredNodeTypesVersion = updatedPackageJson.devDependencies?.["@types/node"];
      if (!/^\d+\.\d+\.\d+$/.test(declaredNodeTypesVersion ?? "")) {
        throw new Error("package.json devDependencies must contain an exact @types/node version");
      }
      if (compareVersions(requiredNodeTypesVersion, declaredNodeTypesVersion) < 0) {
        throw new Error(
          `@raycast/api ${candidate.latest} requires @types/node ${requiredNodeTypesVersion}, which would downgrade the root type contract from ${declaredNodeTypesVersion}`,
        );
      }
      updatedPackageJson.devDependencies["@types/node"] = requiredNodeTypesVersion;
    }
  }

  return { packageJson: updatedPackageJson, appliedUpdates };
}

async function prepareMajorDependencyUpdates(repoRootUrl, outdated, runCommand) {
  const candidates = getMajorUpdateCandidates(outdated, {
    contractManagedNames: raycastTypeContractManagedDependencies,
  });
  if (candidates.length === 0) {
    return [];
  }

  const packageJsonPath = new URL("package.json", repoRootUrl);
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  const raycastCandidate = candidates.find(({ name }) => name === "@raycast/api");
  const typeScriptCandidate = candidates.find(({ name, latest }) => name === "typescript" && versionMajor(latest) >= 7);
  const [raycastApiPackage, typeScriptCompatibilityPackage] = await Promise.all([
    raycastCandidate ? readRegistryPackageMetadata(runCommand, raycastCandidate.name, raycastCandidate.latest) : null,
    typeScriptCandidate ? readRegistryPackageMetadata(runCommand, typeScriptCompatibilityPackageName, "latest") : null,
  ]);
  const result = applyMajorDependencyDeclarations(packageJson, candidates, {
    raycastApiPackage,
    typeScriptCompatibilityVersion: typeScriptCompatibilityPackage?.version,
  });

  await writeFile(packageJsonPath, `${JSON.stringify(result.packageJson, null, 2)}\n`);
  return result.appliedUpdates;
}

export async function alignNodeTypesWithRaycastTypeContract(repoRootUrl) {
  const packageJsonPath = new URL("package.json", repoRootUrl);
  const raycastApiPackagePath = new URL("node_modules/@raycast/api/package.json", repoRootUrl);
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  const raycastApiPackage = JSON.parse(await readFile(raycastApiPackagePath, "utf8"));
  const requiredNodeTypesVersion = getRaycastNodeTypesContract(raycastApiPackage);
  const declaredNodeTypesVersion = packageJson.devDependencies?.["@types/node"];

  if (!/^\d+\.\d+\.\d+$/.test(declaredNodeTypesVersion ?? "")) {
    throw new Error("package.json devDependencies must contain an exact @types/node version");
  }

  if (compareVersions(requiredNodeTypesVersion, declaredNodeTypesVersion) < 0) {
    throw new Error(
      `@raycast/api requires @types/node ${requiredNodeTypesVersion}, which would downgrade the root type contract from ${declaredNodeTypesVersion}`,
    );
  }

  if (declaredNodeTypesVersion === requiredNodeTypesVersion) {
    console.log(`@types/node matches the @raycast/api type contract (${requiredNodeTypesVersion}).`);
    return false;
  }

  packageJson.devDependencies["@types/node"] = requiredNodeTypesVersion;
  await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
  console.log(`Aligned @types/node with the @raycast/api type contract (${requiredNodeTypesVersion}).`);
  return true;
}

export function getRaycastNodeTypesContract(raycastApiPackage) {
  const contracts = [
    raycastApiPackage.dependencies?.["@types/node"],
    raycastApiPackage.peerDependencies?.["@types/node"],
  ].filter(Boolean);
  const uniqueContracts = [...new Set(contracts)];

  if (uniqueContracts.length !== 1 || !/^\d+\.\d+\.\d+$/.test(uniqueContracts[0])) {
    throw new Error(
      `@raycast/api must declare one exact @types/node type contract; received ${uniqueContracts.join(", ") || "none"}`,
    );
  }

  return uniqueContracts[0];
}

export function classifyOutdated(outdated, { contractManagedNames = new Set() } = {}) {
  const allowedUpdatesPending = [];
  const contractManaged = [];
  const maintainerDecisionRequired = [];

  for (const [name, details] of Object.entries(outdated).sort(([left], [right]) => left.localeCompare(right))) {
    if (details.current !== details.wanted) {
      allowedUpdatesPending.push(`${name} (${details.current ?? "missing"} -> ${details.wanted})`);
    } else if (details.wanted !== details.latest) {
      const update = `${name} (${details.wanted} -> ${details.latest})`;
      if (contractManagedNames.has(name)) {
        contractManaged.push({
          name,
          selectedVersion: details.wanted,
          latestVersion: details.latest,
        });
      } else {
        maintainerDecisionRequired.push(update);
      }
    }
  }

  return { allowedUpdatesPending, contractManaged, maintainerDecisionRequired };
}

export function formatRaycastTypeContractStatus(contractManaged, resolvedRaycastApiVersion) {
  if (!/^\d+\.\d+\.\d+$/.test(resolvedRaycastApiVersion ?? "")) {
    throw new Error("package-lock.json must resolve one exact @raycast/api version for type contract reporting");
  }

  return contractManaged.flatMap(({ name, selectedVersion, latestVersion }) => [
    `${name}: using ${selectedVersion} as required by @raycast/api ${resolvedRaycastApiVersion}.`,
    `Registry latest for ${name} is ${latestVersion} and was intentionally not selected.`,
  ]);
}

export function getDirectDependencyRangeDrift(packageJson, packageLock) {
  const drift = [];

  for (const section of directDependencySections) {
    for (const [name, declaredRange] of Object.entries(packageJson[section] ?? {})) {
      const declaredLowerBound = getDeclaredLowerBound(declaredRange);
      const installedVersion = packageLock.packages?.[`node_modules/${name}`]?.version;

      if (!declaredLowerBound || !installedVersion) {
        continue;
      }

      if (declaredLowerBound !== installedVersion) {
        drift.push({ name, section, declaredRange, installedVersion });
      }
    }
  }

  return drift.sort((left, right) => left.name.localeCompare(right.name));
}

export function getDirectDependencyDowngrades(
  initialPackageJson,
  initialPackageLock,
  finalPackageJson,
  finalPackageLock,
) {
  const initialVersions = getResolvedDirectDependencyVersions(initialPackageJson, initialPackageLock);
  const finalVersions = getResolvedDirectDependencyVersions(finalPackageJson, finalPackageLock);
  const downgrades = [];

  for (const [name, initialDependency] of initialVersions) {
    const finalDependency = finalVersions.get(name);

    if (!finalDependency) {
      continue;
    }

    if (finalDependency.identity !== initialDependency.identity) {
      const isTypeScriptCompatibilityTransition =
        name === "typescript" &&
        initialDependency.identity === "typescript" &&
        finalDependency.identity === typeScriptCompatibilityPackageName;

      if (!isTypeScriptCompatibilityTransition) {
        throw new Error(
          `Dependency update changed ${name} package identity from ${initialDependency.identity} to ${finalDependency.identity}`,
        );
      }
      continue;
    }

    if (compareVersions(finalDependency.version, initialDependency.version) < 0) {
      downgrades.push({
        name,
        initialVersion: initialDependency.version,
        finalVersion: finalDependency.version,
      });
    }
  }

  return downgrades.sort((left, right) => left.name.localeCompare(right.name));
}

function formatRangeDrift(rangeDrift) {
  return rangeDrift
    .map(({ name, declaredRange, installedVersion }) => `${name} (${declaredRange}, resolved ${installedVersion})`)
    .join(", ");
}

function formatDirectDependencyDowngrades(downgrades) {
  return downgrades
    .map(({ name, initialVersion, finalVersion }) => `${name} (${initialVersion} -> ${finalVersion})`)
    .join(", ");
}

function getResolvedDirectDependencyVersions(packageJson, packageLock) {
  const dependencies = directDependencySections.flatMap((section) => Object.entries(packageJson[section] ?? {}));

  return new Map(
    dependencies
      .map(([name, declaredRange]) => [
        name,
        {
          identity: getDeclaredPackageIdentity(name, declaredRange),
          version: packageLock.packages?.[`node_modules/${name}`]?.version,
        },
      ])
      .filter(([, details]) => typeof details.version === "string"),
  );
}

async function readRegistryPackageMetadata(runCommand, name, version) {
  const result = await runCommand(
    "npm",
    ["view", `${name}@${version}`, "version", "dependencies", "peerDependencies", "bin", "--json"],
    { writeOutput: false },
  );
  const output = result.stdout?.trim();

  if (!output) {
    throw new Error(`npm view did not return package metadata for ${name}@${version}`);
  }

  const metadata = JSON.parse(output);
  if (Array.isArray(metadata) || metadata === null || typeof metadata !== "object") {
    throw new Error(`npm view did not return one package object for ${name}@${version}`);
  }
  return metadata;
}

function findDirectDependencySection(packageJson, name) {
  const sections = directDependencySections.filter((section) => Object.hasOwn(packageJson[section] ?? {}, name));
  if (sections.length !== 1) {
    throw new Error(`${name} must belong to exactly one direct dependency section`);
  }
  return sections[0];
}

function replaceDeclaredVersion(declaredRange, latestVersion) {
  const directRange = typeof declaredRange === "string" && declaredRange.match(/^(\^|~)?\d+\.\d+\.\d+$/);
  if (directRange) {
    return `${directRange[1] ?? ""}${latestVersion}`;
  }

  const aliasRange = typeof declaredRange === "string" && declaredRange.match(/^(npm:.+@)(\^|~)?\d+\.\d+\.\d+$/);
  if (aliasRange) {
    return `${aliasRange[1]}${aliasRange[2] ?? ""}${latestVersion}`;
  }

  throw new Error(`cannot promote unsupported direct dependency declaration: ${declaredRange}`);
}

function getDeclaredLowerBound(declaredRange) {
  if (typeof declaredRange !== "string") {
    return null;
  }
  return (
    declaredRange.match(/^(?:\^|~)?(\d+\.\d+\.\d+)$/)?.[1] ??
    declaredRange.match(/^npm:.+@(?:\^|~)?(\d+\.\d+\.\d+)$/)?.[1] ??
    null
  );
}

function getDeclaredPackageIdentity(name, declaredRange) {
  if (typeof declaredRange !== "string") {
    return name;
  }
  return declaredRange.match(/^npm:(.+)@(?:\^|~)?\d+\.\d+\.\d+$/)?.[1] ?? name;
}

function insertScopedDevelopmentDependency(dependencies, name, declaredRange) {
  if (Object.hasOwn(dependencies, name)) {
    return { ...dependencies, [name]: declaredRange };
  }

  const result = {};
  let inserted = false;
  for (const [dependencyName, dependencyRange] of Object.entries(dependencies)) {
    if (!inserted && !dependencyName.startsWith("@")) {
      result[name] = declaredRange;
      inserted = true;
    }
    result[dependencyName] = dependencyRange;
  }
  if (!inserted) {
    result[name] = declaredRange;
  }
  return result;
}

function isMajorVersionChange(wanted, latest) {
  const wantedMajor = versionMajor(wanted);
  const latestMajor = versionMajor(latest);
  return wantedMajor !== null && latestMajor !== null && wantedMajor !== latestMajor;
}

function versionMajor(version) {
  const match = typeof version === "string" && version.match(/^(\d+)\.\d+\.\d+$/);
  return match ? Number(match[1]) : null;
}

async function readNpmVersion(runCommand) {
  const result = await runCommand("npm", ["--version"], { writeOutput: false });
  return result.stdout?.trim() ?? "";
}

async function readOutdated(runCommand) {
  const result = await runCommand("npm", ["outdated", "--json", "--long"], {
    acceptedExitCodes: [0, 1],
    writeOutput: false,
  });
  const output = result.stdout?.trim();

  if (!output) {
    return {};
  }

  const outdated = JSON.parse(output);

  if (Array.isArray(outdated) || outdated === null || typeof outdated !== "object") {
    throw new Error("npm outdated did not return a dependency object");
  }

  return outdated;
}

function printOutdatedReport(label, outdated) {
  console.log(label);

  const entries = Object.entries(outdated).sort(([left], [right]) => left.localeCompare(right));

  if (entries.length === 0) {
    console.log("  None");
    return;
  }

  for (const [name, details] of entries) {
    console.log(
      `  ${name}: current ${details.current ?? "missing"}, wanted ${details.wanted}, latest ${details.latest}`,
    );
  }
}

function createCommandRunner(repoRoot) {
  return (command, args, options) => run(command, args, options, repoRoot);
}

async function run(command, args, { acceptedExitCodes = [0], writeOutput = true } = {}, repoRoot = process.cwd()) {
  console.log(`> ${[command, ...args].join(" ")}`);

  try {
    const result = await execFileAsync(command, args, commandOptions(repoRoot));
    if (writeOutput) {
      writeCommandOutput(result);
    }
    return result;
  } catch (error) {
    if (acceptedExitCodes.includes(Number(error.code))) {
      if (writeOutput) {
        writeCommandOutput(error);
      }
      return error;
    }

    writeCommandOutput(error);
    console.error(
      "Dependency update stopped. Review the command output and current working-tree changes before deciding the next step.",
    );
    throw error;
  }
}

function commandOptions(repoRoot) {
  return {
    cwd: repoRoot,
    maxBuffer: 1024 * 1024 * 20,
  };
}

function writeCommandOutput(result) {
  if (result.stdout) {
    process.stdout.write(result.stdout);
  }

  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await updateDependencies(parseUpdateArguments(process.argv.slice(2)));
}
