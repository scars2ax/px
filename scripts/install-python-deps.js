const fs = require("fs");
const spawn = require("child_process").spawn;

const IS_WINDOWS = process.platform === "win32";
const IS_DEV = process.env.NODE_ENV !== "production";

const installDeps = async () => {
  try {
    console.log("Installing additional optional dependencies...");
    console.log("Creating venv...");
    await maybeCreateVenv();
    console.log("Installing python dependencies...");
    await installPythonDependencies();
  } catch (error) {
    console.error("Error installing additional optional dependencies", error);
    process.exit(0); // don't fail the build
  }
};

installDeps();

async function maybeCreateVenv() {
  if (!IS_DEV) {
    console.log("Skipping venv creation in production");
    return true;
  }
  if (fs.existsSync(".venv")) {
    console.log("Skipping venv creation, already exists");
    return true;
  }
  const python = IS_WINDOWS ? "python" : "python3";
  await runCommand(`${python} -m venv .venv`);
  return true;
}

async function installPythonDependencies() {
  const commands = [];
  if (IS_DEV) {
    commands.push(
      IS_WINDOWS ? ".venv\\Scripts\\activate.bat" : "source .venv/bin/activate"
    );
  }
  const pip = IS_WINDOWS ? "pip" : "pip3";
  commands.push(`${pip} install -r requirements.txt`);

  const command = commands.join(" && ");
  await runCommand(command);
  return true;
}

async function runCommand(command) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [], { shell: true });
    child.stdout.on("data", (data) => {
      console.log(data.toString());
    });
    child.stderr.on("data", (data) => {
      console.error(data.toString());
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject();
      }
    });
  });
}
