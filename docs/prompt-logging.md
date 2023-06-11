# Prompt Logging

This proxy supports logging incoming prompts and model responses to different destinations.  Currently, Airtable and Google Sheets (not recommended) are supported.  You can enable prompt logging by setting the `PROMPT_LOGGING` environment variable to `true` and configuring the `PROMPT_LOGGING_BACKEND` environment variable to the desired logging backend.

The included backends are generally designed with the goal of working within the limitations of a service's free tier, such as strict API rate limits or maximum record limits.  As a result, they may be a little clunky to use and may not be as performant as a dedicated logging solution, but they should be sufficient for low-volume use cases. You can implement your own backend by exporting a module that implements the `PromptLoggingBackend` interface and wiring it up to `src/prompt-logging/log-queue.ts`.

Refer to the list below for the required configuration for each backend.

## Airtable

1. Create an Airtable.com account
2. Create a Personal Access Token
    1. Go to https://airtable.com/create/tokens/new and enter a name for your token
    2. Under **Scopes**, click **Add a scope** and assign the following scopes:
        - `data.records:read`
        - `data.records:write`
        - `schema.bases:read`
        - `schema.bases:write`
    3. Under **Access**, click **Add a base** and assign "All current and future bases in this workspace"
        - Create a new workspace for prompt logging if you don't want to give the script access to all your bases
    4. Click **Create token**
    5. A modal will appear with your token; copy it and set is as the `AIRTABLE_KEY` environment variable
3. Find your workspace ID
    - You can find your workspace ID by going to https://airtable.com/workspaces and selecting **View Workspace** on the workspace you want to use
    - The ID is the text beginning with `wsp` in the URL, after `airtable.com/workspaces/`
    - Set this value as the `AIRTABLE_WORKSPACE_ID` environment variable
4. Set the `PROMPT_LOGGING_BACKEND` environment variable to `airtable`

The proxy will handle creating and migrating bases for you.  The following bases will be created in the workspace you select:

- `oai-proxy-index`
    - Stores metadata about the proxy and the bases it creates
- `oai-proxy-logs-*`
    - Stores prompt logs
    - As free bases are limited in size, the proxy will create additional bases as needed

## Google Sheets (deprecated)

**⚠️ This implementation is strongly discouraged** due to the nature of content users may submit, which may be in violation of Google's policies.  They seem to analyze the content of API requests and may suspend your account.  Don't use this unless you know what you're doing.

Refer to the dedicated [Google Sheets docs](logging-sheets.md) for detailed instructions on how to set up Google Sheets logging.
