# Optional Dependencies
## Claude tokenizer
As Anthropic does not ship a NodeJS tokenizer, the server includes a small Python script that runs alongside the proxy to tokenize Claude requests. It is automatically started when the server is launched, but requires additional dependencies to be installed. If these dependencies are not installed, the server will not be able to accurately count the number of tokens in Claude requests but will still function normally otherwise.

Note: On Windows, a Windows Firewall prompt may appear when the Claude tokenizer is started. This is normal and is caused by the Python process attempting to open a socket to communicate with the NodeJS server. You can safely allow the connection.

### Automatic installation (local development)
This will create a venv and install the required dependencies. You still need to activate the venv when running the server, and you must have Python >= 3.8.0 installed.
1. Install Python >= 3.8.0
2. Run `npm install`, which should automatically create a venv and install the required dependencies.
3. Activate the virtual environment with `source .venv/bin/activate` (Linux/Mac) or `.\.venv\Scripts\activate` (PowerShell/Windows)
    - **This step is required every time you start the server from a new terminal.**

### Manual installation (local development)
1. Install Python >= 3.8.0
2. Create a virtual environment using `python -m .venv venv`
3. Activate the virtual environment with `source .venv/bin/activate` (Linux/Mac) or `.\.venv\Scripts\activate` (PowerShell/Windows)
    - **This step is required every time you start the server from a new terminal.**
4. Install dependencies with `pip install -r requirements.txt`
5. Provided you have the virtual environment activated, the server will automatically start the tokenizer when it is launched.

### Docker (production deployment)
Refer to the reference Dockerfiles for examples on how to install the tokenizer. The Huggingface and Render Dockerfiles both include the tokenizer.

Generally, you will need libzmq3-dev, cmake, g++, and Python >= 3.8.0 installed. The postinstall script will automatically install the required Python dependencies.

### Troubleshooting
Ensure that:
- Python >= 3.8 is installed and in your PATH
- Python dependencies are installed (re-run `npm install`)
- Python venv is activated (see above)
- zeromq optional dependency installed successfully
  - This should generally be installed automatically.
  - On Windows, you may need to install MS C++ Build Tools or set msvs_version (eg `npm config set msvs_version 2019`), then re-run npm install.
  - On Linux, ensure you have the appropriate build tools and headers installed for your distribution; refer to the reference Dockerfiles for examples.
